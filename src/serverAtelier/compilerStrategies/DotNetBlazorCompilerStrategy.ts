import { resolve } from "node:path";
import type { BuildContextRecord } from "@sharedKernel/BuildContextRecord.ts";
import type { CompilerStrategyContract } from "@serverAtelier/compilerStrategies/CompilerStrategyContract.ts";
import { FileSystemOperations } from "@serverAtelier/utilities/FileSystemOperations.ts";
import { ProcessRunner } from "@serverAtelier/utilities/ProcessRunner.ts";
const DOTNET_PROJECT_FILE_NAME = "WasmVerseProgram.csproj";
const DOTNET_HOST_SUPPORT_FILE_NAME = "WasmVerseHost.cs";
const DEFAULT_TARGET_FRAMEWORK = "net8.0";
const DOTNET_TOOLCHAIN_DIRECTORY = "./.tools/dotnet";
const DEFAULT_DOTNET_BINARY_PATH =
    process.platform === "win32" ? "./.tools/dotnet/dotnet.exe" : "./.tools/dotnet/dotnet";
const APP_BUNDLE_FILE_PATTERN = /^bin\/Release\/[^/]+\/browser-wasm\/AppBundle\/_framework\/(.+)$/;
function dotnetProjectText(targetFramework: string): string {
    return (
        '<Project Sdk="Microsoft.NET.Sdk">\n' +
        "    <PropertyGroup>\n" +
        `        <TargetFramework>${targetFramework}</TargetFramework>\n` +
        "        <OutputType>Exe</OutputType>\n" +
        "        <RuntimeIdentifier>browser-wasm</RuntimeIdentifier>\n" +
        "        <Nullable>enable</Nullable>\n" +
        "        <ImplicitUsings>disable</ImplicitUsings>\n" +
        "        <AllowUnsafeBlocks>true</AllowUnsafeBlocks>\n" +
        "    </PropertyGroup>\n" +
        "</Project>\n"
    );
}
function dotnetHostSupportText(): string {
    return (
        "using System.Runtime.InteropServices.JavaScript;\n" +
        "\n" +
        "internal partial class WasmVerseHost {\n" +
        '    [JSImport("readLine", "WasmVerseHost")]\n' +
        "    internal static partial string ReadLine();\n" +
        "\n" +
        '    [JSImport("getArguments", "WasmVerseHost")]\n' +
        "    internal static partial string[] GetArguments();\n" +
        "\n" +
        '    [JSImport("readFile", "WasmVerseHost")]\n' +
        "    internal static partial string ReadFile(string path);\n" +
        "\n" +
        '    [JSImport("listFiles", "WasmVerseHost")]\n' +
        "    internal static partial string[] ListFiles();\n" +
        "}\n"
    );
}
class DotNetBlazorCompilerStrategy implements CompilerStrategyContract {
    private readonly processRunner: ProcessRunner;
    private readonly fileSystemOperations: FileSystemOperations;
    private readonly dotNetBinaryPath: string;
    constructor(
        processRunner: ProcessRunner,
        fileSystemOperations: FileSystemOperations,
        dotNetBinaryPath: string = DEFAULT_DOTNET_BINARY_PATH,
    ) {
        this.processRunner = processRunner;
        this.fileSystemOperations = fileSystemOperations;
        this.dotNetBinaryPath = dotNetBinaryPath;
    }
    async compileSourceInto(context: BuildContextRecord): Promise<void> {
        if (!(await this.fileSystemOperations.pathExists(this.dotNetBinaryPath))) {
            throw new Error(
                "dotnet SDK not found. Run pnpm run setup to provision ./.tools/dotnet/.",
            );
        }
        await this.ensureProjectFile(context, this.dotNetBinaryPath);
        const outcome = await this.processRunner.runToCompletion(
            [this.dotNetBinaryPath, "publish", "-c", "Release", "-r", "browser-wasm"],
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
            throw new Error(`dotnet publish failed: ${detail}`);
        }
        await this.publishAppBundle(context);
    }
    private toolchainEnvironmentOverrides(): Record<string, string> {
        return {
            DOTNET_ROOT: resolve(process.cwd(), DOTNET_TOOLCHAIN_DIRECTORY),
            DOTNET_CLI_HOME: resolve(process.cwd(), "./.tools/dotnet-cli-home"),
            NUGET_PACKAGES: resolve(process.cwd(), "./.tools/nuget-packages"),
        };
    }
    private async ensureProjectFile(
        context: BuildContextRecord,
        dotnetBinary: string,
    ): Promise<void> {
        const existingFiles = await this.fileSystemOperations.listFilesRecursively(
            context.sourceDirectory,
        );
        const alreadyHasProjectFile = existingFiles.some((relativePath) =>
            relativePath.toLowerCase().endsWith(".csproj"),
        );
        if (alreadyHasProjectFile) {
            return;
        }
        await this.fileSystemOperations.writeTextFile(
            `${context.sourceDirectory}/${DOTNET_PROJECT_FILE_NAME}`,
            dotnetProjectText(await this.resolveTargetFramework(dotnetBinary)),
        );
        if (!existingFiles.includes(DOTNET_HOST_SUPPORT_FILE_NAME)) {
            await this.fileSystemOperations.writeTextFile(
                `${context.sourceDirectory}/${DOTNET_HOST_SUPPORT_FILE_NAME}`,
                dotnetHostSupportText(),
            );
        }
    }
    private async resolveTargetFramework(dotnetBinary: string): Promise<string> {
        try {
            const versionOutcome = await this.processRunner.runToCompletion(
                [dotnetBinary, "--version"],
                { environmentOverrides: this.toolchainEnvironmentOverrides() },
            );
            const majorVersion = versionOutcome.standardOutput.trim().split(".")[0] ?? "";
            if (/^\d+$/.test(majorVersion)) {
                return `net${majorVersion}.0`;
            }
        } catch {}
        return DEFAULT_TARGET_FRAMEWORK;
    }
    private async publishAppBundle(context: BuildContextRecord): Promise<void> {
        const sourceFiles = await this.fileSystemOperations.listFilesRecursively(
            context.sourceDirectory,
        );
        const appBundleFiles = sourceFiles
            .map((relativePath) => APP_BUNDLE_FILE_PATTERN.exec(relativePath))
            .filter((matchedPath): matchedPath is RegExpExecArray => matchedPath !== null);
        if (appBundleFiles.length === 0) {
            throw new Error(
                "dotnet publish produced no browser-wasm app bundle. Check the wasm-tools workload and the project's TargetFramework.",
            );
        }
        for (const matchedPath of appBundleFiles) {
            const bundleRelativePath = matchedPath[1] as string;
            await this.fileSystemOperations.copyFileInto(
                `${context.sourceDirectory}/${matchedPath[0]}`,
                `${context.runtimeDirectory}/${bundleRelativePath}`,
            );
        }
    }
}
export { DotNetBlazorCompilerStrategy };
