import type { BuildContextRecord } from "@sharedKernel/BuildContextRecord.ts";
import type { CompilerStrategyContract } from "@serverAtelier/compilerStrategies/CompilerStrategyContract.ts";
import { FileSystemOperations } from "@serverAtelier/utilities/FileSystemOperations.ts";
import { ProcessRunner } from "@serverAtelier/utilities/ProcessRunner.ts";
import { ToolchainLocator } from "@serverAtelier/utilities/ToolchainLocator.ts";
class EmscriptenCompilerStrategy implements CompilerStrategyContract {
    private readonly processRunner: ProcessRunner;
    private readonly fileSystemOperations: FileSystemOperations;
    private readonly toolchainLocator: ToolchainLocator;
    private readonly emscriptenCompilerPath: string;
    private readonly forceCppMode: boolean;
    constructor(
        processRunner: ProcessRunner,
        fileSystemOperations: FileSystemOperations,
        emscriptenCompilerPath: string = "./.emsdk/upstream/emscripten/emcc",
        forceCppMode: boolean = false,
    ) {
        this.processRunner = processRunner;
        this.fileSystemOperations = fileSystemOperations;
        this.toolchainLocator = new ToolchainLocator(fileSystemOperations);
        this.emscriptenCompilerPath = emscriptenCompilerPath;
        this.forceCppMode = forceCppMode;
    }
    async compileSourceInto(context: BuildContextRecord): Promise<void> {
        const emscriptenCompiler = await this.toolchainLocator.resolveCommandVector(
            this.emscriptenCompilerPath,
            "emcc",
            "Emscripten",
        );
        const compilationArguments = [
            "-O2",
            "-s",
            "WASM=1",
            "-s",
            "MODULARIZE=1",
            // The glue loads the module with a dynamic `import()` and reads
            // `.default`, which only exists when Emscripten emits an ES module.
            // Without this the output is a CommonJS shim that a browser cannot
            // import at all.
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
            // C++ needs its runtime linked in, which C does not. `emcc` needs
            // this switch; `em++` would set it implicitly.
            ...(this.forceCppMode ? ["-s", "DEFAULT_TO_CXX=1"] : []),
            context.entryFileRelativePath,
            "-o",
            `${context.runtimeDirectory}/app.js`,
        ];
        const outcome = await this.processRunner.runToCompletion(
            [...emscriptenCompiler, ...compilationArguments],
            { workingDirectory: context.sourceDirectory },
        );
        if (outcome.exitCode !== 0) {
            throw new Error(`Emscripten compilation failed: ${outcome.standardError}`);
        }
    }
}
export { EmscriptenCompilerStrategy };
