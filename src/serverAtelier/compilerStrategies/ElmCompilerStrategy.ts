import { resolve } from "node:path";
import type { BuildContextRecord } from "@sharedKernel/BuildContextRecord.ts";
import type { CompilerStrategyContract } from "@serverAtelier/compilerStrategies/CompilerStrategyContract.ts";
import { FileSystemOperations } from "@serverAtelier/utilities/FileSystemOperations.ts";
import { ProcessRunner } from "@serverAtelier/utilities/ProcessRunner.ts";
const DEFAULT_ELM_BINARY_PATH =
    process.platform === "win32" ? "./.tools/elm/elm.exe" : "./.tools/elm/elm";
const ELM_HOME_DIRECTORY = "./.tools/elm-home";
const ELM_PROJECT_FILE_NAME = "elm.json";
const ELM_BUILD_OUTPUT_FILE_NAME = "elm-build-output.js";
const ELM_PROJECT_TEXT = [
    "{",
    '    "type": "application",',
    '    "source-directories": ["."],',
    '    "elm-version": "0.19.3",',
    '    "dependencies": {',
    '        "direct": {',
    '            "elm/core": "1.0.5",',
    '            "elm/json": "1.1.4"',
    "        },",
    '        "indirect": {}',
    "    },",
    '    "test-dependencies": {',
    '        "direct": {},',
    '        "indirect": {}',
    "    }",
    "}",
    "",
].join("\n");
function firstLineOf(elmErrorReport: string): string | undefined {
    try {
        const report = JSON.parse(elmErrorReport.trim()) as {
            errors?: Array<{ problems?: Array<{ title?: string; message?: Array<unknown> }> }>;
            title?: string;
            message?: Array<unknown>;
        };
        const problems = report.errors?.flatMap((entry) => entry.problems ?? []) ?? [];
        const firstProblem = problems[0];
        if (firstProblem) {
            const detail = firstProblem.message
                ?.filter((part): part is string => typeof part === "string")
                .join(" ")
                .trim();
            return `${firstProblem.title ?? "compile error"}${detail ? `: ${detail}` : ""}`;
        }
        if (report.title) {
            const detail = report.message
                ?.filter((part): part is string => typeof part === "string")
                .join(" ")
                .trim();
            return `${report.title}${detail ? `: ${detail}` : ""}`;
        }
    } catch {}
    const firstMeaningfulLine = elmErrorReport
        .split("\n")
        .map((line) => line.trim())
        .find((line) => line.length > 0);
    return firstMeaningfulLine;
}
class ElmCompilerStrategy implements CompilerStrategyContract {
    private readonly processRunner: ProcessRunner;
    private readonly fileSystemOperations: FileSystemOperations;
    private readonly elmBinaryPath: string;
    constructor(
        processRunner: ProcessRunner,
        fileSystemOperations: FileSystemOperations,
        elmBinaryPath: string = DEFAULT_ELM_BINARY_PATH,
    ) {
        this.processRunner = processRunner;
        this.fileSystemOperations = fileSystemOperations;
        this.elmBinaryPath = elmBinaryPath;
    }
    async compileSourceInto(context: BuildContextRecord): Promise<void> {
        if (!(await this.fileSystemOperations.pathExists(this.elmBinaryPath))) {
            throw new Error("Elm not found. Run pnpm run setup to provision ./.tools/elm/.");
        }
        const sourceFilePaths = (
            await this.fileSystemOperations.listFilesRecursively(context.sourceDirectory)
        )
            .filter((relativePath) => relativePath.endsWith(".elm"))
            .sort();
        if (sourceFilePaths.length === 0) {
            throw new Error(
                `Elm build failed: no .elm source files found under ${context.sourceDirectory}.`,
            );
        }
        const projectFilePath = `${context.sourceDirectory}/${ELM_PROJECT_FILE_NAME}`;
        if (!(await this.fileSystemOperations.pathExists(projectFilePath))) {
            await this.fileSystemOperations.writeTextFile(projectFilePath, ELM_PROJECT_TEXT);
        }
        const buildOutputPath = `${context.sourceDirectory}/${ELM_BUILD_OUTPUT_FILE_NAME}`;
        await this.fileSystemOperations.removeRecursively(buildOutputPath);
        try {
            const outcome = await this.processRunner.runToCompletion(
                [
                    resolve(process.cwd(), this.elmBinaryPath),
                    "make",
                    context.entryFileRelativePath,
                    `--output=${ELM_BUILD_OUTPUT_FILE_NAME}`,
                    "--report=json",
                ],
                {
                    workingDirectory: context.sourceDirectory,
                    environmentOverrides: {
                        ELM_HOME: resolve(process.cwd(), ELM_HOME_DIRECTORY),
                    },
                },
            );
            if (outcome.exitCode !== 0) {
                const rawReport =
                    outcome.standardError.trim().length > 0
                        ? outcome.standardError
                        : outcome.standardOutput;
                const summary = firstLineOf(rawReport) ?? "unknown error";
                throw new Error(`Elm compilation failed: ${summary}`);
            }
            await this.publishConvertedApp(context, buildOutputPath);
        } finally {
            await this.fileSystemOperations.removeRecursively(buildOutputPath);
        }
    }
    private async publishConvertedApp(
        context: BuildContextRecord,
        buildOutputPath: string,
    ): Promise<void> {
        const compiledText = await this.fileSystemOperations.readTextFile(buildOutputPath);
        const scopeInvocationTail = "}(this));";
        const tailIndex = compiledText.lastIndexOf(scopeInvocationTail);
        if (!compiledText.startsWith("(function(scope){") || tailIndex < 0) {
            throw new Error("Elm compilation produced an unexpected output shape.");
        }
        const convertedText =
            compiledText.slice(0, tailIndex) +
            "}(globalThis));" +
            compiledText.slice(tailIndex + scopeInvocationTail.length);
        await this.fileSystemOperations.removeRecursively(`${context.runtimeDirectory}/app.js`);
        await this.fileSystemOperations.writeTextFile(
            `${context.runtimeDirectory}/app.js`,
            convertedText,
        );
    }
}
export { ElmCompilerStrategy };
