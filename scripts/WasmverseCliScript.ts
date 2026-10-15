import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { zipSync } from "fflate";
import { ScopedLogger } from "@serverAtelier/ScopedLogger.ts";
import { ServerComposition } from "@serverAtelier/ServerComposition.ts";
const IGNORED_PROJECT_DIRECTORY_NAMES = new Set([
    ".emsdk",
    ".git",
    ".tools",
    "dist",
    "node_modules",
    "sessions",
]);
const IGNORED_PROJECT_FILE_NAMES = new Set([".DS_Store", "Thumbs.db"]);
class CliUsageError extends Error {}
interface BuildRequest {
    kind: "build";
    projectDirectory: string;
    entryFileName: string;
    programArguments: Array<string>;
    outputPath: string | undefined;
}
interface HelpRequest {
    kind: "help";
}
interface ListLanguagesRequest {
    kind: "list-languages";
}
type CliRequest = BuildRequest | HelpRequest | ListLanguagesRequest;
const USAGE_TEXT = [
    "WASMVERSE CLI",
    "",
    "Usage:",
    '  wasmverse build <directory> --entry <fileName> [--args "arg1\\narg2"] [--out <file.zip>]',
    "  wasmverse --list-languages",
    "  wasmverse --help",
    "",
    "Options:",
    "  --entry <fileName>  Entry file name inside the project directory. Required.",
    "  --args <arguments>  Program arguments separated by newlines.",
    "  --out <file.zip>    Output path. Defaults to <entry-base>.zip in the working directory.",
    "  --list-languages    Print every registered language identifier.",
    "  --help              Print this message.",
    "",
    "Examples:",
    "  wasmverse build ./my-project --entry main.py",
    "  wasmverse build ./my-project --entry main.py --out exports/my-app.zip",
].join("\n");
const scopedLogger = new ScopedLogger("WasmverseCli");
const invocationDirectory = process.env.WASMVERSE_INVOCATION_DIRECTORY ?? process.cwd();
function readOptionValue(
    optionName: string,
    commandArguments: ReadonlyArray<string>,
    optionIndex: number,
): string {
    const optionValue = commandArguments[optionIndex + 1];
    if (optionValue === undefined || optionValue.startsWith("--")) {
        throw new CliUsageError(`Missing value for ${optionName}.`);
    }
    return optionValue;
}
function parseProgramArgumentsText(programArgumentsText: string): Array<string> {
    return programArgumentsText
        .split(/\r?\n/)
        .map((argument) => argument.trim())
        .filter((argument) => argument.length > 0);
}
function parseCommandLineArguments(rawArguments: ReadonlyArray<string>): CliRequest {
    const [command, ...commandArguments] = rawArguments;
    if (command === undefined) {
        throw new CliUsageError("Missing command.");
    }
    if (command === "--help" || command === "-h") {
        return { kind: "help" };
    }
    if (command === "--list-languages") {
        return { kind: "list-languages" };
    }
    if (command !== "build") {
        throw new CliUsageError(`Unknown command ${command}.`);
    }
    let projectDirectory: string | undefined;
    let entryFileName: string | undefined;
    let outputPath: string | undefined;
    let programArgumentsText = "";
    for (let argumentIndex = 0; argumentIndex < commandArguments.length; argumentIndex += 1) {
        const argument = commandArguments[argumentIndex] as string;
        if (argument === "--entry") {
            entryFileName = readOptionValue(argument, commandArguments, argumentIndex);
            argumentIndex += 1;
            continue;
        }
        if (argument === "--args") {
            programArgumentsText = readOptionValue(argument, commandArguments, argumentIndex);
            argumentIndex += 1;
            continue;
        }
        if (argument === "--out") {
            outputPath = readOptionValue(argument, commandArguments, argumentIndex);
            argumentIndex += 1;
            continue;
        }
        if (argument.startsWith("--")) {
            throw new CliUsageError(`Unknown option ${argument}.`);
        }
        if (projectDirectory !== undefined) {
            throw new CliUsageError(`Unexpected argument ${argument}.`);
        }
        projectDirectory = argument;
    }
    if (projectDirectory === undefined) {
        throw new CliUsageError("Missing project directory.");
    }
    if (entryFileName === undefined || entryFileName.trim().length === 0) {
        throw new CliUsageError("Missing required option --entry.");
    }
    return {
        kind: "build",
        projectDirectory,
        entryFileName: entryFileName.trim(),
        programArguments: parseProgramArgumentsText(programArgumentsText),
        outputPath,
    };
}
function deriveDefaultOutputPath(entryFileName: string): string {
    const entryBaseName = entryFileName.replace(/\\/g, "/").split("/").pop() as string;
    const finalDotIndex = entryBaseName.lastIndexOf(".");
    const entryStem = finalDotIndex > 0 ? entryBaseName.slice(0, finalDotIndex) : entryBaseName;
    return `${entryStem}.zip`;
}
function isIgnoredProjectEntry(relativePath: string): boolean {
    const pathSegments = relativePath.split("/");
    const fileName = pathSegments[pathSegments.length - 1] as string;
    return (
        pathSegments.some((segment) => IGNORED_PROJECT_DIRECTORY_NAMES.has(segment)) ||
        IGNORED_PROJECT_FILE_NAMES.has(fileName)
    );
}
async function collectProjectArchiveEntries(
    projectDirectory: string,
): Promise<Record<string, Uint8Array>> {
    const archiveEntries: Record<string, Uint8Array> = {};
    const walkDirectory = async (
        absoluteDirectory: string,
        relativeDirectory: string,
    ): Promise<void> => {
        const directoryEntries = await readdir(absoluteDirectory, { withFileTypes: true });
        for (const directoryEntry of directoryEntries) {
            const childRelativePath =
                relativeDirectory.length > 0
                    ? `${relativeDirectory}/${directoryEntry.name}`
                    : directoryEntry.name;
            if (isIgnoredProjectEntry(childRelativePath)) {
                continue;
            }
            const childAbsolutePath = resolve(absoluteDirectory, directoryEntry.name);
            if (directoryEntry.isDirectory()) {
                await walkDirectory(childAbsolutePath, childRelativePath);
                continue;
            }
            if (directoryEntry.isFile()) {
                archiveEntries[childRelativePath] = new Uint8Array(
                    await readFile(childAbsolutePath),
                );
            }
        }
    };
    await walkDirectory(resolve(projectDirectory), "");
    return archiveEntries;
}
async function createProjectArchiveBytes(projectDirectory: string): Promise<Uint8Array> {
    const archiveEntries = await collectProjectArchiveEntries(projectDirectory);
    if (Object.keys(archiveEntries).length === 0) {
        throw new Error(`Project directory ${projectDirectory} contains no files to package.`);
    }
    return zipSync(archiveEntries);
}
async function performBuild(request: BuildRequest): Promise<void> {
    const projectDirectory = resolve(invocationDirectory, request.projectDirectory);
    const directoryStatistics = await stat(projectDirectory).catch(() => undefined);
    if (!directoryStatistics?.isDirectory()) {
        throw new Error(`Project directory ${projectDirectory} does not exist.`);
    }
    const outputPath = resolve(
        invocationDirectory,
        request.outputPath ?? deriveDefaultOutputPath(request.entryFileName),
    );
    if (!outputPath.toLowerCase().endsWith(".zip")) {
        throw new Error(
            "Only .zip output is supported. The single-file HTML exporter is not available in this build.",
        );
    }
    scopedLogger.logInformation(`Packaging ${projectDirectory}.`);
    const archiveBytes = await createProjectArchiveBytes(projectDirectory);
    const composition = new ServerComposition();
    const descriptor = await composition.buildOrchestrator.produceBuildOutcome(
        archiveBytes,
        request.entryFileName,
        request.programArguments,
    );
    try {
        const sessionRecord = composition.sessionRegistry.findByIdentifier(
            descriptor.sessionIdentifier,
        );
        if (!sessionRecord) {
            throw new Error(`Session ${descriptor.sessionIdentifier} is missing before export.`);
        }
        const exportBytes = await composition.staticSiteExporter.exportSessionToZip(sessionRecord);
        await writeFile(outputPath, exportBytes);
        scopedLogger.logSuccess(`Static site export written to ${outputPath}.`);
    } finally {
        await composition.sessionRegistry.releaseSession(descriptor.sessionIdentifier);
    }
}
async function runCli(rawArguments: ReadonlyArray<string>): Promise<number> {
    let request: CliRequest;
    try {
        request = parseCommandLineArguments(rawArguments);
    } catch (usageError) {
        const usageMessage = usageError instanceof Error ? usageError.message : String(usageError);
        console.error(usageMessage);
        console.error("");
        console.error(USAGE_TEXT);
        return 1;
    }
    if (request.kind === "help") {
        console.log(USAGE_TEXT);
        return 0;
    }
    if (request.kind === "list-languages") {
        const languageIdentifiers = new ServerComposition().languagePluginRegistry
            .listAll()
            .map((pluginInstance) => pluginInstance.languageIdentifier)
            .sort();
        console.log(languageIdentifiers.join("\n"));
        return 0;
    }
    try {
        await performBuild(request);
        return 0;
    } catch (buildError) {
        scopedLogger.logError(
            buildError instanceof Error ? buildError.message : String(buildError),
        );
        return 1;
    }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    process.exitCode = await runCli(process.argv.slice(2));
}
export {
    CliUsageError,
    collectProjectArchiveEntries,
    createProjectArchiveBytes,
    deriveDefaultOutputPath,
    isIgnoredProjectEntry,
    parseCommandLineArguments,
    runCli,
};
