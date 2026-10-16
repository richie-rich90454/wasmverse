import type { BuildContextRecord } from "@sharedKernel/BuildContextRecord.ts";
import type { CompilerStrategyContract } from "@serverAtelier/compilerStrategies/CompilerStrategyContract.ts";
import { FileSystemOperations } from "@serverAtelier/utilities/FileSystemOperations.ts";
import { ProcessRunner } from "@serverAtelier/utilities/ProcessRunner.ts";
import { ToolchainLocator } from "@serverAtelier/utilities/ToolchainLocator.ts";
const TARGET_FRAMEWORK = "net10.0";
const APP_BUNDLE_RELATIVE_DIRECTORY = "bin/Release/net10.0/browser-wasm/AppBundle";
const APP_BUNDLE_DIRECTORY_NAME = "AppBundle";
/**
 * A browser-wasm publish of a console program produces a .NET app bundle driven by
 * `dotnet.js`, not a Blazor component app, so this is the plain console SDK. It
 * needs `OutputType` `Exe` because the runtime looks for an entry point at all.
 */
function projectText(): string {
    return (
        '<Project Sdk="Microsoft.NET.Sdk">\n' +
        "    <PropertyGroup>\n" +
        `        <TargetFramework>${TARGET_FRAMEWORK}</TargetFramework>\n` +
        "        <OutputType>Exe</OutputType>\n" +
        "        <Nullable>enable</Nullable>\n" +
        // `Microsoft.Extensions.*` is not part of the browser-wasm shared
        // framework, so implicit usings drag in namespaces that will not resolve.
        "        <ImplicitUsings>disable</ImplicitUsings>\n" +
        "        <RuntimeIdentifier>browser-wasm</RuntimeIdentifier>\n" +
        "        <InvariantGlobalization>true</InvariantGlobalization>\n" +
        "        <SatelliteResourceLanguages>en</SatelliteResourceLanguages>\n" +
        "        <NoWarn>$(NoWarn);CA1416</NoWarn>\n" +
        "    </PropertyGroup>\n" +
        "</Project>\n"
    );
}
function projectNameForSession(sessionIdentifier: string): string {
    const sanitized = sessionIdentifier.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    return `Showcase${(sanitized.replace(/(^|-)(\w)/g, (_match, _dash, letter: string) => letter.toUpperCase()) || "Session").replace(/[^A-Za-z0-9]/g, "")}`;
}
class DotNetWasmConsoleCompilerStrategy implements CompilerStrategyContract {
    private readonly processRunner: ProcessRunner;
    private readonly fileSystemOperations: FileSystemOperations;
    private readonly toolchainLocator: ToolchainLocator;
    private readonly dotNetBinaryPath: string;
    constructor(
        processRunner: ProcessRunner,
        fileSystemOperations: FileSystemOperations,
        dotNetBinaryPath: string = "./.tools/dotnet/dotnet",
    ) {
        this.processRunner = processRunner;
        this.fileSystemOperations = fileSystemOperations;
        this.toolchainLocator = new ToolchainLocator(fileSystemOperations);
        this.dotNetBinaryPath = dotNetBinaryPath;
    }
    async compileSourceInto(context: BuildContextRecord): Promise<void> {
        const projectName = await this.ensureProject(context);
        const dotnetBinary = await this.toolchainLocator.resolveCommandVector(
            this.dotNetBinaryPath,
            "dotnet",
            "DotNet",
        );
        // The runnable artifact is the AppBundle, whose `dotnet.boot.js` holds the
        // resource manifest and points at a `_framework` folder of AOT compiled
        // assemblies. A flat `-o` publish leaves `dotnet.js` without the config
        // file it insists on loading, so the boot config has to come along.
        const stagingOutputDirectory = `${context.sourceDirectory}/${APP_BUNDLE_DIRECTORY_NAME}`;
        let outcome;
        try {
            outcome = await this.processRunner.runToCompletion(
                [
                    ...dotnetBinary,
                    "publish",
                    "-c",
                    "Release",
                    "-r",
                    "browser-wasm",
                    "--self-contained",
                    "true",
                    "-p:PublishTrimmed=false",
                    "-p:WasmBuildNative=true",
                    "-o",
                    stagingOutputDirectory,
                ],
                { workingDirectory: context.sourceDirectory },
            );
        } catch {
            throw new Error(
                "dotnet SDK not found. Run pnpm run setup to provision ./.tools/dotnet/ or install dotnet on PATH.",
            );
        }
        if (outcome.exitCode !== 0) {
            const detail =
                outcome.standardError.trim().length > 0
                    ? outcome.standardError
                    : outcome.standardOutput;
            throw new Error(`dotnet publish failed: ${detail}`);
        }
        const appBundleDirectory = `${context.sourceDirectory}/${APP_BUNDLE_RELATIVE_DIRECTORY}/_framework`;
        if (!(await this.fileSystemOperations.pathExists(appBundleDirectory))) {
            throw new Error(
                `dotnet publish did not produce an app bundle under ${APP_BUNDLE_RELATIVE_DIRECTORY}/_framework.`,
            );
        }
        const publishedFiles =
            await this.fileSystemOperations.listFilesRecursively(appBundleDirectory);
        for (const relativePath of publishedFiles) {
            await this.fileSystemOperations.copyFileInto(
                `${appBundleDirectory}/${relativePath}`,
                `${context.runtimeDirectory}/_framework/${relativePath}`,
            );
        }
        await this.fileSystemOperations.copyFileInto(
            `${stagingOutputDirectory}/${projectName}.runtimeconfig.json`,
            `${context.runtimeDirectory}/${projectName}.runtimeconfig.json`,
        );
    }
    /**
     * A browser-wasm publish needs a project file, and an uploaded archive holds
     * only the one `.cs` file, so scaffold a console project around it the way the
     * Rust and Java strategies do.
     */
    private async ensureProject(context: BuildContextRecord): Promise<string> {
        const baseName = (context.entryFileRelativePath.split("/").pop() as string).replace(
            /\.cs$/i,
            "",
        );
        const projectName = projectNameForSession(context.sessionIdentifier);
        const projectFile = `${context.sourceDirectory}/${projectName}.csproj`;
        if (await this.fileSystemOperations.pathExists(projectFile)) {
            return projectName;
        }
        await this.fileSystemOperations.writeTextFile(projectFile, projectText());
        const entryFileName = context.entryFileRelativePath.split("/").pop() as string;
        if (entryFileName !== `${baseName}.cs`) {
            const entrySource = await this.fileSystemOperations.readTextFile(
                `${context.sourceDirectory}/${context.entryFileRelativePath}`,
            );
            await this.fileSystemOperations.writeTextFile(
                `${context.sourceDirectory}/${baseName}.cs`,
                entrySource,
            );
            await this.fileSystemOperations.removeRecursively(
                `${context.sourceDirectory}/${entryFileName}`,
            );
        }
        return projectName;
    }
}
export { DotNetWasmConsoleCompilerStrategy };
