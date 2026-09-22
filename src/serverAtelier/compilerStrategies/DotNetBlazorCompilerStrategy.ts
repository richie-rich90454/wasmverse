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
        const dotnetBinary = toolchainExists ? this.dotNetBinaryPath : "dotnet";
        let outcome;
        try {
            outcome = await this.processRunner.runToCompletion(
                [
                    dotnetBinary,
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
        } catch {
            throw new Error(
                "dotnet SDK not found. Run bun run setup to provision ./.tools/dotnet/ or install dotnet on PATH.",
            );
        }
        if (outcome.exitCode !== 0) {
            const detail =
                outcome.standardError.trim().length > 0
                    ? outcome.standardError
                    : outcome.standardOutput;
            throw new Error(`dotnet publish failed: ${detail}`);
        }
    }
}
export { DotNetBlazorCompilerStrategy };
