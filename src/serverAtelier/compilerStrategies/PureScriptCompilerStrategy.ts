import { glob } from "node:fs/promises";
import { resolve } from "node:path";
import { build } from "esbuild";
import type { BuildContextRecord } from "@sharedKernel/BuildContextRecord.ts";
import type { CompilerStrategyContract } from "@serverAtelier/compilerStrategies/CompilerStrategyContract.ts";
import { FileSystemOperations } from "@serverAtelier/utilities/FileSystemOperations.ts";
import { ProcessRunner } from "@serverAtelier/utilities/ProcessRunner.ts";
const DEFAULT_PURESCRIPT_BINARY_PATH =
    process.platform === "win32" ? "./.tools/purescript/purs.exe" : "./.tools/purescript/purs";
const PURESCRIPT_LIBRARIES_DIRECTORY = "./.tools/purescript-libraries";
const PURESCRIPT_OUTPUT_DIRECTORY_NAME = "purescript-output";
const WASMVERSE_HOST_MODULE_NAME = "WasmverseHost";
const WASMVERSE_HOST_MODULE_TEXT = [
    "module WasmverseHost where",
    "",
    "import Prelude",
    "",
    "import Effect (Effect)",
    "",
    "foreign import wasmversePrint :: String -> Effect Unit",
    "foreign import wasmverseReadLine :: Effect String",
    "foreign import wasmverseProgramArguments :: Effect (Array String)",
    "foreign import wasmverseReadFile :: String -> Effect String",
    "foreign import wasmverseListFiles :: Effect (Array String)",
    "",
].join("\n");
const WASMVERSE_HOST_FOREIGN_TEXT = [
    "export const wasmversePrint = (text) => () => {",
    "    globalThis.wasmversePrint(text);",
    "};",
    "export const wasmverseReadLine = () => globalThis.wasmverseReadLine();",
    "export const wasmverseProgramArguments = () => globalThis.wasmverseProgramArguments;",
    "export const wasmverseReadFile = (path) => () => globalThis.wasmverseReadFile(path);",
    "export const wasmverseListFiles = () => globalThis.wasmverseListFiles();",
    "",
].join("\n");
class PureScriptCompilerStrategy implements CompilerStrategyContract {
    private readonly processRunner: ProcessRunner;
    private readonly fileSystemOperations: FileSystemOperations;
    private readonly pureScriptBinaryPath: string;
    constructor(
        processRunner: ProcessRunner,
        fileSystemOperations: FileSystemOperations,
        pureScriptBinaryPath: string = DEFAULT_PURESCRIPT_BINARY_PATH,
    ) {
        this.processRunner = processRunner;
        this.fileSystemOperations = fileSystemOperations;
        this.pureScriptBinaryPath = pureScriptBinaryPath;
    }
    async compileSourceInto(context: BuildContextRecord): Promise<void> {
        if (!(await this.fileSystemOperations.pathExists(this.pureScriptBinaryPath))) {
            throw new Error(
                "PureScript not found. Run pnpm run setup to provision ./.tools/purescript/.",
            );
        }
        await this.fileSystemOperations.writeTextFile(
            `${context.sourceDirectory}/${WASMVERSE_HOST_MODULE_NAME}.purs`,
            WASMVERSE_HOST_MODULE_TEXT,
        );
        await this.fileSystemOperations.writeTextFile(
            `${context.sourceDirectory}/${WASMVERSE_HOST_MODULE_NAME}.js`,
            WASMVERSE_HOST_FOREIGN_TEXT,
        );
        const sourceFilePaths = (
            await this.fileSystemOperations.listFilesRecursively(context.sourceDirectory)
        )
            .filter((relativePath) => relativePath.endsWith(".purs"))
            .map((relativePath) => resolve(context.sourceDirectory, relativePath));
        if (sourceFilePaths.length === 0) {
            throw new Error(
                `PureScript build failed: no .purs source files found under ${context.sourceDirectory}.`,
            );
        }
        const libraryFilePaths = await this.listLibrarySourceFiles();
        if (libraryFilePaths.length === 0) {
            throw new Error(
                "PureScript libraries are missing. Run pnpm run setup to vendor ./.tools/purescript-libraries/.",
            );
        }
        const outputDirectory = `${context.sourceDirectory}/${PURESCRIPT_OUTPUT_DIRECTORY_NAME}`;
        await this.fileSystemOperations.removeRecursively(outputDirectory);
        const outcome = await this.processRunner.runToCompletion(
            [
                resolve(process.cwd(), this.pureScriptBinaryPath),
                "compile",
                ...sourceFilePaths,
                ...libraryFilePaths,
                "--codegen",
                "js",
                "--output",
                outputDirectory,
            ],
            { workingDirectory: context.sourceDirectory },
        );
        if (outcome.exitCode !== 0) {
            const detail =
                outcome.standardError.trim().length > 0
                    ? outcome.standardError
                    : outcome.standardOutput;
            throw new Error(`PureScript compilation failed: ${detail}`);
        }
        const entryModuleName = (context.entryFileRelativePath.split("/").pop() as string).replace(
            /\.purs$/i,
            "",
        );
        const compiledEntryPath = `${outputDirectory}/${entryModuleName}/index.js`;
        if (!(await this.fileSystemOperations.pathExists(compiledEntryPath))) {
            throw new Error(
                `PureScript produced no JavaScript module for ${context.entryFileRelativePath}.`,
            );
        }
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
            throw new Error(`PureScript bundling failed: ${compilationMessage}`);
        } finally {
            await this.fileSystemOperations.removeRecursively(outputDirectory);
        }
    }
    private async listLibrarySourceFiles(): Promise<Array<string>> {
        const libraryDirectory = resolve(process.cwd(), PURESCRIPT_LIBRARIES_DIRECTORY);
        const collectedFilePaths: Array<string> = [];
        for await (const entryPath of glob("**/*.purs", { cwd: libraryDirectory })) {
            collectedFilePaths.push(resolve(libraryDirectory, String(entryPath)));
        }
        return collectedFilePaths.sort();
    }
}
export { PureScriptCompilerStrategy };
