import type { BuildContextRecord } from "@sharedKernel/BuildContextRecord.ts";
import type { CompilerStrategyContract } from "@serverAtelier/compilerStrategies/CompilerStrategyContract.ts";
import { FileSystemOperations } from "@serverAtelier/utilities/FileSystemOperations.ts";
import { ProcessRunner } from "@serverAtelier/utilities/ProcessRunner.ts";
import { ToolchainLocator } from "@serverAtelier/utilities/ToolchainLocator.ts";
class DartWasmCompilerStrategy implements CompilerStrategyContract {
    private readonly processRunner: ProcessRunner;
    private readonly fileSystemOperations: FileSystemOperations;
    private readonly toolchainLocator: ToolchainLocator;
    private readonly dartBinaryPath: string;
    constructor(
        processRunner: ProcessRunner,
        fileSystemOperations: FileSystemOperations,
        dartBinaryPath: string = "./.tools/dart-sdk/bin/dart",
    ) {
        this.processRunner = processRunner;
        this.fileSystemOperations = fileSystemOperations;
        this.toolchainLocator = new ToolchainLocator(fileSystemOperations);
        this.dartBinaryPath = dartBinaryPath;
    }
    async compileSourceInto(context: BuildContextRecord): Promise<void> {
        const dartBinary = await this.toolchainLocator.resolveCommandVector(
            this.dartBinaryPath,
            "dart",
            "Dart",
        );
        let outcome;
        try {
            outcome = await this.processRunner.runToCompletion(
                [
                    ...dartBinary,
                    "compile",
                    "wasm",
                    context.entryFileRelativePath,
                    "-o",
                    `${context.runtimeDirectory}/app.wasm`,
                ],
                { workingDirectory: context.sourceDirectory },
            );
        } catch {
            throw new Error(
                "Dart SDK not found. Run pnpm run setup to provision ./.tools/dart-sdk/.",
            );
        }
        if (outcome.exitCode !== 0) {
            const detail =
                outcome.standardError.trim().length > 0
                    ? outcome.standardError
                    : outcome.standardOutput;
            throw new Error(`Dart WASM build failed: ${detail}`);
        }
        await this.fileSystemOperations.moveInto(
            `${context.runtimeDirectory}/app.mjs`,
            `${context.runtimeDirectory}/app.wasm.js`,
        );
    }
}
export { DartWasmCompilerStrategy };
