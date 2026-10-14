import { resolve } from "node:path";
import type { BuildContextRecord } from "@sharedKernel/BuildContextRecord.ts";
import type { CompilerStrategyContract } from "@serverAtelier/compilerStrategies/CompilerStrategyContract.ts";
import { FileSystemOperations } from "@serverAtelier/utilities/FileSystemOperations.ts";
import { ProcessRunner } from "@serverAtelier/utilities/ProcessRunner.ts";
const DEFAULT_HAXE_BINARY_PATH =
    process.platform === "win32" ? "./.tools/haxe/haxe.exe" : "./.tools/haxe/haxe";
const HAXE_STANDARD_LIBRARY_DIRECTORY = "./.tools/haxe/std";
const HAXE_LIBRARY_DIRECTORY_NAME = "haxelib";
function entryClassNameFor(entryFileRelativePath: string): string {
    const withoutExtension = entryFileRelativePath.replace(/\.hx$/i, "");
    const segments = withoutExtension.split("/").filter((segment) => segment.length > 0);
    if (segments.length > 0 && (segments[0] === "src" || segments[0] === "hx")) {
        segments.shift();
    }
    return segments.join(".");
}
class HaxeCompilerStrategy implements CompilerStrategyContract {
    private readonly processRunner: ProcessRunner;
    private readonly fileSystemOperations: FileSystemOperations;
    private readonly haxeBinaryPath: string;
    constructor(
        processRunner: ProcessRunner,
        fileSystemOperations: FileSystemOperations,
        haxeBinaryPath: string = DEFAULT_HAXE_BINARY_PATH,
    ) {
        this.processRunner = processRunner;
        this.fileSystemOperations = fileSystemOperations;
        this.haxeBinaryPath = haxeBinaryPath;
    }
    async compileSourceInto(context: BuildContextRecord): Promise<void> {
        const absoluteHaxeBinaryPath = resolve(process.cwd(), this.haxeBinaryPath);
        if (!(await this.fileSystemOperations.pathExists(absoluteHaxeBinaryPath))) {
            throw new Error("Haxe not found. Run pnpm run setup to provision ./.tools/haxe/.");
        }
        const sourceFilePaths = (
            await this.fileSystemOperations.listFilesRecursively(context.sourceDirectory)
        ).filter((relativePath) => relativePath.endsWith(".hx"));
        if (sourceFilePaths.length === 0) {
            throw new Error(
                `Haxe build failed: no .hx source files found under ${context.sourceDirectory}.`,
            );
        }
        const haxelibDirectory = `${context.sourceDirectory}/${HAXE_LIBRARY_DIRECTORY_NAME}`;
        await this.fileSystemOperations.ensureDirectoryExists(haxelibDirectory);
        await this.fileSystemOperations.ensureDirectoryExists(context.runtimeDirectory);
        const stagedOutputPath = `${context.runtimeDirectory}/haxe-build-output.js`;
        await this.fileSystemOperations.removeRecursively(stagedOutputPath);
        const outcome = await this.processRunner.runToCompletion(
            [
                absoluteHaxeBinaryPath,
                "-main",
                entryClassNameFor(context.entryFileRelativePath),
                "-js",
                resolve(stagedOutputPath),
                "-D",
                "js-es=6",
                "-cp",
                resolve(context.sourceDirectory),
                "-cp",
                resolve(context.sourceDirectory, "src"),
            ],
            {
                workingDirectory: context.sourceDirectory,
                environmentOverrides: {
                    HAXE_STD_PATH: resolve(process.cwd(), HAXE_STANDARD_LIBRARY_DIRECTORY),
                    HAXELIB_PATH: haxelibDirectory,
                },
            },
        );
        if (outcome.exitCode !== 0) {
            const detail =
                outcome.standardError.trim().length > 0
                    ? outcome.standardError
                    : outcome.standardOutput;
            if (!(await this.fileSystemOperations.pathExists(stagedOutputPath))) {
                throw new Error(`Haxe compilation failed: ${detail}`);
            }
        }
        if (!(await this.fileSystemOperations.pathExists(stagedOutputPath))) {
            const detail =
                outcome.standardError.trim().length > 0
                    ? outcome.standardError
                    : outcome.standardOutput;
            throw new Error(`Haxe compilation failed: ${detail}`);
        }
        const compiledText = await this.fileSystemOperations.readTextFile(stagedOutputPath);
        const wrappedText = [compiledText.trimEnd(), "", "export function main() {}", ""].join(
            "\n",
        );
        await this.fileSystemOperations.removeRecursively(`${context.runtimeDirectory}/app.js`);
        await this.fileSystemOperations.writeTextFile(
            `${context.runtimeDirectory}/app.js`,
            wrappedText,
        );
        await this.fileSystemOperations.removeRecursively(stagedOutputPath);
    }
}
export { HaxeCompilerStrategy };
