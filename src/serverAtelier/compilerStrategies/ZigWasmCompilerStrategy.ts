import type { BuildContextRecord } from "@sharedKernel/BuildContextRecord.ts";
import type { CompilerStrategyContract } from "@serverAtelier/compilerStrategies/CompilerStrategyContract.ts";
import { FileSystemOperations } from "@serverAtelier/utilities/FileSystemOperations.ts";
import { ProcessRunner } from "@serverAtelier/utilities/ProcessRunner.ts";
import { ToolchainLocator } from "@serverAtelier/utilities/ToolchainLocator.ts";
class ZigWasmCompilerStrategy implements CompilerStrategyContract {
    private readonly processRunner: ProcessRunner;
    private readonly fileSystemOperations: FileSystemOperations;
    private readonly toolchainLocator: ToolchainLocator;
    private readonly zigBinaryPath: string;
    constructor(
        processRunner: ProcessRunner,
        fileSystemOperations: FileSystemOperations,
        zigBinaryPath: string = "./.tools/zig/zig",
    ) {
        this.processRunner = processRunner;
        this.fileSystemOperations = fileSystemOperations;
        this.toolchainLocator = new ToolchainLocator(fileSystemOperations);
        this.zigBinaryPath = zigBinaryPath;
    }
    async compileSourceInto(context: BuildContextRecord): Promise<void> {
        const zigBinary = await this.toolchainLocator.resolveCommandVector(
            this.zigBinaryPath,
            "zig",
            "Zig",
        );
        const outcome = await this.processRunner.runToCompletion(
            [
                ...zigBinary,
                "build-exe",
                "-target",
                "wasm32-wasi",
                "-O",
                "ReleaseSmall",
                // No `--export=main`: a WASI command module already exports
                // `_start`, and asking wasm-ld to also export `main` fails for
                // programs whose main takes an initializer argument.
                `-femit-bin=${context.runtimeDirectory}/app.wasm`,
                context.entryFileRelativePath,
            ],
            { workingDirectory: context.sourceDirectory },
        );
        if (outcome.exitCode !== 0) {
            const detail =
                outcome.standardError.trim().length > 0
                    ? outcome.standardError
                    : outcome.standardOutput;
            throw new Error(`Zig WASM build failed: ${detail}`);
        }
    }
}
export { ZigWasmCompilerStrategy };
