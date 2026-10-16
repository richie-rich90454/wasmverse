import { resolve } from "node:path";
import { build } from "esbuild";
import type { BuildContextRecord } from "@sharedKernel/BuildContextRecord.ts";
import type { CompilerStrategyContract } from "@serverAtelier/compilerStrategies/CompilerStrategyContract.ts";
import { FileSystemOperations } from "@serverAtelier/utilities/FileSystemOperations.ts";
import { ProcessRunner } from "@serverAtelier/utilities/ProcessRunner.ts";
const DEFAULT_GLEAM_BINARY_PATH =
    process.platform === "win32" ? "./.tools/gleam/gleam.exe" : "./.tools/gleam/gleam";
const GLEAM_PROJECT_FILE_NAME = "gleam.toml";
const GLEAM_BUILD_DIRECTORY = "build";
const GLEAM_JAVASCRIPT_OUTPUT_DIRECTORY = "build/dev/javascript";
const GLEAM_SOURCES_DIRECTORY_NAME = "src";
const GLEAM_HOST_SHIM_FILE_NAME = "wasmverse_host.mjs";
const GLEAM_HOST_SHIM_TEXT = [
    'import { toList } from "../prelude.mjs";',
    "export const wasmversePrint = (text) => {",
    "    globalThis.wasmversePrint(text);",
    "};",
    "export const wasmversePrintInt = (value) => {",
    "    globalThis.wasmversePrint(String(value));",
    "};",
    "export const wasmverseIntText = (value) => String(value);",
    "export const wasmverseReadLine = () => globalThis.wasmverseReadLine();",
    "export const wasmverseProgramArguments = () => toList(globalThis.wasmverseProgramArguments);",
    "export const wasmverseReadFile = (path) => globalThis.wasmverseReadFile(path);",
    "export const wasmverseListFiles = () => toList(globalThis.wasmverseListFiles());",
    "",
].join("\n");
function gleamProjectText(packageName: string): string {
    return [`name = "${packageName}"`, 'version = "1.0.0"', 'target = "javascript"', ""].join("\n");
}
function packageNameFor(sessionIdentifier: string): string {
    const sanitized = sessionIdentifier.toLowerCase().replace(/[^a-z0-9]+/g, "_");
    return `wasmverse_${sanitized || "session"}`;
}
class GleamCompilerStrategy implements CompilerStrategyContract {
    private readonly processRunner: ProcessRunner;
    private readonly fileSystemOperations: FileSystemOperations;
    private readonly gleamBinaryPath: string;
    constructor(
        processRunner: ProcessRunner,
        fileSystemOperations: FileSystemOperations,
        gleamBinaryPath: string = DEFAULT_GLEAM_BINARY_PATH,
    ) {
        this.processRunner = processRunner;
        this.fileSystemOperations = fileSystemOperations;
        this.gleamBinaryPath = gleamBinaryPath;
    }
    async compileSourceInto(context: BuildContextRecord): Promise<void> {
        if (!(await this.fileSystemOperations.pathExists(this.gleamBinaryPath))) {
            throw new Error("Gleam not found. Run pnpm run setup to provision ./.tools/gleam/.");
        }
        const sourceFilePaths = (
            await this.fileSystemOperations.listFilesRecursively(context.sourceDirectory)
        ).filter((relativePath) => relativePath.endsWith(".gleam"));
        if (sourceFilePaths.length === 0) {
            throw new Error(
                `Gleam build failed: no .gleam source files found under ${context.sourceDirectory}.`,
            );
        }
        const packageName = packageNameFor(context.sessionIdentifier);
        const projectFilePath = `${context.sourceDirectory}/${GLEAM_PROJECT_FILE_NAME}`;
        if (!(await this.fileSystemOperations.pathExists(projectFilePath))) {
            await this.fileSystemOperations.writeTextFile(
                projectFilePath,
                gleamProjectText(packageName),
            );
        }
        for (const sourceFileRelativePath of sourceFilePaths) {
            const moduleRelativePath = sourceFileRelativePath.startsWith(
                `${GLEAM_SOURCES_DIRECTORY_NAME}/`,
            )
                ? sourceFileRelativePath.slice(GLEAM_SOURCES_DIRECTORY_NAME.length + 1)
                : sourceFileRelativePath;
            await this.fileSystemOperations.copyFileInto(
                `${context.sourceDirectory}/${sourceFileRelativePath}`,
                `${context.sourceDirectory}/${GLEAM_SOURCES_DIRECTORY_NAME}/${moduleRelativePath}`,
            );
        }
        await this.fileSystemOperations.removeRecursively(
            `${context.sourceDirectory}/${GLEAM_BUILD_DIRECTORY}`,
        );
        const outcome = await this.processRunner.runToCompletion(
            [resolve(process.cwd(), this.gleamBinaryPath), "build", "--target", "javascript"],
            { workingDirectory: context.sourceDirectory },
        );
        if (outcome.exitCode !== 0) {
            const detail =
                outcome.standardError.trim().length > 0
                    ? outcome.standardError
                    : outcome.standardOutput;
            throw new Error(`Gleam compilation failed: ${detail}`);
        }
        const entryModuleRelativePath = context.entryFileRelativePath
            .replace(/\.gleam$/i, "")
            .replace(new RegExp(`^${GLEAM_SOURCES_DIRECTORY_NAME}/`), "");
        const compiledEntryPath = `${context.sourceDirectory}/${GLEAM_JAVASCRIPT_OUTPUT_DIRECTORY}/${packageName}/${entryModuleRelativePath}.mjs`;
        if (!(await this.fileSystemOperations.pathExists(compiledEntryPath))) {
            throw new Error(
                `Gleam produced no JavaScript module for ${context.entryFileRelativePath}.`,
            );
        }
        await this.fileSystemOperations.writeTextFile(
            `${context.sourceDirectory}/${GLEAM_JAVASCRIPT_OUTPUT_DIRECTORY}/${packageName}/${GLEAM_HOST_SHIM_FILE_NAME}`,
            GLEAM_HOST_SHIM_TEXT,
        );
        await this.fileSystemOperations.removeRecursively(`${context.runtimeDirectory}/app.js`);
        try {
            await build({
                entryPoints: [compiledEntryPath],
                outfile: `${context.runtimeDirectory}/app.js`,
                bundle: true,
                format: "esm",
                platform: "browser",
                target: "es2020",
                minify: false,
                logLevel: "silent",
            });
        } catch (compilationError) {
            const compilationMessage =
                compilationError instanceof Error
                    ? compilationError.message
                    : String(compilationError);
            throw new Error(`Gleam bundling failed: ${compilationMessage}`);
        } finally {
            await this.fileSystemOperations.removeRecursively(
                `${context.sourceDirectory}/${GLEAM_BUILD_DIRECTORY}`,
            );
        }
    }
}
export { GleamCompilerStrategy };
