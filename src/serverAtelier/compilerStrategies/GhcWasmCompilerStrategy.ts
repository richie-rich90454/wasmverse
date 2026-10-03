import type { BuildContextRecord } from "@sharedKernel/BuildContextRecord.ts";
import type { CompilerStrategyContract } from "@serverAtelier/compilerStrategies/CompilerStrategyContract.ts";
import { FileSystemOperations } from "@serverAtelier/utilities/FileSystemOperations.ts";
import { ProcessRunner } from "@serverAtelier/utilities/ProcessRunner.ts";
import { ToolchainLocator } from "@serverAtelier/utilities/ToolchainLocator.ts";
class GhcWasmCompilerStrategy implements CompilerStrategyContract {
    private readonly processRunner: ProcessRunner;
    private readonly fileSystemOperations: FileSystemOperations;
    private readonly toolchainLocator: ToolchainLocator;
    private readonly ghcCompilerPath: string;
    constructor(
        processRunner: ProcessRunner,
        fileSystemOperations: FileSystemOperations,
        ghcCompilerPath: string = "./.tools/ghc-wasm/bin/wasm32-wasi-ghc",
    ) {
        this.processRunner = processRunner;
        this.fileSystemOperations = fileSystemOperations;
        this.toolchainLocator = new ToolchainLocator(fileSystemOperations);
        this.ghcCompilerPath = ghcCompilerPath;
    }
    async compileSourceInto(context: BuildContextRecord): Promise<void> {
        const ghcCompiler = await this.toolchainLocator.resolveCommandVector(
            this.ghcCompilerPath,
            "wasm32-wasi-ghc",
            "GHC WASM",
        );
        const outcome = await this.processRunner.runToCompletion(
            [
                ...ghcCompiler,
                context.entryFileRelativePath,
                "-o",
                `${context.runtimeDirectory}/app.wasm`,
            ],
            { workingDirectory: context.sourceDirectory },
        );
        if (outcome.exitCode !== 0) {
            const detail =
                outcome.standardError.trim().length > 0
                    ? outcome.standardError
                    : outcome.standardOutput;
            throw new Error(`GHC WASM build failed: ${detail}`);
        }
    }
}
export { GhcWasmCompilerStrategy };
