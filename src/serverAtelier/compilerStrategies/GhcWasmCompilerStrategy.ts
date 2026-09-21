import type { BuildContextRecord } from "@sharedKernel/BuildContextRecord.ts";
import type { CompilerStrategyContract } from "@serverAtelier/compilerStrategies/CompilerStrategyContract.ts";
import { FileSystemOperations } from "@serverAtelier/utilities/FileSystemOperations.ts";
import { ProcessRunner } from "@serverAtelier/utilities/ProcessRunner.ts";
class GhcWasmCompilerStrategy implements CompilerStrategyContract {
    private readonly processRunner: ProcessRunner;
    private readonly fileSystemOperations: FileSystemOperations;
    private readonly ghcCompilerPath: string;
    constructor(
        processRunner: ProcessRunner,
        fileSystemOperations: FileSystemOperations,
        ghcCompilerPath: string = "./.tools/ghc-wasm/bin/wasm32-wasi-ghc",
    ) {
        this.processRunner = processRunner;
        this.fileSystemOperations = fileSystemOperations;
        this.ghcCompilerPath = ghcCompilerPath;
    }
    async compileSourceInto(context: BuildContextRecord): Promise<void> {
        const toolchainExists = await this.fileSystemOperations.pathExists(this.ghcCompilerPath);
        if (!toolchainExists) {
            throw new Error(
                "GHC WASM toolchain not found. Run bun run setup to provision ./.tools/ghc-wasm/.",
            );
        }
        const outcome = await this.processRunner.runToCompletion(
            [
                this.ghcCompilerPath,
                context.entryFileRelativePath,
                "-o",
                `${context.runtimeDirectory}/app.wasm`,
            ],
            { workingDirectory: context.sourceDirectory },
        );
        if (outcome.exitCode !== 0) {
            throw new Error(`GHC WASM build failed: ${outcome.standardError}`);
        }
    }
}
export { GhcWasmCompilerStrategy };
