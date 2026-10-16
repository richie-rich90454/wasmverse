import { afterEach, describe, expect, test } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BuildContextRecord } from "@sharedKernel/BuildContextRecord.ts";
import { BlazorGlueRuntimeAssembler } from "@serverAtelier/runtimeAssemblers/BlazorGlueRuntimeAssembler.ts";
import { DartWasmGlueRuntimeAssembler } from "@serverAtelier/runtimeAssemblers/DartWasmGlueRuntimeAssembler.ts";
import { ElmLoaderRuntimeAssembler } from "@serverAtelier/runtimeAssemblers/ElmLoaderRuntimeAssembler.ts";
import { EmscriptenGlueRuntimeAssembler } from "@serverAtelier/runtimeAssemblers/EmscriptenGlueRuntimeAssembler.ts";
import { FableLoaderRuntimeAssembler } from "@serverAtelier/runtimeAssemblers/FableLoaderRuntimeAssembler.ts";
import { GleamLoaderRuntimeAssembler } from "@serverAtelier/runtimeAssemblers/GleamLoaderRuntimeAssembler.ts";
import { HaxeLoaderRuntimeAssembler } from "@serverAtelier/runtimeAssemblers/HaxeLoaderRuntimeAssembler.ts";
import { KotlinJsGlueRuntimeAssembler } from "@serverAtelier/runtimeAssemblers/KotlinJsGlueRuntimeAssembler.ts";
import { PureScriptLoaderRuntimeAssembler } from "@serverAtelier/runtimeAssemblers/PureScriptLoaderRuntimeAssembler.ts";
import { ReScriptLoaderRuntimeAssembler } from "@serverAtelier/runtimeAssemblers/ReScriptLoaderRuntimeAssembler.ts";
import { ScalaJsLoaderRuntimeAssembler } from "@serverAtelier/runtimeAssemblers/ScalaJsLoaderRuntimeAssembler.ts";
import { TeaVmGlueRuntimeAssembler } from "@serverAtelier/runtimeAssemblers/TeaVmGlueRuntimeAssembler.ts";
import { WasmPackGlueRuntimeAssembler } from "@serverAtelier/runtimeAssemblers/WasmPackGlueRuntimeAssembler.ts";
import { WasiWasmGlueRuntimeAssembler } from "@serverAtelier/runtimeAssemblers/WasiWasmGlueRuntimeAssembler.ts";
import { FileSystemOperations } from "@serverAtelier/utilities/FileSystemOperations.ts";
const temporaryDirectories: Array<string> = [];
afterEach(async () => {
    while (temporaryDirectories.length > 0) {
        await rm(temporaryDirectories.pop() as string, { recursive: true, force: true });
    }
});
describe("embedded asset resolver glue", () => {
    test("every loader routes its composed urls through the resolver global when it is present", async () => {
        const runtimeDirectory = await mkdtemp(join(tmpdir(), "wasmverse-resolver-glue-"));
        temporaryDirectories.push(runtimeDirectory);
        const context: BuildContextRecord = {
            sessionIdentifier: "test-session",
            sessionDirectory: "sessions/test-session",
            sourceDirectory: "sessions/test-session/source",
            runtimeDirectory,
            userCodeDirectory: "sessions/test-session/dist/user-code",
            entryFileRelativePath: "main.c",
            programArguments: [],
            languageIdentifier: "c",
        };
        const fileSystemOperations = new FileSystemOperations();
        const assemblerByLoaderFileName: Record<
            string,
            { assembleRuntimeInto(context: BuildContextRecord): Promise<void> }
        > = {
            "emscripten-loader.js": new EmscriptenGlueRuntimeAssembler(fileSystemOperations),
            "wasm-pack-loader.js": new WasmPackGlueRuntimeAssembler(fileSystemOperations),
            "fable-loader.js": new FableLoaderRuntimeAssembler(fileSystemOperations),
            "gleam-loader.js": new GleamLoaderRuntimeAssembler(fileSystemOperations),
            "kotlin-loader.js": new KotlinJsGlueRuntimeAssembler(fileSystemOperations),
            "scala-loader.js": new ScalaJsLoaderRuntimeAssembler(fileSystemOperations),
            "haxe-loader.js": new HaxeLoaderRuntimeAssembler(fileSystemOperations),
            "rescript-loader.js": new ReScriptLoaderRuntimeAssembler(fileSystemOperations),
            "purescript-loader.js": new PureScriptLoaderRuntimeAssembler(fileSystemOperations),
            "elm-loader.js": new ElmLoaderRuntimeAssembler(fileSystemOperations),
            "teavm-loader.js": new TeaVmGlueRuntimeAssembler(fileSystemOperations),
            "blazor-loader.js": new BlazorGlueRuntimeAssembler(fileSystemOperations),
            "dart-loader.js": new DartWasmGlueRuntimeAssembler(fileSystemOperations),
            "wasi-loader.js": new WasiWasmGlueRuntimeAssembler(fileSystemOperations),
        };
        for (const assembler of Object.values(assemblerByLoaderFileName)) {
            await assembler.assembleRuntimeInto(context);
        }
        for (const loaderFileName of Object.keys(assemblerByLoaderFileName)) {
            const loaderSource = await readFile(join(runtimeDirectory, loaderFileName), "utf8");
            expect(loaderSource, loaderFileName).toContain(
                'typeof globalThis.__WASMVERSE_RESOLVE_EMBEDDED_ASSET__ === "function"',
            );
        }
        expect(
            await readFile(join(runtimeDirectory, "emscripten-loader.js"), "utf8"),
        ).not.toContain("await import(`${baseUrl}");
        expect(await readFile(join(runtimeDirectory, "wasm-pack-loader.js"), "utf8")).toContain(
            "await import(resolve(`${baseUrl}/app.js?attempt=${attempt}`))",
        );
        const blazorLoaderSource = await readFile(
            join(runtimeDirectory, "blazor-loader.js"),
            "utf8",
        );
        expect(blazorLoaderSource).toContain(".withResourceLoader(");
        expect(blazorLoaderSource).toContain('resourceType === "manifest"');
        expect(await readFile(join(runtimeDirectory, "dart-loader.js"), "utf8")).toContain(
            "await fetch(resolve(`${baseUrl}/app.wasm`))",
        );
        expect(await readFile(join(runtimeDirectory, "wasi-loader.js"), "utf8")).toContain(
            "await fetch(resolve(`${baseUrl}/app.wasm`))",
        );
    });
});
