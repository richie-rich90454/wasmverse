import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
    type CallToolResult,
    type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import type { SessionDescriptorRecord } from "@sharedKernel/SessionDescriptorRecord.ts";
import { zipSync } from "fflate";
import { ServerComposition } from "@serverAtelier/ServerComposition.ts";
import { createProjectArchiveBytes } from "./WasmverseCliScript.ts";
const MCP_SERVER_NAME = "wasmverse-mcp-server";
const MCP_SERVER_VERSION = "1.0.0";
const DEFAULT_ARTIFACT_DIRECTORY_NAME = "wasmverse-mcp-artifacts";
interface McpToolDefinition {
    name: string;
    description: string;
    inputSchema: {
        type: "object";
        properties: Record<string, unknown>;
        required?: Array<string>;
    };
}
type ToolHandler = (argumentsRecord: Record<string, unknown>) => Promise<unknown>;
type ToolHandlerMap = Record<string, ToolHandler>;
const BUILD_SESSION_NOTE =
    "The session lives under sessions/<sessionIdentifier> (relative to the server working directory) and expires after the session TTL. Call export_artifact with this sessionIdentifier to write a runnable static site artifact.";
function buildToolDefinitions(): Array<McpToolDefinition> {
    return [
        {
            name: "list_languages",
            description:
                "List every registered language: identifier, display name, and supported entry-file extensions.",
            inputSchema: { type: "object", properties: {} },
        },
        {
            name: "build_session",
            description:
                'Compile source code into a WASMVerse session. Provide "files" (inline relative path to text content) or "directoryPath" (a directory on this machine), plus "entry" (the entry file name inside the project, e.g. main.py). Returns the session descriptor JSON.',
            inputSchema: {
                type: "object",
                properties: {
                    files: {
                        type: "object",
                        additionalProperties: { type: "string" },
                        description:
                            "Inline file map: relative path to UTF-8 text content. Use with entry.",
                    },
                    directoryPath: {
                        type: "string",
                        description:
                            "Path to a project directory to package and compile. Alternative to files.",
                    },
                    entry: {
                        type: "string",
                        description:
                            "Entry file name inside the project, e.g. main.py. When omitted, a likely entry file is auto-detected.",
                    },
                    programArguments: {
                        type: "array",
                        items: { type: "string" },
                        description: "Program arguments passed to the program at runtime.",
                    },
                },
            },
        },
        {
            name: "export_artifact",
            description:
                'Export a built session as a self-contained static site artifact. format "zip" writes the archive and format "html" writes the single-file HTML page to outputPath (defaults to a path under the system temp directory), returning the absolute artifactPath plus byteSize. The session is released after export unless keepSession is true.',
            inputSchema: {
                type: "object",
                properties: {
                    sessionIdentifier: {
                        type: "string",
                        description: "Session identifier returned by build_session.",
                    },
                    format: {
                        type: "string",
                        enum: ["zip", "html"],
                        description: 'Artifact format. "zip" or "html".',
                    },
                    outputPath: {
                        type: "string",
                        description: "Absolute or relative file path for the artifact.",
                    },
                    keepSession: {
                        type: "boolean",
                        description: "Keep the session alive after export. Defaults to false.",
                    },
                },
                required: ["sessionIdentifier"],
            },
        },
        {
            name: "export_project",
            description:
                "Convenience tool: package a project directory, compile it, and export it as a zip artifact in one call. Returns artifactPath, byteSize, languageIdentifier, and entryFileRelativePath.",
            inputSchema: {
                type: "object",
                properties: {
                    directoryPath: {
                        type: "string",
                        description: "Path to the project directory to package and compile.",
                    },
                    entry: {
                        type: "string",
                        description:
                            "Entry file name inside the project, e.g. main.py. When omitted, a likely entry file is auto-detected.",
                    },
                    programArguments: {
                        type: "array",
                        items: { type: "string" },
                        description: "Program arguments passed to the program at runtime.",
                    },
                    format: {
                        type: "string",
                        enum: ["zip", "html"],
                        description: 'Artifact format. "zip" or "html".',
                    },
                    outputPath: {
                        type: "string",
                        description: "Absolute or relative file path for the artifact.",
                    },
                    keepSession: {
                        type: "boolean",
                        description: "Keep the session alive after export. Defaults to false.",
                    },
                },
                required: ["directoryPath"],
            },
        },
    ];
}
function readRequiredString(argumentsRecord: Record<string, unknown>, name: string): string {
    const value = argumentsRecord[name];
    if (typeof value !== "string" || value.trim().length === 0) {
        throw new Error(`Missing required string argument "${name}".`);
    }
    return value.trim();
}
function readOptionalString(
    argumentsRecord: Record<string, unknown>,
    name: string,
): string | undefined {
    const value = argumentsRecord[name];
    if (value === undefined || value === null) {
        return undefined;
    }
    if (typeof value !== "string") {
        throw new Error(`Argument "${name}" must be a string.`);
    }
    const trimmedValue = value.trim();
    return trimmedValue.length > 0 ? trimmedValue : undefined;
}
function readStringArrayArgument(
    argumentsRecord: Record<string, unknown>,
    name: string,
): Array<string> {
    const value = argumentsRecord[name];
    if (value === undefined || value === null) {
        return [];
    }
    if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
        throw new Error(`Argument "${name}" must be an array of strings.`);
    }
    return value as Array<string>;
}
function readStringRecordArgument(
    argumentsRecord: Record<string, unknown>,
    name: string,
): Record<string, string> {
    const value = argumentsRecord[name];
    if (value === undefined || value === null) {
        return {};
    }
    if (typeof value !== "object" || Array.isArray(value)) {
        throw new Error(`Argument "${name}" must be an object mapping relative paths to text.`);
    }
    const stringRecord: Record<string, string> = {};
    for (const [entryPath, entryContent] of Object.entries(value)) {
        if (typeof entryContent !== "string") {
            throw new Error(`Entry "${entryPath}" in "${name}" must map to a string.`);
        }
        stringRecord[entryPath] = entryContent;
    }
    return stringRecord;
}
function readArtifactFormat(argumentsRecord: Record<string, unknown>): "zip" | "html" {
    const format = (readOptionalString(argumentsRecord, "format") ?? "zip").toLowerCase();
    if (format === "zip" || format === "html") {
        return format;
    }
    throw new Error(`Unsupported format "${format}". Use "zip" or "html".`);
}
function resolveArtifactPath(requestedOutputPath: unknown, defaultFileName: string): string {
    if (typeof requestedOutputPath === "string" && requestedOutputPath.trim().length > 0) {
        return resolve(requestedOutputPath.trim());
    }
    return join(tmpdir(), DEFAULT_ARTIFACT_DIRECTORY_NAME, defaultFileName);
}
async function produceBuildOutcomeFromInlineFiles(
    composition: ServerComposition,
    inlineFiles: Record<string, string>,
    entryFileName: string,
    programArguments: Array<string>,
): Promise<SessionDescriptorRecord> {
    if (Object.keys(inlineFiles).length === 0) {
        throw new Error('Argument "files" must contain at least one file.');
    }
    const textEncoder = new TextEncoder();
    const archiveEntries: Record<string, Uint8Array> = {};
    for (const [relativePath, fileContent] of Object.entries(inlineFiles)) {
        archiveEntries[relativePath] = textEncoder.encode(fileContent);
    }
    return composition.buildOrchestrator.produceBuildOutcome(
        zipSync(archiveEntries),
        entryFileName,
        programArguments,
    );
}
async function produceBuildOutcomeFromDirectory(
    composition: ServerComposition,
    directoryPath: string,
    entryFileName: string,
    programArguments: Array<string>,
): Promise<SessionDescriptorRecord> {
    const resolvedDirectoryPath = resolve(directoryPath);
    const directoryExists =
        await composition.fileSystemOperations.pathExists(resolvedDirectoryPath);
    if (!directoryExists) {
        throw new Error(`Directory ${resolvedDirectoryPath} does not exist.`);
    }
    const archiveBytes = await createProjectArchiveBytes(resolvedDirectoryPath);
    return composition.buildOrchestrator.produceBuildOutcome(
        archiveBytes,
        entryFileName,
        programArguments,
    );
}
async function handleBuildSession(
    composition: ServerComposition,
    argumentsRecord: Record<string, unknown>,
): Promise<unknown> {
    const programArguments = readStringArrayArgument(argumentsRecord, "programArguments");
    const entryFileName = readOptionalString(argumentsRecord, "entry") ?? "";
    const directoryPath = readOptionalString(argumentsRecord, "directoryPath");
    const hasFilesArgument =
        argumentsRecord["files"] !== undefined && argumentsRecord["files"] !== null;
    if (hasFilesArgument && directoryPath !== undefined) {
        throw new Error('Provide either "files" or "directoryPath", not both.');
    }
    if (!hasFilesArgument && directoryPath === undefined) {
        throw new Error('Provide "files" or "directoryPath".');
    }
    const descriptor = hasFilesArgument
        ? await produceBuildOutcomeFromInlineFiles(
              composition,
              readStringRecordArgument(argumentsRecord, "files"),
              entryFileName,
              programArguments,
          )
        : await produceBuildOutcomeFromDirectory(
              composition,
              directoryPath as string,
              entryFileName,
              programArguments,
          );
    return {
        ...descriptor,
        sessionDirectory: `sessions/${descriptor.sessionIdentifier}`,
        note: BUILD_SESSION_NOTE,
    };
}
async function exportSessionToArtifact(
    composition: ServerComposition,
    sessionIdentifier: string,
    argumentsRecord: Record<string, unknown>,
    format: "zip" | "html",
): Promise<{ artifactPath: string; byteSize: number }> {
    const sessionRecord = composition.sessionRegistry.findByIdentifier(sessionIdentifier);
    if (!sessionRecord) {
        throw new Error(
            `Unknown session "${sessionIdentifier}". Sessions exist only in this server process and expire after the session TTL (default 30 minutes).`,
        );
    }
    const keepSession = argumentsRecord["keepSession"] === true;
    let artifactBytes: Uint8Array;
    try {
        artifactBytes =
            format === "html"
                ? new TextEncoder().encode(
                      await composition.staticSiteExporter.exportSessionToSingleFileHtml(
                          sessionRecord,
                      ),
                  )
                : await composition.staticSiteExporter.exportSessionToZip(sessionRecord);
    } finally {
        if (!keepSession) {
            await composition.sessionRegistry.releaseSession(sessionIdentifier);
        }
    }
    const artifactPath = resolveArtifactPath(
        argumentsRecord["outputPath"],
        `${sessionIdentifier}.${format}`,
    );
    await composition.fileSystemOperations.writeBinaryFile(artifactPath, artifactBytes);
    return { artifactPath, byteSize: artifactBytes.byteLength };
}
async function handleExportArtifact(
    composition: ServerComposition,
    argumentsRecord: Record<string, unknown>,
): Promise<unknown> {
    const format = readArtifactFormat(argumentsRecord);
    const sessionIdentifier = readRequiredString(argumentsRecord, "sessionIdentifier");
    const artifact = await exportSessionToArtifact(
        composition,
        sessionIdentifier,
        argumentsRecord,
        format,
    );
    return { ...artifact, format, sessionIdentifier };
}
async function handleExportProject(
    composition: ServerComposition,
    argumentsRecord: Record<string, unknown>,
): Promise<unknown> {
    readArtifactFormat(argumentsRecord);
    const directoryPath = readRequiredString(argumentsRecord, "directoryPath");
    const entryFileName = readOptionalString(argumentsRecord, "entry") ?? "";
    const programArguments = readStringArrayArgument(argumentsRecord, "programArguments");
    const descriptor = await produceBuildOutcomeFromDirectory(
        composition,
        directoryPath,
        entryFileName,
        programArguments,
    );
    const artifact = await exportSessionToArtifact(
        composition,
        descriptor.sessionIdentifier,
        argumentsRecord,
        readArtifactFormat(argumentsRecord),
    );
    return {
        artifactPath: artifact.artifactPath,
        byteSize: artifact.byteSize,
        languageIdentifier: descriptor.languageIdentifier,
        entryFileRelativePath: descriptor.entryFileRelativePath,
    };
}
function createToolHandlerMap(composition: ServerComposition): ToolHandlerMap {
    return {
        list_languages: async () =>
            composition.languagePluginRegistry.listAll().map((pluginInstance) => ({
                languageIdentifier: pluginInstance.languageIdentifier,
                displayName: pluginInstance.displayName,
                entryFileExtensions: [...pluginInstance.supportedFileExtensions],
            })),
        build_session: async (argumentsRecord) => handleBuildSession(composition, argumentsRecord),
        export_artifact: async (argumentsRecord) =>
            handleExportArtifact(composition, argumentsRecord),
        export_project: async (argumentsRecord) =>
            handleExportProject(composition, argumentsRecord),
    };
}
async function callTool(
    toolHandlerMap: ToolHandlerMap,
    toolName: string,
    argumentsRecord: Record<string, unknown>,
): Promise<CallToolResult> {
    const toolHandler = toolHandlerMap[toolName];
    if (!toolHandler) {
        return {
            content: [
                {
                    type: "text",
                    text: `Unknown tool "${toolName}". Available tools: ${Object.keys(toolHandlerMap).sort().join(", ")}.`,
                },
            ],
            isError: true,
        };
    }
    try {
        const toolOutcome = await toolHandler(argumentsRecord);
        return { content: [{ type: "text", text: JSON.stringify(toolOutcome, null, 2) }] };
    } catch (toolError) {
        const errorMessage = toolError instanceof Error ? toolError.message : String(toolError);
        return {
            content: [{ type: "text", text: `Tool "${toolName}" failed: ${errorMessage}` }],
            isError: true,
        };
    }
}
function createWasmverseMcpServer(): Server {
    const composition = new ServerComposition();
    const toolHandlerMap = createToolHandlerMap(composition);
    const mcpServer = new Server(
        { name: MCP_SERVER_NAME, version: MCP_SERVER_VERSION },
        {
            capabilities: { tools: {} },
            instructions:
                "Compile source files into WASMVerse sessions and export runnable static site artifacts. Use list_languages to discover the supported languages, build_session or export_project to compile, and export_artifact to download a built session as a zip.",
        },
    );
    mcpServer.setRequestHandler(ListToolsRequestSchema, async () => ({
        tools: buildToolDefinitions() as unknown as Array<Tool>,
    }));
    mcpServer.setRequestHandler(CallToolRequestSchema, async (request) =>
        callTool(toolHandlerMap, request.params.name, request.params.arguments ?? {}),
    );
    return mcpServer;
}
async function startStdioServer(): Promise<void> {
    console.log = (...data: Array<unknown>) => {
        console.error(...data);
    };
    const mcpServer = createWasmverseMcpServer();
    await mcpServer.connect(new StdioServerTransport());
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    await startStdioServer();
}
export {
    buildToolDefinitions,
    callTool,
    createToolHandlerMap,
    createWasmverseMcpServer,
    startStdioServer,
};
