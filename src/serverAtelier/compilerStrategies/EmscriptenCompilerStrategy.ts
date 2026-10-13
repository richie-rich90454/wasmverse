import { resolve } from "node:path";
import type { BuildContextRecord } from "@sharedKernel/BuildContextRecord.ts";
import type { CompilerStrategyContract } from "@serverAtelier/compilerStrategies/CompilerStrategyContract.ts";
import { FileSystemOperations } from "@serverAtelier/utilities/FileSystemOperations.ts";
import { ProcessRunner } from "@serverAtelier/utilities/ProcessRunner.ts";
const EMSCRIPTEN_COMPILER_CANDIDATE_PATHS: ReadonlyArray<string> =
    process.platform === "win32"
        ? [
              "./.emsdk/upstream/emscripten/emcc.exe",
              "./.emsdk/upstream/emscripten/emcc.bat",
              "./.emsdk/upstream/emscripten/emcc",
          ]
        : ["./.emsdk/upstream/emscripten/emcc"];
class EmscriptenCompilerStrategy implements CompilerStrategyContract {
    private readonly processRunner: ProcessRunner;
    private readonly fileSystemOperations: FileSystemOperations;
    private readonly emscriptenCompilerPath: string | undefined;
    private readonly forceCppMode: boolean;
    constructor(
        processRunner: ProcessRunner,
        fileSystemOperations: FileSystemOperations,
        emscriptenCompilerPath?: string,
        forceCppMode: boolean = false,
    ) {
        this.processRunner = processRunner;
        this.fileSystemOperations = fileSystemOperations;
        this.emscriptenCompilerPath = emscriptenCompilerPath;
        this.forceCppMode = forceCppMode;
    }
    async compileSourceInto(context: BuildContextRecord): Promise<void> {
        const compilerPath = await this.resolveCompilerPath();
        const compilationArguments = [
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
            ...(this.forceCppMode ? ["-s", "DEFAULT_TO_CXX=1"] : []),
            context.entryFileRelativePath,
            "-o",
            `${context.runtimeDirectory}/app.js`,
        ];
        const resolvedCompilerPath = resolve(process.cwd(), compilerPath);
        const outcome = await this.processRunner.runToCompletion(
            process.platform === "win32" && compilerPath.endsWith(".bat")
                ? ["cmd", "/c", resolvedCompilerPath, ...compilationArguments]
                : [resolvedCompilerPath, ...compilationArguments],
            { workingDirectory: context.sourceDirectory },
        );
        if (outcome.exitCode !== 0) {
            throw new Error(`Emscripten compilation failed: ${outcome.standardError}`);
        }
    }
    private async resolveCompilerPath(): Promise<string> {
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
export { EmscriptenCompilerStrategy };
