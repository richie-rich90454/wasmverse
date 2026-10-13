import { resolve } from "node:path";
import type { BuildContextRecord } from "@sharedKernel/BuildContextRecord.ts";
import type { CompilerStrategyContract } from "@serverAtelier/compilerStrategies/CompilerStrategyContract.ts";
import { FileSystemOperations } from "@serverAtelier/utilities/FileSystemOperations.ts";
import { ProcessRunner } from "@serverAtelier/utilities/ProcessRunner.ts";
const DEFAULT_EMSCRIPTEN_COMPILER_PATH =
    process.platform === "win32"
        ? "./.emsdk/upstream/emscripten/emcc.bat"
        : "./.emsdk/upstream/emscripten/emcc";
class EmscriptenCompilerStrategy implements CompilerStrategyContract {
    private readonly processRunner: ProcessRunner;
    private readonly fileSystemOperations: FileSystemOperations;
    private readonly emscriptenCompilerPath: string;
    constructor(
        processRunner: ProcessRunner,
        fileSystemOperations: FileSystemOperations,
        emscriptenCompilerPath: string = DEFAULT_EMSCRIPTEN_COMPILER_PATH,
    ) {
        this.processRunner = processRunner;
        this.fileSystemOperations = fileSystemOperations;
        this.emscriptenCompilerPath = emscriptenCompilerPath;
    }
    async compileSourceInto(context: BuildContextRecord): Promise<void> {
        const compilerExists = await this.fileSystemOperations.pathExists(
            this.emscriptenCompilerPath,
        );
        if (!compilerExists) {
            throw new Error(
                "Emscripten compiler not found. Run pnpm run setup to provision ./.emsdk/.",
            );
        }
        const compilationArguments = [
            "-O2",
            "-s",
            "WASM=1",
            "-s",
            "MODULARIZE=1",
            "-s",
            "EXPORT_NAME=createApp",
            "-s",
            'EXPORTED_RUNTIME_METHODS=["callMain"]',
            "-s",
            "INVOKE_RUN=0",
            "-s",
            "ENVIRONMENT=web",
            context.sourceDirectory,
            "-o",
            `${context.runtimeDirectory}/app.js`,
        ];
        const outcome = await this.processRunner.runToCompletion(
            process.platform === "win32"
                ? [
                      "cmd",
                      "/c",
                      resolve(process.cwd(), this.emscriptenCompilerPath),
                      ...compilationArguments,
                  ]
                : [this.emscriptenCompilerPath, ...compilationArguments],
            { workingDirectory: context.sourceDirectory },
        );
        if (outcome.exitCode !== 0) {
            throw new Error(`Emscripten compilation failed: ${outcome.standardError}`);
        }
    }
}
export { EmscriptenCompilerStrategy };
