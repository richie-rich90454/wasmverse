import { resolve } from "node:path";
import type { BuildContextRecord } from "@sharedKernel/BuildContextRecord.ts";
import type { CompilerStrategyContract } from "@serverAtelier/compilerStrategies/CompilerStrategyContract.ts";
import { FileSystemOperations } from "@serverAtelier/utilities/FileSystemOperations.ts";
import { ProcessRunner } from "@serverAtelier/utilities/ProcessRunner.ts";
const DEFAULT_KOTLIN_COMPILER_PATH =
    process.platform === "win32"
        ? "./.tools/kotlin-wasm/bin/kotlinc.bat"
        : "./.tools/kotlin-wasm/bin/kotlinc";
class KotlinWasmCompilerStrategy implements CompilerStrategyContract {
    private readonly processRunner: ProcessRunner;
    private readonly fileSystemOperations: FileSystemOperations;
    private readonly kotlinCompilerPath: string;
    constructor(
        processRunner: ProcessRunner,
        fileSystemOperations: FileSystemOperations,
        kotlinCompilerPath: string = DEFAULT_KOTLIN_COMPILER_PATH,
    ) {
        this.processRunner = processRunner;
        this.fileSystemOperations = fileSystemOperations;
        this.kotlinCompilerPath = kotlinCompilerPath;
    }
    async compileSourceInto(context: BuildContextRecord): Promise<void> {
        const toolchainExists = await this.fileSystemOperations.pathExists(this.kotlinCompilerPath);
        if (!toolchainExists) {
            throw new Error(
                "Kotlin/Wasm toolchain not found. Run pnpm run setup to provision ./.tools/kotlin-wasm/.",
            );
        }
        const compilationArguments = [
            context.entryFileRelativePath,
            "-d",
            `${context.runtimeDirectory}/app.wasm`,
        ];
        const outcome = await this.processRunner.runToCompletion(
            process.platform === "win32"
                ? [
                      "cmd",
                      "/c",
                      resolve(process.cwd(), this.kotlinCompilerPath),
                      ...compilationArguments,
                  ]
                : [this.kotlinCompilerPath, ...compilationArguments],
            { workingDirectory: context.sourceDirectory },
        );
        if (outcome.exitCode !== 0) {
            throw new Error(`Kotlin/Wasm build failed: ${outcome.standardError}`);
        }
    }
}
export { KotlinWasmCompilerStrategy };
