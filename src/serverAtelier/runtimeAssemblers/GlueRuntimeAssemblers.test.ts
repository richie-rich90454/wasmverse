import { describe, expect, test } from "vitest";
import type { BuildContextRecord } from "@sharedKernel/BuildContextRecord.ts";
import { EmscriptenGlueRuntimeAssembler } from "@serverAtelier/runtimeAssemblers/EmscriptenGlueRuntimeAssembler.ts";
import { WasmPackGlueRuntimeAssembler } from "@serverAtelier/runtimeAssemblers/WasmPackGlueRuntimeAssembler.ts";
import type { FileSystemOperations } from "@serverAtelier/utilities/FileSystemOperations.ts";
class CapturingFileSystemOperations {
    readonly ensuredDirectories: Array<string> = [];
    readonly writtenContents = new Map<string, string>();
    async ensureDirectoryExists(directoryPath: string): Promise<void> {
        this.ensuredDirectories.push(directoryPath);
    }
    async writeTextFile(targetPath: string, content: string): Promise<void> {
        this.writtenContents.set(targetPath, content);
    }
}
function buildContext(runtimeDirectory: string): BuildContextRecord {
    return {
        sessionIdentifier: "test-session",
        sessionDirectory: "sessions/test-session",
        sourceDirectory: "sessions/test-session/source",
        runtimeDirectory,
        userCodeDirectory: "sessions/test-session/dist/user-code",
        entryFileRelativePath: "main.c",
        programArguments: [],
        languageIdentifier: "c",
    };
}
describe("EmscriptenGlueRuntimeAssembler", () => {
    test("emits a loader that merges per-attempt overrides over locateFile", async () => {
        const fileSystem = new CapturingFileSystemOperations();
        const assembler = new EmscriptenGlueRuntimeAssembler(
            fileSystem as unknown as FileSystemOperations,
        );
        await assembler.assembleRuntimeInto(buildContext("sessions/test-session/dist/runtime"));
        const glueText = fileSystem.writtenContents.get(
            "sessions/test-session/dist/runtime/emscripten-loader.js",
        );
        expect(glueText).toContain("loadEmscriptenModule(baseUrl, overrides)");
        expect(glueText).toContain("...overrides");
        expect(glueText).toContain("locateFile");
        expect(glueText).toContain("${baseUrl}/app.js");
    });
});
describe("WasmPackGlueRuntimeAssembler", () => {
    test("emits a loader that busts the module cache per replay attempt", async () => {
        const fileSystem = new CapturingFileSystemOperations();
        const assembler = new WasmPackGlueRuntimeAssembler(
            fileSystem as unknown as FileSystemOperations,
        );
        await assembler.assembleRuntimeInto(buildContext("sessions/test-session/dist/runtime"));
        const glueText = fileSystem.writtenContents.get(
            "sessions/test-session/dist/runtime/wasm-pack-loader.js",
        );
        expect(glueText).toContain("loadWasmPackModule(baseUrl, attempt = 0)");
        expect(glueText).toContain("?attempt=${attempt}");
        expect(glueText).toContain("await module.default()");
    });
});
