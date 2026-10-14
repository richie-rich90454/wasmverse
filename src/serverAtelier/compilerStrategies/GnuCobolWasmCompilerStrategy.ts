import { resolve } from "node:path";
import type { BuildContextRecord } from "@sharedKernel/BuildContextRecord.ts";
import type { CompilerStrategyContract } from "@serverAtelier/compilerStrategies/CompilerStrategyContract.ts";
import { FileSystemOperations } from "@serverAtelier/utilities/FileSystemOperations.ts";
import { ProcessRunner } from "@serverAtelier/utilities/ProcessRunner.ts";
const COBOL_TRANSLATED_C_FILE_NAME = "app.c";
const COBOL_TOOLCHAIN_DIRECTORY = "./.tools/gnucobol";
const COBOL_WASM_RUNTIME_LIBRARY_PATH = `${COBOL_TOOLCHAIN_DIRECTORY}/wasm/libcob.a`;
const COBOL_TRANSLATOR_CANDIDATE_PATHS: ReadonlyArray<string> = [
    `${COBOL_TOOLCHAIN_DIRECTORY}/bin/cobc.exe`,
    `${COBOL_TOOLCHAIN_DIRECTORY}/bin/cobc`,
];
const EMSCRIPTEN_COMPILER_CANDIDATE_PATHS: ReadonlyArray<string> =
    process.platform === "win32"
        ? [
              "./.emsdk/upstream/emscripten/emcc.exe",
              "./.emsdk/upstream/emscripten/emcc.bat",
              "./.emsdk/upstream/emscripten/emcc",
          ]
        : ["./.emsdk/upstream/emscripten/emcc"];
class GnuCobolWasmCompilerStrategy implements CompilerStrategyContract {
    private readonly processRunner: ProcessRunner;
    private readonly fileSystemOperations: FileSystemOperations;
    private readonly cobolTranslatorPath: string | undefined;
    private readonly emscriptenCompilerPath: string | undefined;
    constructor(
        processRunner: ProcessRunner,
        fileSystemOperations: FileSystemOperations,
        cobolTranslatorPath?: string,
        emscriptenCompilerPath?: string,
    ) {
        this.processRunner = processRunner;
        this.fileSystemOperations = fileSystemOperations;
        this.cobolTranslatorPath = cobolTranslatorPath;
        this.emscriptenCompilerPath = emscriptenCompilerPath;
    }
    async compileSourceInto(context: BuildContextRecord): Promise<void> {
        const translatorPath = await this.resolveCobolTranslatorPath();
        const translationOutcome = await this.processRunner.runToCompletion(
            [
                translatorPath,
                "-C",
                "-o",
                `${context.runtimeDirectory}/${COBOL_TRANSLATED_C_FILE_NAME}`,
                context.entryFileRelativePath,
            ],
            { workingDirectory: context.sourceDirectory },
        );
        if (translationOutcome.exitCode !== 0) {
            throw new Error(`GnuCOBOL translation failed: ${translationOutcome.standardError}`);
        }
        if (!(await this.fileSystemOperations.pathExists(COBOL_WASM_RUNTIME_LIBRARY_PATH))) {
            throw new Error(
                "GnuCOBOL wasm runtime library is missing: ./.tools/gnucobol/wasm/libcob.a. GnuCOBOL ships no wasm build of libcob, and libcob requires GMP (or MPIR) compiled to wasm; the Windows distribution ships no wasm runtime. Run pnpm run setup to provision ./.tools/gnucobol/, then provide ./.tools/gnucobol/wasm/libcob.a and libgmp.a built with ./.emsdk/.",
            );
        }
        const emscriptenPath = await this.resolveEmscriptenPath();
        const compilationOutcome = await this.processRunner.runToCompletion(
            [
                emscriptenPath,
                "-O2",
                "-s",
                "WASM=1",
                "-s",
                "MODULARIZE=1",
                "-s",
                "EXPORT_ES6=1",
                "-s",
                "EXPORT_NAME=createApp",
                "-s",
                'EXPORTED_RUNTIME_METHODS=["callMain","FS"]',
                "-s",
                "INVOKE_RUN=0",
                "-s",
                "ENVIRONMENT=web",
                `${context.runtimeDirectory}/${COBOL_TRANSLATED_C_FILE_NAME}`,
                resolve(process.cwd(), COBOL_WASM_RUNTIME_LIBRARY_PATH),
                "-o",
                `${context.runtimeDirectory}/app.js`,
            ],
            { workingDirectory: context.sourceDirectory },
        );
        if (compilationOutcome.exitCode !== 0) {
            throw new Error(
                `GnuCOBOL wasm compilation failed: ${compilationOutcome.standardError}`,
            );
        }
    }
    private async resolveCobolTranslatorPath(): Promise<string> {
        if (this.cobolTranslatorPath) {
            if (await this.fileSystemOperations.pathExists(this.cobolTranslatorPath)) {
                return this.cobolTranslatorPath;
            }
            throw new Error(
                "GnuCOBOL toolchain not found. Run pnpm run setup to provision ./.tools/gnucobol/.",
            );
        }
        for (const candidatePath of COBOL_TRANSLATOR_CANDIDATE_PATHS) {
            if (await this.fileSystemOperations.pathExists(candidatePath)) {
                return candidatePath;
            }
        }
        throw new Error(
            "GnuCOBOL toolchain not found. Run pnpm run setup to provision ./.tools/gnucobol/.",
        );
    }
    private async resolveEmscriptenPath(): Promise<string> {
        if (this.emscriptenCompilerPath) {
            if (await this.fileSystemOperations.pathExists(this.emscriptenCompilerPath)) {
                return this.emscriptenCompilerPath;
            }
            throw new Error(
                "Emscripten compiler not found. Run pnpm run setup to provision ./.emsdk/.",
            );
        }
        for (const candidatePath of EMSCRIPTEN_COMPILER_CANDIDATE_PATHS) {
            if (await this.fileSystemOperations.pathExists(candidatePath)) {
                return candidatePath;
            }
        }
        throw new Error(
            "Emscripten compiler not found. Run pnpm run setup to provision ./.emsdk/.",
        );
    }
}
export { GnuCobolWasmCompilerStrategy };
