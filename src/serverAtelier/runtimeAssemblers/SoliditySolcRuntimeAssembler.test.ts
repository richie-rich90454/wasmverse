import { describe, expect, test } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BuildContextRecord } from "@sharedKernel/BuildContextRecord.ts";
import {
    SoliditySolcRuntimeAssembler,
    SOLC_WORKER_SOURCE,
} from "@serverAtelier/runtimeAssemblers/SoliditySolcRuntimeAssembler.ts";
import { FileSystemOperations } from "@serverAtelier/utilities/FileSystemOperations.ts";
const FAKE_SOLJSON_TEXT = "// fake soljson bundle\n";
function buildContext(runtimeDirectory: string): BuildContextRecord {
    return {
        sessionIdentifier: "test-session",
        sessionDirectory: "sessions/test-session",
        sourceDirectory: "sessions/test-session/source",
        runtimeDirectory,
        userCodeDirectory: "sessions/test-session/dist/user-code",
        entryFileRelativePath: "main.sol",
        programArguments: [],
        languageIdentifier: "solidity",
    };
}
type SolidityImportCallback = (
    context: number,
    kind: number,
    data: number,
    contents: number,
    error: number,
) => void;
interface FakeSolidityModuleState {
    strings: Map<number, string>;
    pointerTargets: Map<number, number>;
    callbacks: Map<number, SolidityImportCallback>;
    compileInputs: Array<string>;
    compileInvocation: (callback: SolidityImportCallback) => void;
    nextPointer: number;
}
function createFakeSolidityModuleState(): FakeSolidityModuleState {
    return {
        strings: new Map<number, string>(),
        pointerTargets: new Map<number, number>(),
        callbacks: new Map<number, SolidityImportCallback>(),
        compileInputs: [],
        compileInvocation: () => {},
        nextPointer: 1000,
    };
}
function allocatePointer(state: FakeSolidityModuleState): number {
    const pointer = state.nextPointer;
    state.nextPointer += 1;
    return pointer;
}
function createFakeSolidityModule(state: FakeSolidityModuleState): Record<string, unknown> {
    return {
        cwrap: (name: string): unknown => {
            if (name === "solidity_version") {
                return () => "0.8.37+fake";
            }
            if (name === "solidity_alloc") {
                return () => allocatePointer(state);
            }
            if (name === "solidity_compile") {
                return (inputJson: string, callbackPointer: number): string => {
                    state.compileInputs.push(inputJson);
                    const callback = state.callbacks.get(callbackPointer);
                    if (!callback) {
                        throw new Error("solidity_compile ran without a registered callback");
                    }
                    state.compileInvocation(callback);
                    return '{"compiled":true}';
                };
            }
            throw new Error(`Unexpected cwrap name: ${name}`);
        },
        addFunction: (callback: SolidityImportCallback): number => {
            const pointer = allocatePointer(state);
            state.callbacks.set(pointer, callback);
            return pointer;
        },
        removeFunction: (pointer: number): void => {
            state.callbacks.delete(pointer);
        },
        UTF8ToString: (pointer: number): string => state.strings.get(pointer) ?? "",
        lengthBytesUTF8: (text: string): number => text.length,
        stringToUTF8: (text: string, pointer: number): void => {
            state.strings.set(pointer, text);
        },
        setValue: (pointer: number, value: number): void => {
            state.pointerTargets.set(pointer, value);
        },
    };
}
function writtenStringAt(state: FakeSolidityModuleState, pointer: number): string {
    return state.strings.get(state.pointerTargets.get(pointer) as number) ?? "";
}
interface WorkerHarness {
    sandboxSelf: Record<string, unknown>;
    postedMessages: Array<Record<string, unknown>>;
    importScriptsCalls: Array<string>;
    state: FakeSolidityModuleState;
}
function createWorkerHarness(options: { importScriptsFails?: boolean } = {}): WorkerHarness {
    const postedMessages: Array<Record<string, unknown>> = [];
    const importScriptsCalls: Array<string> = [];
    const state = createFakeSolidityModuleState();
    const sandboxSelf: Record<string, unknown> = {
        postMessage: (message: Record<string, unknown>): void => {
            postedMessages.push(message);
        },
    };
    const importScripts = (scriptUrl: string): void => {
        importScriptsCalls.push(scriptUrl);
        if (options.importScriptsFails) {
            throw new Error("the compiler script failed to load");
        }
        const moduleRecord = sandboxSelf.Module as Record<string, unknown>;
        Object.assign(moduleRecord, createFakeSolidityModule(state));
        (moduleRecord.onRuntimeInitialized as () => void)();
    };
    const runWorkerSource = new Function("self", "importScripts", SOLC_WORKER_SOURCE);
    runWorkerSource(sandboxSelf, importScripts);
    return { sandboxSelf, postedMessages, importScriptsCalls, state };
}
function postMessageToWorker(harness: WorkerHarness, message: Record<string, unknown>): void {
    const onmessage = harness.sandboxSelf.onmessage as (event: { data: unknown }) => void;
    onmessage({ data: message });
}
async function settleWorkerMessages(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 0));
}
describe("SoliditySolcRuntimeAssembler", () => {
    test("copies the solc bundle and writes the compile worker script", async () => {
        const fixtureDirectory = await mkdtemp(join(tmpdir(), "wasmverse-solidity-"));
        try {
            const packageDirectory = join(fixtureDirectory, "solc");
            const runtimeDirectory = join(fixtureDirectory, "runtime");
            const fileSystemOperations = new FileSystemOperations();
            await fileSystemOperations.ensureDirectoryExists(packageDirectory);
            await writeFile(join(packageDirectory, "soljson.js"), FAKE_SOLJSON_TEXT);
            const assembler = new SoliditySolcRuntimeAssembler(
                fileSystemOperations,
                packageDirectory,
            );
            await assembler.assembleRuntimeInto(buildContext(runtimeDirectory));
            expect(await readFile(join(runtimeDirectory, "solidity/soljson.js"), "utf8")).toBe(
                FAKE_SOLJSON_TEXT,
            );
            expect(await readFile(join(runtimeDirectory, "solidity/solc-worker.js"), "utf8")).toBe(
                SOLC_WORKER_SOURCE,
            );
        } finally {
            await rm(fixtureDirectory, { recursive: true, force: true });
        }
    });
    test("fails clearly when the solc bundle is missing", async () => {
        const fixtureDirectory = await mkdtemp(join(tmpdir(), "wasmverse-solidity-missing-"));
        try {
            const assembler = new SoliditySolcRuntimeAssembler(
                new FileSystemOperations(),
                join(fixtureDirectory, "solc"),
            );
            await expect(
                assembler.assembleRuntimeInto(buildContext(join(fixtureDirectory, "runtime"))),
            ).rejects.toThrow("Run pnpm install");
        } finally {
            await rm(fixtureDirectory, { recursive: true, force: true });
        }
    });
});
describe("solc compile worker source", () => {
    test("answers a load request with the compiler version", async () => {
        const harness = createWorkerHarness();
        postMessageToWorker(harness, {
            kind: "load",
            requestIdentifier: 5,
            soljsonScriptUrl: "https://example.test/soljson.js",
        });
        await settleWorkerMessages();
        expect(harness.importScriptsCalls).toEqual(["https://example.test/soljson.js"]);
        expect(harness.postedMessages).toEqual([
            { requestIdentifier: 5, kind: "loaded", version: "0.8.37+fake" },
        ]);
    });
    test("answers a failed load request with a readable message", async () => {
        const harness = createWorkerHarness({ importScriptsFails: true });
        postMessageToWorker(harness, {
            kind: "load",
            requestIdentifier: 6,
            soljsonScriptUrl: "https://example.test/soljson.js",
        });
        await settleWorkerMessages();
        expect(harness.postedMessages).toEqual([
            {
                requestIdentifier: 6,
                kind: "failed",
                message: "the compiler script failed to load",
            },
        ]);
    });
    test("compiles and resolves imports against the standard json sources", async () => {
        const harness = createWorkerHarness();
        let importedContents = "";
        harness.state.compileInvocation = (callback) => {
            const kindPointer = allocatePointer(harness.state);
            const importPathPointer = allocatePointer(harness.state);
            const contentsPointer = allocatePointer(harness.state);
            const errorPointer = allocatePointer(harness.state);
            harness.state.strings.set(kindPointer, "source");
            harness.state.strings.set(importPathPointer, "./helper.sol");
            callback(0, kindPointer, importPathPointer, contentsPointer, errorPointer);
            importedContents = writtenStringAt(harness.state, contentsPointer);
        };
        postMessageToWorker(harness, {
            kind: "load",
            requestIdentifier: 1,
            soljsonScriptUrl: "https://example.test/soljson.js",
        });
        await settleWorkerMessages();
        const inputJson = JSON.stringify({
            language: "Solidity",
            sources: {
                "nested/main.sol": { content: "import './helper.sol';" },
                "nested/helper.sol": { content: "library Helper {}" },
            },
        });
        postMessageToWorker(harness, {
            kind: "compile",
            requestIdentifier: 2,
            inputJson,
            entryRelativePath: "nested/main.sol",
        });
        expect(harness.postedMessages[1]).toEqual({
            requestIdentifier: 2,
            kind: "compiled",
            outputJson: '{"compiled":true}',
        });
        expect(harness.state.compileInputs).toEqual([inputJson]);
        expect(importedContents).toBe("library Helper {}");
    });
    test("writes the source-not-found error for unresolved imports", async () => {
        const harness = createWorkerHarness();
        let errorContents = "";
        harness.state.compileInvocation = (callback) => {
            const kindPointer = allocatePointer(harness.state);
            const importPathPointer = allocatePointer(harness.state);
            const contentsPointer = allocatePointer(harness.state);
            const errorPointer = allocatePointer(harness.state);
            harness.state.strings.set(kindPointer, "source");
            harness.state.strings.set(importPathPointer, "missing.sol");
            callback(0, kindPointer, importPathPointer, contentsPointer, errorPointer);
            errorContents = writtenStringAt(harness.state, errorPointer);
        };
        postMessageToWorker(harness, {
            kind: "load",
            requestIdentifier: 1,
            soljsonScriptUrl: "https://example.test/soljson.js",
        });
        await settleWorkerMessages();
        postMessageToWorker(harness, {
            kind: "compile",
            requestIdentifier: 2,
            inputJson: JSON.stringify({ language: "Solidity", sources: {} }),
            entryRelativePath: "main.sol",
        });
        expect(errorContents).toBe("Source not found: missing.sol");
    });
    test("answers a failed compile request with a readable message", async () => {
        const harness = createWorkerHarness();
        harness.state.compileInvocation = () => {
            throw new Error("stack too deep");
        };
        postMessageToWorker(harness, {
            kind: "load",
            requestIdentifier: 1,
            soljsonScriptUrl: "https://example.test/soljson.js",
        });
        await settleWorkerMessages();
        postMessageToWorker(harness, {
            kind: "compile",
            requestIdentifier: 2,
            inputJson: '{"language":"Solidity","sources":{}}',
            entryRelativePath: "main.sol",
        });
        expect(harness.postedMessages[1]).toEqual({
            requestIdentifier: 2,
            kind: "failed",
            message: "stack too deep",
        });
    });
});
