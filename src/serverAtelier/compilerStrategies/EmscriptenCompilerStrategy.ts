import type { BuildContextRecord } from "@sharedKernel/BuildContextRecord.ts";
import type { CompilerStrategyContract } from "@serverAtelier/compilerStrategies/CompilerStrategyContract.ts";
import { FileSystemOperations } from "@serverAtelier/utilities/FileSystemOperations.ts";
import { ProcessRunner } from "@serverAtelier/utilities/ProcessRunner.ts";
import { ToolchainLocator } from "@serverAtelier/utilities/ToolchainLocator.ts";
/**
 * Emscripten ships two drivers. `emcc` drives the C frontend, `em++` the C++
 * one, and linking C++ with `emcc` fails with undefined symbols for
 * `operator new`, `std::cout`, and the rest of libcxx.
 */
class EmscriptenCompilerStrategy implements CompilerStrategyContract {
    private readonly processRunner: ProcessRunner;
    private readonly fileSystemOperations: FileSystemOperations;
    private readonly toolchainLocator: ToolchainLocator;
    private readonly emscriptenDriverName: string;
    private readonly emscriptenCompilerDirectory: string;
    constructor(
        processRunner: ProcessRunner,
        fileSystemOperations: FileSystemOperations,
        emscriptenDriverName: string = "emcc",
        emscriptenCompilerDirectory: string = "./.emsdk/upstream/emscripten",
    ) {
        this.processRunner = processRunner;
        this.fileSystemOperations = fileSystemOperations;
        this.toolchainLocator = new ToolchainLocator(fileSystemOperations);
        this.emscriptenDriverName = emscriptenDriverName;
        this.emscriptenCompilerDirectory = emscriptenCompilerDirectory;
    }
    async compileSourceInto(context: BuildContextRecord): Promise<void> {
        const emscriptenCompiler =
            (await this.toolchainLocator.resolveExistingPath(
                `${this.emscriptenCompilerDirectory}/${this.emscriptenDriverName}`,
            )) ?? (await this.toolchainLocator.resolveExistingPath(this.emscriptenDriverName));
        if (!emscriptenCompiler) {
            throw new Error(
                `Emscripten compiler ${this.emscriptenDriverName} not found. Run bun run setup to provision ./.emsdk/.`,
            );
        }
        const outcome = await this.processRunner.runToCompletion(
            [
                emscriptenCompiler,
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
                'EXPORTED_RUNTIME_METHODS=["callMain"]',
                "-s",
                "INVOKE_RUN=0",
                "-s",
                "ENVIRONMENT=web",
                context.entryFileRelativePath,
                "-o",
                `${context.runtimeDirectory}/app.js`,
            ],
            { workingDirectory: context.sourceDirectory },
        );
        if (outcome.exitCode !== 0) {
            throw new Error(`Emscripten compilation failed: ${outcome.standardError}`);
        }
    }
}
export { EmscriptenCompilerStrategy };
