import { resolve } from "node:path";
import { build } from "esbuild";
import type { BuildContextRecord } from "@sharedKernel/BuildContextRecord.ts";
import type { CompilerStrategyContract } from "@serverAtelier/compilerStrategies/CompilerStrategyContract.ts";
import { FileSystemOperations } from "@serverAtelier/utilities/FileSystemOperations.ts";
import { ProcessRunner } from "@serverAtelier/utilities/ProcessRunner.ts";
const DEFAULT_FABLE_BINARY_PATH =
    process.platform === "win32"
        ? "./.tools/dotnet-tools/fable.exe"
        : "./.tools/dotnet-tools/fable";
const DOTNET_DIRECTORY = "./.tools/dotnet";
const DOTNET_CLI_HOME_DIRECTORY = "./.tools/dotnet-cli-home";
const NUGET_PACKAGES_DIRECTORY = "./.tools/nuget-packages";
const FABLE_NUGET_PACKAGES_DIRECTORY = "./.tools/fable-nuget-packages";
const FABLE_PROJECT_FILE_NAME = "WasmVerseProgram.fsproj";
const FABLE_OUTPUT_DIRECTORY_NAME = "fable-output";
function fableProjectText(sourceFiles: ReadonlyArray<string>): string {
    return (
        '<Project Sdk="Microsoft.NET.Sdk">\n' +
        "    <PropertyGroup>\n" +
        "        <TargetFramework>net8.0</TargetFramework>\n" +
        "        <OutputType>Library</OutputType>\n" +
        "        <DefineConstants>FABLE_COMPILER</DefineConstants>\n" +
        "    </PropertyGroup>\n" +
        "    <ItemGroup>\n" +
        sourceFiles
            .map(
                (relativePath) =>
                    `        <Compile Include="${relativePath.replace(/\//g, "\\")}" />\n`,
            )
            .join("") +
        "    </ItemGroup>\n" +
        "    <ItemGroup>\n" +
        '        <PackageReference Include="Fable.Core" Version="4.5.0" />\n' +
        "    </ItemGroup>\n" +
        "</Project>\n"
    );
}
class FableCompilerStrategy implements CompilerStrategyContract {
    private readonly processRunner: ProcessRunner;
    private readonly fileSystemOperations: FileSystemOperations;
    private readonly fableBinaryPath: string;
    constructor(
        processRunner: ProcessRunner,
        fileSystemOperations: FileSystemOperations,
        fableBinaryPath: string = DEFAULT_FABLE_BINARY_PATH,
    ) {
        this.processRunner = processRunner;
        this.fileSystemOperations = fileSystemOperations;
        this.fableBinaryPath = fableBinaryPath;
    }
    async compileSourceInto(context: BuildContextRecord): Promise<void> {
        if (!(await this.fileSystemOperations.pathExists(this.fableBinaryPath))) {
            throw new Error(
                "Fable not found. Run pnpm run setup to provision ./.tools/dotnet-tools/fable.",
            );
        }
        const sourceFilePaths = (
            await this.fileSystemOperations.listFilesRecursively(context.sourceDirectory)
        )
            .filter((relativePath) => relativePath.endsWith(".fs"))
            .sort();
        if (sourceFilePaths.length === 0) {
            throw new Error(
                `Fable build failed: no .fs source files found under ${context.sourceDirectory}.`,
            );
        }
        const projectFilePath = `${context.sourceDirectory}/${FABLE_PROJECT_FILE_NAME}`;
        if (!(await this.fileSystemOperations.pathExists(projectFilePath))) {
            await this.fileSystemOperations.writeTextFile(
                projectFilePath,
                fableProjectText(sourceFilePaths),
            );
        }
        const fableOutputDirectory = `${context.sourceDirectory}/${FABLE_OUTPUT_DIRECTORY_NAME}`;
        await this.fileSystemOperations.removeRecursively(fableOutputDirectory);
        const outcome = await this.processRunner.runToCompletion(
            [
                resolve(process.cwd(), this.fableBinaryPath),
                context.sourceDirectory,
                "--outDir",
                fableOutputDirectory,
                "--noCache",
            ],
            {
                workingDirectory: context.sourceDirectory,
                environmentOverrides: this.toolchainEnvironmentOverrides(),
            },
        );
        if (outcome.exitCode !== 0) {
            const detail =
                outcome.standardError.trim().length > 0
                    ? outcome.standardError
                    : outcome.standardOutput;
            throw new Error(`Fable compilation failed: ${detail}`);
        }
        const entryModuleRelativePath = context.entryFileRelativePath.replace(/^.*\//, "");
        const compiledEntryPath = `${fableOutputDirectory}/${entryModuleRelativePath.replace(/\.fs$/i, ".js")}`;
        if (!(await this.fileSystemOperations.pathExists(compiledEntryPath))) {
            throw new Error(`Fable produced no module for ${context.entryFileRelativePath}.`);
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
            throw new Error(`Fable bundling failed: ${compilationMessage}`);
        } finally {
            await this.fileSystemOperations.removeRecursively(fableOutputDirectory);
        }
    }
    private toolchainEnvironmentOverrides(): Record<string, string> {
        return {
            DOTNET_ROOT: resolve(process.cwd(), DOTNET_DIRECTORY),
            DOTNET_CLI_HOME: resolve(process.cwd(), DOTNET_CLI_HOME_DIRECTORY),
            NUGET_PACKAGES: resolve(process.cwd(), NUGET_PACKAGES_DIRECTORY),
            FABLE_NUGET_PACKAGES: resolve(process.cwd(), FABLE_NUGET_PACKAGES_DIRECTORY),
        };
    }
}
export { FableCompilerStrategy };
