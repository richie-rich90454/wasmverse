import { delimiter, resolve } from "node:path";
import type { BuildContextRecord } from "@sharedKernel/BuildContextRecord.ts";
import type { CompilerStrategyContract } from "@serverAtelier/compilerStrategies/CompilerStrategyContract.ts";
import { FileSystemOperations } from "@serverAtelier/utilities/FileSystemOperations.ts";
import { ProcessRunner } from "@serverAtelier/utilities/ProcessRunner.ts";
const DEFAULT_SCALA_CLI_BINARY_PATH =
    process.platform === "win32"
        ? "./.tools/scala-cli/scala-cli.exe"
        : "./.tools/scala-cli/scala-cli";
const SCALA_CLI_HOME_DIRECTORY = "./.tools/scala-cli-home";
const COURSIER_CACHE_DIRECTORY = "./.tools/coursier-cache";
const COURSIER_ARCHIVE_CACHE_DIRECTORY = "./.tools/coursier-archive-cache";
const JDK_DIRECTORY = "./.tools/jdk";
class ScalaJsCompilerStrategy implements CompilerStrategyContract {
    private readonly processRunner: ProcessRunner;
    private readonly fileSystemOperations: FileSystemOperations;
    private readonly scalaCliBinaryPath: string;
    constructor(
        processRunner: ProcessRunner,
        fileSystemOperations: FileSystemOperations,
        scalaCliBinaryPath: string = DEFAULT_SCALA_CLI_BINARY_PATH,
    ) {
        this.processRunner = processRunner;
        this.fileSystemOperations = fileSystemOperations;
        this.scalaCliBinaryPath = scalaCliBinaryPath;
    }
    async compileSourceInto(context: BuildContextRecord): Promise<void> {
        if (!(await this.fileSystemOperations.pathExists(this.scalaCliBinaryPath))) {
            throw new Error(
                "Scala CLI not found. Run pnpm run setup to provision ./.tools/scala-cli/.",
            );
        }
        const sourceFilePaths = (
            await this.fileSystemOperations.listFilesRecursively(context.sourceDirectory)
        )
            .filter((relativePath) => relativePath.endsWith(".scala"))
            .map((relativePath) => resolve(context.sourceDirectory, relativePath));
        if (sourceFilePaths.length === 0) {
            throw new Error(
                `Scala.js build failed: no .scala source files found under ${context.sourceDirectory}.`,
            );
        }
        await this.fileSystemOperations.removeRecursively(`${context.runtimeDirectory}/app.js`);
        const outcome = await this.processRunner.runToCompletion(
            [
                resolve(process.cwd(), this.scalaCliBinaryPath),
                "--power",
                "package",
                ...sourceFilePaths,
                "--js",
                "--js-module-kind",
                "es",
                "--js-mode",
                "release",
                "--server=false",
                "-o",
                resolve(context.runtimeDirectory, "app.js"),
                "-f",
            ],
            {
                workingDirectory: context.sourceDirectory,
                environmentOverrides: {
                    JAVA_HOME: resolve(process.cwd(), JDK_DIRECTORY),
                    PATH: `${resolve(process.cwd(), JDK_DIRECTORY, "bin")}${delimiter}${process.env["PATH"] ?? ""}`,
                    SCALA_CLI_HOME: resolve(process.cwd(), SCALA_CLI_HOME_DIRECTORY),
                    COURSIER_CACHE: resolve(process.cwd(), COURSIER_CACHE_DIRECTORY),
                    COURSIER_ARCHIVE_CACHE: resolve(
                        process.cwd(),
                        COURSIER_ARCHIVE_CACHE_DIRECTORY,
                    ),
                },
            },
        );
        if (outcome.exitCode !== 0) {
            const detail =
                outcome.standardError.trim().length > 0
                    ? outcome.standardError
                    : outcome.standardOutput;
            throw new Error(`Scala.js compilation failed: ${detail}`);
        }
        if (!(await this.fileSystemOperations.pathExists(`${context.runtimeDirectory}/app.js`))) {
            throw new Error("Scala.js compilation produced no app.js output.");
        }
    }
}
export { ScalaJsCompilerStrategy };
