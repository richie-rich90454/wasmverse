import { afterEach, describe, expect, test } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { BuildContextRecord } from "@sharedKernel/BuildContextRecord.ts";
import type { TerminalStageController } from "@clientTheatre/services/TerminalStageController.ts";
import { DartWasmPerformer } from "@clientTheatre/runtimePerformers/DartWasmPerformer.ts";
import { DartWasmGlueRuntimeAssembler } from "@serverAtelier/runtimeAssemblers/DartWasmGlueRuntimeAssembler.ts";
import { FileSystemOperations } from "@serverAtelier/utilities/FileSystemOperations.ts";
const originalFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL) => {
    const requestUrl = String(input);
    if (requestUrl.startsWith("file:")) {
        return new Response(await readFile(fileURLToPath(requestUrl)));
    }
    return originalFetch(input);
}) as typeof fetch;
class RecordingStage {
    readonly shownLines: Array<string> = [];
    readonly writtenText: Array<string> = [];
    readonly readPrompts: Array<string> = [];
    private readonly fedAnswers: Array<string>;
    constructor(fedAnswers: Array<string> = []) {
        this.fedAnswers = [...fedAnswers];
    }
    writeLine(line: string): void {
        this.shownLines.push(line);
    }
    writeText(text: string): void {
        this.writtenText.push(text);
    }
    async readLine(promptText: string): Promise<string> {
        this.readPrompts.push(promptText);
        const answer = this.fedAnswers.shift();
        if (answer === undefined) {
            throw new Error("The test stage has no fed answer left.");
        }
        return answer;
    }
    shownOutput(): string {
        return this.writtenText.join("");
    }
}
const FAKE_APP_SOURCE = [
    "export async function compile(bytes) {",
    "    return {",
    "        instantiate: async () => ({",
    "            invokeMain(...applicationArguments) {",
    "                globalThis.$dartAttemptCount = (globalThis.$dartAttemptCount ?? 0) + 1;",
    "                const print = globalThis.dartPrint;",
    "                print('args:' + applicationArguments.join(','));",
    "                if (globalThis.$dartSignalPrinted === true && globalThis.$dartAttemptCount === 1) {",
    "                    print('TerminalInputNeededSignal: TERMINAL_INPUT_NEEDED\\n    at fake');",
    "                    return;",
    "                }",
    "                if (globalThis.$dartSyncError === true) {",
    "                    print('InvalidProbeError: exploded');",
    "                    throw { toString: () => '[object WebAssembly.Exception]' };",
    "                }",
    "                if (globalThis.$dartReadsLine === true) {",
    "                    print('line:' + globalThis.WasmVerseHost.readLine());",
    "                }",
    "                print('file:' + globalThis.WasmVerseHost.readFile('data/notes.txt'));",
    "                print('files:' + globalThis.WasmVerseHost.listFiles().join('|'));",
    "            },",
    "        }),",
    "    };",
    "}",
    "",
].join("\n");
const MANIFEST = JSON.stringify({
    entryFileRelativePath: "main.dart",
    includedFileRelativePaths: ["main.dart", "data/notes.txt"],
    programArguments: ["alpha"],
});
const temporaryDirectories: Array<string> = [];
async function createSessionLayout(fedAnswers: Array<string> = []): Promise<{
    stage: RecordingStage;
    performer: DartWasmPerformer;
}> {
    const sessionRoot = await mkdtemp(join(tmpdir(), "wasmverse-dart-performer-"));
    temporaryDirectories.push(sessionRoot);
    const runtimeDirectory = join(sessionRoot, "runtime");
    const userCodeDirectory = join(sessionRoot, "user-code");
    await mkdir(join(userCodeDirectory, "data"), { recursive: true });
    const context: BuildContextRecord = {
        sessionIdentifier: "test-session",
        sessionDirectory: sessionRoot,
        sourceDirectory: join(sessionRoot, "source"),
        runtimeDirectory,
        userCodeDirectory,
        entryFileRelativePath: "main.dart",
        programArguments: [],
        languageIdentifier: "dart",
    };
    await new DartWasmGlueRuntimeAssembler(new FileSystemOperations()).assembleRuntimeInto(context);
    await writeFile(join(runtimeDirectory, "app.wasm.js"), FAKE_APP_SOURCE);
    await writeFile(join(runtimeDirectory, "app.wasm"), "fake-wasm-bytes");
    await writeFile(join(userCodeDirectory, "manifest.json"), MANIFEST);
    await writeFile(join(userCodeDirectory, "main.dart"), "void main() {}\n");
    await writeFile(join(userCodeDirectory, "data", "notes.txt"), "file-content");
    return {
        stage: new RecordingStage(fedAnswers),
        performer: new DartWasmPerformer(pathToFileURL(sessionRoot).href),
    };
}
afterEach(async () => {
    delete (globalThis as Record<string, unknown>)["$dartAttemptCount"];
    delete (globalThis as Record<string, unknown>)["$dartSignalPrinted"];
    delete (globalThis as Record<string, unknown>)["$dartSyncError"];
    delete (globalThis as Record<string, unknown>)["$dartReadsLine"];
    delete (globalThis as Record<string, unknown>)["dartPrint"];
    delete (globalThis as Record<string, unknown>)["WasmVerseHost"];
    while (temporaryDirectories.length > 0) {
        await rm(temporaryDirectories.pop() as string, { recursive: true, force: true });
    }
});
describe("DartWasmPerformer", () => {
    test("passes arguments and hosts user files through the bridge", async () => {
        const { stage, performer } = await createSessionLayout();
        await performer.loadInto(stage as unknown as TerminalStageController);
        const originalLog = console.log;
        await performer.performOn(stage as unknown as TerminalStageController);
        expect(console.log).toBe(originalLog);
        expect(typeof (globalThis as Record<string, unknown>)["dartPrint"]).toBe("function");
        expect(stage.shownLines).toContain("Dart WASM runtime ready.");
        expect(stage.shownLines).toContain("Running Dart main.");
        expect(stage.shownOutput()).toBe(
            "args:main.dart,alpha\nfile:file-content\nfiles:main.dart|data/notes.txt\n",
        );
        expect(stage.readPrompts).toEqual([]);
        expect((globalThis as Record<string, unknown>)["$dartAttemptCount"]).toBe(1);
    });
    test("detects the printed input marker, prompts, and reads the fed line on a fresh instance", async () => {
        (globalThis as Record<string, unknown>)["$dartSignalPrinted"] = true;
        (globalThis as Record<string, unknown>)["$dartReadsLine"] = true;
        const { stage, performer } = await createSessionLayout(["second-answer"]);
        await performer.loadInto(stage as unknown as TerminalStageController);
        await performer.performOn(stage as unknown as TerminalStageController);
        expect(stage.readPrompts).toEqual([""]);
        expect((globalThis as Record<string, unknown>)["$dartAttemptCount"]).toBe(2);
        expect(stage.shownOutput()).toBe(
            "args:main.dart,alpha\nline:second-answer\nfile:file-content\nfiles:main.dart|data/notes.txt\n",
        );
    });
    test("reports a readable line when a synchronous dart error crosses the wasm boundary", async () => {
        (globalThis as Record<string, unknown>)["$dartSyncError"] = true;
        const { stage, performer } = await createSessionLayout();
        await performer.loadInto(stage as unknown as TerminalStageController);
        const performPromise = performer.performOn(stage as unknown as TerminalStageController);
        await expect(performPromise).rejects.toThrow("InvalidProbeError: exploded");
        expect(stage.shownOutput()).toBe("args:main.dart,alpha\nInvalidProbeError: exploded\n");
    });
});
