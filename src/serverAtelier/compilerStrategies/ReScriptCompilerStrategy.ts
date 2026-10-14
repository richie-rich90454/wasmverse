import { resolve } from "node:path";
import { build } from "esbuild";
import type { BuildContextRecord } from "@sharedKernel/BuildContextRecord.ts";
import type { CompilerStrategyContract } from "@serverAtelier/compilerStrategies/CompilerStrategyContract.ts";
import { FileSystemOperations } from "@serverAtelier/utilities/FileSystemOperations.ts";
import { ProcessRunner } from "@serverAtelier/utilities/ProcessRunner.ts";
const RESCRIPT_TOOLCHAINS_DIRECTORY = "./.tools/js-toolchains";
const RESCRIPT_CLI_RELATIVE_PATH = "node_modules/rescript/cli/rescript.js";
const RESCRIPT_PROJECT_FILE_NAME = "rescript.json";
const RESCRIPT_NODE_MODULES_RESCRIPT_RUNTIME = "@rescript/runtime";
function rescriptProjectText(packageName: string): string {
    return (
        JSON.stringify(
            {
                name: packageName,
                sources: [{ dir: "." }],
                "package-specs": [{ module: "esmodule", "in-source": true }],
                dependencies: [],
            },
            null,
            4,
        ) + "\n"
    );
}
function packageNameFor(sessionIdentifier: string): string {
    const sanitized = sessionIdentifier.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    return `wasmverse-${sanitized || "session"}`;
}
class ReScriptCompilerStrategy implements CompilerStrategyContract {
    private readonly processRunner: ProcessRunner;
    private readonly fileSystemOperations: FileSystemOperations;
    private readonly reScriptCliPath: string;
    constructor(
        processRunner: ProcessRunner,
        fileSystemOperations: FileSystemOperations,
        reScriptCliPath: string = RESCRIPT_CLI_RELATIVE_PATH,
    ) {
        this.processRunner = processRunner;
        this.fileSystemOperations = fileSystemOperations;
        this.reScriptCliPath = reScriptCliPath;
    }
    async compileSourceInto(context: BuildContextRecord): Promise<void> {
        const absoluteReScriptCliPath = resolve(
            process.cwd(),
            RESCRIPT_TOOLCHAINS_DIRECTORY,
            this.reScriptCliPath,
        );
        if (!(await this.fileSystemOperations.pathExists(absoluteReScriptCliPath))) {
            throw new Error(
                "ReScript not found. Run pnpm run setup to provision ./.tools/js-toolchains/.",
            );
        }
        const sourceFilePaths = (
            await this.fileSystemOperations.listFilesRecursively(context.sourceDirectory)
        ).filter((relativePath) => relativePath.endsWith(".res") || relativePath.endsWith(".resi"));
        if (sourceFilePaths.length === 0) {
            throw new Error(
                `ReScript build failed: no .res source files found under ${context.sourceDirectory}.`,
            );
        }
        const projectFilePath = `${context.sourceDirectory}/${RESCRIPT_PROJECT_FILE_NAME}`;
        if (!(await this.fileSystemOperations.pathExists(projectFilePath))) {
            await this.fileSystemOperations.writeTextFile(
                projectFilePath,
                rescriptProjectText(packageNameFor(context.sessionIdentifier)),
            );
        }
        const outcome = await this.processRunner.runToCompletion(
            [process.execPath, absoluteReScriptCliPath, "build"],
            { workingDirectory: context.sourceDirectory },
        );
        if (outcome.exitCode !== 0) {
            const detail =
                outcome.standardError.trim().length > 0
                    ? outcome.standardError
                    : outcome.standardOutput;
            throw new Error(`ReScript compilation failed: ${detail}`);
        }
        const entryModuleRelativePath = context.entryFileRelativePath.replace(/\.res$/, ".js");
        const compiledEntryPath = `${context.sourceDirectory}/${entryModuleRelativePath}`;
        if (!(await this.fileSystemOperations.pathExists(compiledEntryPath))) {
            throw new Error(
                `ReScript produced no JavaScript module for ${context.entryFileRelativePath}.`,
            );
        }
        const sessionNodeModulesDirectory = `${context.sourceDirectory}/node_modules`;
        const runtimeTargetDirectory = `${sessionNodeModulesDirectory}/${RESCRIPT_NODE_MODULES_RESCRIPT_RUNTIME}`;
        await this.fileSystemOperations.removeRecursively(runtimeTargetDirectory);
        await this.fileSystemOperations.copyDirectoryInto(
            resolve(
                process.cwd(),
                RESCRIPT_TOOLCHAINS_DIRECTORY,
                "node_modules",
                RESCRIPT_NODE_MODULES_RESCRIPT_RUNTIME,
            ),
            runtimeTargetDirectory,
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
            throw new Error(`ReScript bundling failed: ${compilationMessage}`);
        } finally {
            await this.fileSystemOperations.removeRecursively(sessionNodeModulesDirectory);
        }
    }
}
export { ReScriptCompilerStrategy };
