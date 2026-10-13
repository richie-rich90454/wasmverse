import { afterEach, describe, expect, test } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { BuildContextRecord } from "@sharedKernel/BuildContextRecord.ts";
import { BlazorGlueRuntimeAssembler } from "@serverAtelier/runtimeAssemblers/BlazorGlueRuntimeAssembler.ts";
import { DartWasmGlueRuntimeAssembler } from "@serverAtelier/runtimeAssemblers/DartWasmGlueRuntimeAssembler.ts";
import { TeaVmGlueRuntimeAssembler } from "@serverAtelier/runtimeAssemblers/TeaVmGlueRuntimeAssembler.ts";
import { FileSystemOperations } from "@serverAtelier/utilities/FileSystemOperations.ts";
const temporaryDirectories: Array<string> = [];
async function createRuntimeDirectory(): Promise<string> {
    const directory = await mkdtemp(join(tmpdir(), "wasmverse-glue-"));
    temporaryDirectories.push(directory);
    return directory;
}
function buildContext(runtimeDirectory: string): BuildContextRecord {
    return {
        sessionIdentifier: "test-session",
        sessionDirectory: "sessions/test-session",
        sourceDirectory: "sessions/test-session/source",
        runtimeDirectory,
        userCodeDirectory: "sessions/test-session/dist/user-code",
        entryFileRelativePath: "Program.cs",
        programArguments: [],
        languageIdentifier: "csharp",
    };
}
afterEach(async () => {
    while (temporaryDirectories.length > 0) {
        await rm(temporaryDirectories.pop() as string, { recursive: true, force: true });
    }
});
describe("TeaVmGlueRuntimeAssembler", () => {
    test("keeps the line sink and adds a raw text sink with per-attempt cache busting", async () => {
        const runtimeDirectory = await createRuntimeDirectory();
        const assembler = new TeaVmGlueRuntimeAssembler(new FileSystemOperations());
        await assembler.assembleRuntimeInto(buildContext(runtimeDirectory));
        const glueText = await readFile(`${runtimeDirectory}/teavm-loader.js`, "utf8");
        expect(glueText).toContain(
            "loadTeaVmModule(baseUrl, writeLine, writeText, attemptIdentifier, readLine)",
        );
        expect(glueText).toContain("$rt_putStdoutCustom");
        expect(glueText).toContain("$rt_putStderrCustom");
        expect(glueText).toContain("?attempt=${attemptIdentifier}");
        expect(glueText).toContain("lines.pop()");
        const glueModule = (await import(
            pathToFileURL(`${runtimeDirectory}/teavm-loader.js`).href
        )) as { loadTeaVmModule?: unknown };
        expect(typeof glueModule.loadTeaVmModule).toBe("function");
    });
    test("installs the stdin hook only when a readLine feeder is provided", async () => {
        const runtimeDirectory = await createRuntimeDirectory();
        const assembler = new TeaVmGlueRuntimeAssembler(new FileSystemOperations());
        await assembler.assembleRuntimeInto(buildContext(runtimeDirectory));
        const glueText = await readFile(`${runtimeDirectory}/teavm-loader.js`, "utf8");
        expect(glueText).toContain('typeof readLine === "function"');
        expect(glueText).toContain("$wasmverseReadByte");
        expect(glueText).toContain("TextEncoder");
        expect(glueText).toContain("delete globalThis.$wasmverseReadByte");
        const glueModule = (await import(
            pathToFileURL(`${runtimeDirectory}/teavm-loader.js`).href
        )) as {
            loadTeaVmModule?: (
                baseUrl: string,
                writeLine: (line: string) => void,
                writeText?: (text: string) => void,
                attempt?: number,
                readLine?: () => string,
            ) => Promise<unknown>;
        };
        await writeFile(`${runtimeDirectory}/classes.js`, "export function main() {}\n");
        await glueModule.loadTeaVmModule?.(
            pathToFileURL(runtimeDirectory).href,
            () => {},
            undefined,
            undefined,
            () => "fed-line",
        );
        const readByte = (globalThis as Record<string, unknown>)["$wasmverseReadByte"] as
            | (() => number)
            | undefined;
        expect(typeof readByte).toBe("function");
        const byteValues: Array<number> = [];
        for (let index = 0; index < 9; index++) {
            byteValues.push(readByte?.() as number);
        }
        expect(byteValues).toEqual([102, 101, 100, 45, 108, 105, 110, 101, 10]);
        delete (globalThis as Record<string, unknown>)["$wasmverseReadByte"];
    });
});
describe("BlazorGlueRuntimeAssembler", () => {
    test("keeps the legacy loader and adds a runtime attempt factory with host imports", async () => {
        const runtimeDirectory = await createRuntimeDirectory();
        const assembler = new BlazorGlueRuntimeAssembler(new FileSystemOperations());
        await assembler.assembleRuntimeInto(buildContext(runtimeDirectory));
        const glueText = await readFile(`${runtimeDirectory}/blazor-loader.js`, "utf8");
        expect(glueText).toContain("loadBlazorRuntime()");
        expect(glueText).toContain("createBlazorRuntimeAttempt(options)");
        expect(glueText).toContain("dotnet.js?attempt=${options.attemptIndex}");
        expect(glueText).toContain("withApplicationArguments");
        expect(glueText).toContain("FS_createDataFile");
        expect(glueText).toContain('setModuleImports("WasmVerseHost"');
        const glueModule = (await import(
            pathToFileURL(`${runtimeDirectory}/blazor-loader.js`).href
        )) as { loadBlazorRuntime?: unknown; createBlazorRuntimeAttempt?: unknown };
        expect(typeof glueModule.loadBlazorRuntime).toBe("function");
        expect(typeof glueModule.createBlazorRuntimeAttempt).toBe("function");
    });
});
describe("DartWasmGlueRuntimeAssembler", () => {
    test("keeps the legacy app loader and adds a replay factory plus host bridge", async () => {
        const runtimeDirectory = await createRuntimeDirectory();
        await writeFile(
            `${runtimeDirectory}/app.wasm.js`,
            "export async function compile(){ return { instantiate: async () => ({ invokeMain: () => {} }) }; }\n",
        );
        const assembler = new DartWasmGlueRuntimeAssembler(new FileSystemOperations());
        await assembler.assembleRuntimeInto(buildContext(runtimeDirectory));
        const glueText = await readFile(`${runtimeDirectory}/dart-loader.js`, "utf8");
        expect(glueText).toContain("loadDartApp(baseUrl)");
        expect(glueText).toContain("loadDartRuntime(baseUrl)");
        expect(glueText).toContain("installDartWasmHostBridge(bridge)");
        expect(glueText).toContain("dartPrint");
        expect(glueText).toContain("WasmVerseHost");
        const glueModule = (await import(
            pathToFileURL(`${runtimeDirectory}/dart-loader.js`).href
        )) as {
            loadDartApp?: unknown;
            loadDartRuntime?: unknown;
            installDartWasmHostBridge?: unknown;
        };
        expect(typeof glueModule.loadDartApp).toBe("function");
        expect(typeof glueModule.loadDartRuntime).toBe("function");
        expect(typeof glueModule.installDartWasmHostBridge).toBe("function");
    });
});
