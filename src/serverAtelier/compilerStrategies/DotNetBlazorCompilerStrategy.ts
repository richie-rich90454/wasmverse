import type { BuildContextRecord } from "@sharedKernel/BuildContextRecord.ts";
import type { CompilerStrategyContract } from "@serverAtelier/compilerStrategies/CompilerStrategyContract.ts";
import { FileSystemOperations } from "@serverAtelier/utilities/FileSystemOperations.ts";
import { ProcessRunner } from "@serverAtelier/utilities/ProcessRunner.ts";
class DotNetBlazorCompilerStrategy implements CompilerStrategyContract {
    private readonly processRunner: ProcessRunner;
    private readonly fileSystemOperations: FileSystemOperations;
    private readonly dotNetBinaryPath: string;
    constructor(
        processRunner: ProcessRunner,
        fileSystemOperations: FileSystemOperations,
        dotNetBinaryPath: string = "./.tools/dotnet/dotnet",
    ) {
        this.processRunner = processRunner;
        this.fileSystemOperations = fileSystemOperations;
        this.dotNetBinaryPath = dotNetBinaryPath;
    }
    async compileSourceInto(context: BuildContextRecord): Promise<void> {
        const toolchainExists = await this.fileSystemOperations.pathExists(this.dotNetBinaryPath);
        if (!toolchainExists) {
            throw new Error(
                "dotnet SDK not found. Run bun run setup to provision ./.tools/dotnet/.",
            );
        }
        const outcome = await this.processRunner.runToCompletion(
            [
                this.dotNetBinaryPath,
                "publish",
                "-c",
                "Release",
                "-r",
                "browser-wasm",
                "-o",
                context.runtimeDirectory,
            ],
            { workingDirectory: context.sourceDirectory },
        );
        if (outcome.exitCode !== 0) {
            throw new Error(`dotnet publish failed: ${outcome.standardError}`);
        }
    }
}
export { DotNetBlazorCompilerStrategy };
