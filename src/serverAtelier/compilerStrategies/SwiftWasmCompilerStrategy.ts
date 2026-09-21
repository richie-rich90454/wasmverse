import type { BuildContextRecord } from "@sharedKernel/BuildContextRecord.ts";
import type { CompilerStrategyContract } from "@serverAtelier/compilerStrategies/CompilerStrategyContract.ts";
import { FileSystemOperations } from "@serverAtelier/utilities/FileSystemOperations.ts";
import { ProcessRunner } from "@serverAtelier/utilities/ProcessRunner.ts";
class SwiftWasmCompilerStrategy implements CompilerStrategyContract {
    private readonly processRunner: ProcessRunner;
    private readonly fileSystemOperations: FileSystemOperations;
    private readonly swiftCompilerPath: string;
    constructor(
        processRunner: ProcessRunner,
        fileSystemOperations: FileSystemOperations,
        swiftCompilerPath: string = "./.tools/swift-wasm/usr/bin/swiftc",
    ) {
        this.processRunner = processRunner;
        this.fileSystemOperations = fileSystemOperations;
        this.swiftCompilerPath = swiftCompilerPath;
    }
    async compileSourceInto(context: BuildContextRecord): Promise<void> {
        const toolchainExists = await this.fileSystemOperations.pathExists(this.swiftCompilerPath);
        if (!toolchainExists) {
            throw new Error(
                "SwiftWasm toolchain not found. Run bun run setup to provision ./.tools/swift-wasm/.",
            );
        }
        const outcome = await this.processRunner.runToCompletion(
            [
                this.swiftCompilerPath,
                "-target",
                "wasm32-unknown-wasi",
                context.entryFileRelativePath,
                "-o",
                `${context.runtimeDirectory}/app.wasm`,
            ],
            { workingDirectory: context.sourceDirectory },
        );
        if (outcome.exitCode !== 0) {
            throw new Error(`SwiftWasm build failed: ${outcome.standardError}`);
        }
    }
}
export { SwiftWasmCompilerStrategy };
