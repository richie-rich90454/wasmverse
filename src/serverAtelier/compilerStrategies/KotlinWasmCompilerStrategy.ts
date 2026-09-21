import type { BuildContextRecord } from "@sharedKernel/BuildContextRecord.ts";
import type { CompilerStrategyContract } from "@serverAtelier/compilerStrategies/CompilerStrategyContract.ts";
import { FileSystemOperations } from "@serverAtelier/utilities/FileSystemOperations.ts";
import { ProcessRunner } from "@serverAtelier/utilities/ProcessRunner.ts";
class KotlinWasmCompilerStrategy implements CompilerStrategyContract {
    private readonly processRunner: ProcessRunner;
    private readonly fileSystemOperations: FileSystemOperations;
    private readonly kotlinCompilerPath: string;
    constructor(
        processRunner: ProcessRunner,
        fileSystemOperations: FileSystemOperations,
        kotlinCompilerPath: string = "./.tools/kotlin-wasm/bin/kotlinc",
    ) {
        this.processRunner = processRunner;
        this.fileSystemOperations = fileSystemOperations;
        this.kotlinCompilerPath = kotlinCompilerPath;
    }
    async compileSourceInto(context: BuildContextRecord): Promise<void> {
        const toolchainExists = await this.fileSystemOperations.pathExists(this.kotlinCompilerPath);
        if (!toolchainExists) {
            throw new Error(
                "Kotlin/Wasm toolchain not found. Run bun run setup to provision ./.tools/kotlin-wasm/.",
            );
        }
        const outcome = await this.processRunner.runToCompletion(
            [
                this.kotlinCompilerPath,
                context.entryFileRelativePath,
                "-d",
                `${context.runtimeDirectory}/app.wasm`,
            ],
            { workingDirectory: context.sourceDirectory },
        );
        if (outcome.exitCode !== 0) {
            throw new Error(`Kotlin/Wasm build failed: ${outcome.standardError}`);
        }
    }
}
export { KotlinWasmCompilerStrategy };
