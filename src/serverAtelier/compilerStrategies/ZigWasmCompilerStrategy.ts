import type { BuildContextRecord } from "@sharedKernel/BuildContextRecord.ts";
import type { CompilerStrategyContract } from "@serverAtelier/compilerStrategies/CompilerStrategyContract.ts";
import { FileSystemOperations } from "@serverAtelier/utilities/FileSystemOperations.ts";
import { ProcessRunner } from "@serverAtelier/utilities/ProcessRunner.ts";
class ZigWasmCompilerStrategy implements CompilerStrategyContract {
    private readonly processRunner: ProcessRunner;
    private readonly fileSystemOperations: FileSystemOperations;
    private readonly zigBinaryPath: string;
    constructor(
        processRunner: ProcessRunner,
        fileSystemOperations: FileSystemOperations,
        zigBinaryPath: string = "./.tools/zig/zig",
    ) {
        this.processRunner = processRunner;
        this.fileSystemOperations = fileSystemOperations;
        this.zigBinaryPath = zigBinaryPath;
    }
    async compileSourceInto(context: BuildContextRecord): Promise<void> {
        const toolchainExists = await this.fileSystemOperations.pathExists(this.zigBinaryPath);
        if (!toolchainExists) {
            throw new Error(
                "Zig toolchain not found. Run bun run setup to provision ./.tools/zig/.",
            );
        }
        const outcome = await this.processRunner.runToCompletion(
            [
                this.zigBinaryPath,
                "build-exe",
                "-target",
                "wasm32-freestanding",
                "-O",
                "ReleaseSmall",
                "-fno-entry",
                "--export=main",
                context.entryFileRelativePath,
                "-femit-bin",
                `${context.runtimeDirectory}/app.wasm`,
            ],
            { workingDirectory: context.sourceDirectory },
        );
        if (outcome.exitCode !== 0) {
            throw new Error(`Zig WASM build failed: ${outcome.standardError}`);
        }
    }
}
export { ZigWasmCompilerStrategy };
