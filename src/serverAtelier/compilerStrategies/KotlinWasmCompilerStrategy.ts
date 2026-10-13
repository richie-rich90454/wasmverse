import { delimiter, resolve } from "node:path";
import type { BuildContextRecord } from "@sharedKernel/BuildContextRecord.ts";
import type { CompilerStrategyContract } from "@serverAtelier/compilerStrategies/CompilerStrategyContract.ts";
import { FileSystemOperations } from "@serverAtelier/utilities/FileSystemOperations.ts";
import { ProcessRunner } from "@serverAtelier/utilities/ProcessRunner.ts";
const DEFAULT_KOTLIN_COMPILER_PATH =
    process.platform === "win32"
        ? "./.tools/kotlin-wasm/bin/kotlinc-js.bat"
        : "./.tools/kotlin-wasm/bin/kotlinc-js";
const KOTLIN_JDK_DIRECTORY = "./.tools/jdk";
const KOTLIN_STDLIB_KLIB_RELATIVE_PATH = "lib/kotlin-stdlib-js.klib";
const KOTLIN_INTERMEDIATE_KLIB_DIRECTORY_NAME = "kotlin-klib";
const KOTLIN_INTERMEDIATE_KLIB_NAME = "out";
const KOTLIN_OUTPUT_FILE_NAME = "app";
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
                "Kotlin/JS toolchain not found. Run pnpm run setup to provision ./.tools/kotlin-wasm/.",
            );
        }
        const sourceFilePaths = (
            await this.fileSystemOperations.listFilesRecursively(context.sourceDirectory)
        ).filter((relativePath) => relativePath.endsWith(".kt"));
        if (sourceFilePaths.length === 0) {
            throw new Error(
                `Kotlin/JS build failed: no .kt source files found under ${context.sourceDirectory}.`,
            );
        }
        const absoluteKotlinDirectory = resolve(process.cwd(), "./.tools/kotlin-wasm");
        const stdlibKlibPath = `${absoluteKotlinDirectory}/${KOTLIN_STDLIB_KLIB_RELATIVE_PATH}`;
        const intermediateKlibDirectory = `${context.runtimeDirectory}/${KOTLIN_INTERMEDIATE_KLIB_DIRECTORY_NAME}`;
        await this.fileSystemOperations.removeRecursively(intermediateKlibDirectory);
        await this.fileSystemOperations.ensureDirectoryExists(intermediateKlibDirectory);
        const klibOutcome = await this.runKotlinCompiler(
            [
                ...sourceFilePaths,
                "-nopack",
                "-libraries",
                stdlibKlibPath,
                "-ir-output-dir",
                intermediateKlibDirectory,
                "-ir-output-name",
                KOTLIN_INTERMEDIATE_KLIB_NAME,
            ],
            context.sourceDirectory,
        );
        if (klibOutcome.exitCode !== 0) {
            throw new Error(`Kotlin/JS build failed: ${klibOutcome.standardError}`);
        }
        const linkOutcome = await this.runKotlinCompiler(
            [
                "-Xir-produce-js",
                "-libraries",
                stdlibKlibPath,
                `-Xinclude=${intermediateKlibDirectory}`,
                "-ir-output-dir",
                context.runtimeDirectory,
                "-ir-output-name",
                KOTLIN_OUTPUT_FILE_NAME,
                "-module-kind",
                "es",
                "-main",
                "call",
            ],
            context.sourceDirectory,
        );
        if (linkOutcome.exitCode !== 0) {
            throw new Error(`Kotlin/JS build failed: ${linkOutcome.standardError}`);
        }
        await this.fileSystemOperations.moveInto(
            `${context.runtimeDirectory}/${KOTLIN_OUTPUT_FILE_NAME}.mjs`,
            `${context.runtimeDirectory}/${KOTLIN_OUTPUT_FILE_NAME}.js`,
        );
        await this.fileSystemOperations.removeRecursively(intermediateKlibDirectory);
    }
    private async runKotlinCompiler(
        compilationArguments: ReadonlyArray<string>,
        workingDirectory: string,
    ): Promise<{ exitCode: number; standardOutput: string; standardError: string }> {
        const absoluteCompilerPath = resolve(process.cwd(), this.kotlinCompilerPath);
        const absoluteJdkDirectory = resolve(process.cwd(), KOTLIN_JDK_DIRECTORY);
        const environmentOverrides = {
            JAVA_HOME: absoluteJdkDirectory,
            PATH: `${resolve(absoluteJdkDirectory, "bin")}${delimiter}${process.env["PATH"] ?? ""}`,
        };
        return await this.processRunner.runToCompletion(
            process.platform === "win32"
                ? ["cmd", "/c", absoluteCompilerPath, ...compilationArguments]
                : [absoluteCompilerPath, ...compilationArguments],
            { workingDirectory, environmentOverrides },
        );
    }
}
export { KotlinWasmCompilerStrategy };
