import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { build } from "esbuild";
import { zipSync } from "fflate";
import type { LanguageIdentifier } from "@sharedKernel/LanguageIdentifier.ts";
import type { SessionDescriptorRecord } from "@sharedKernel/SessionDescriptorRecord.ts";
import { SessionLifecycleRecord } from "@serverAtelier/SessionLifecycleRecord.ts";
import { FileSystemOperations } from "@serverAtelier/utilities/FileSystemOperations.ts";
import { ScopedLogger } from "@serverAtelier/ScopedLogger.ts";
import {
    findRemoteAssetOrigins,
    scrubRemoteAssetOrigins,
} from "@serverAtelier/utilities/RemoteAssetScrubber.ts";
import { isBuildOutputPath } from "@serverAtelier/utilities/BuildOutputFilter.ts";
const EXPORT_BUNDLE_NAME = "app.js";
const EXPORT_STYLE_NAME = "terminal.css";
const EXPORT_DESCRIPTOR_NAME = "session.json";
const EXPORT_PAGE_NAME = "index.html";
const EXPORT_HOST_KEEP_FILE = ".nojekyll";
const ZIP_COMPRESSION_LEVEL = 9;
const PERFORMER_CLASS_BY_LANGUAGE: Record<LanguageIdentifier, string> = {
    python: "PyodidePerformer",
    ruby: "RubyWasmPerformer",
    lua: "LuaWasmPerformer",
    php: "PhpWasmPerformer",
    rust: "WasmPackPerformer",
    c: "EmscriptenPerformer",
    cpp: "EmscriptenPerformer",
    go: "GoWasmPerformer",
    zig: "WasiWasmPerformer",
    swift: "WasiWasmPerformer",
    kotlin: "KotlinJsPerformer",
    dart: "DartWasmPerformer",
    java: "TeaVmPerformer",
    csharp: "BlazorPerformer",
    assemblyscript: "WasmPackPerformer",
    ocaml: "WasiWasmPerformer",
    haskell: "WasiWasmPerformer",
    javascript: "JavaScriptPerformer",
    typescript: "TypeScriptPerformer",
    sql: "SqliteWasmPerformer",
    duckdb: "DuckDbWasmPerformer",
    pglite: "PglitePerformer",
    awk: "BusyboxAwkPerformer",
    jq: "JqWasmPerformer",
    bash: "BusyboxShellPerformer",
};
const UNSHIPPED_RUNTIME_FILE_PATTERNS: ReadonlyArray<RegExp> = [
    /\.ts$/,
    /\.map$/,
    /\.md$/,
    /(^|\/)package\.json$/,
    /(^|\/)\.gitignore$/,
    /^pyodide\.js$/,
    /^console.*\.html$/,
];
const SCANNED_TEXT_FILE_PATTERN = /\.(js|css|html|json)$/;
const NODE_ONLY_MODULE_SPECIFIERS = [
    "module",
    "fs",
    "url",
    "path",
    "vm",
    "crypto",
    "ws",
    "child_process",
    "node:module",
    "node:fs",
    "node:url",
    "node:path",
    "node:vm",
    "node:crypto",
    "node:child_process",
];
const FAVICON_DATA_URL =
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' fill='%230D0D0D'/%3E%3Ctext x='16' y='23' font-family='monospace' font-size='20' font-weight='700' fill='%23D8C7A1' text-anchor='middle'%3EW%3C/text%3E%3C/svg%3E";
let cachedProjectRoot: string | undefined;
function resolveProjectRoot(): string {
    if (cachedProjectRoot) {
        return cachedProjectRoot;
    }
    let candidateDirectory = import.meta.dirname;
    for (;;) {
        if (existsSync(join(candidateDirectory, "package.json"))) {
            cachedProjectRoot = candidateDirectory;
            return candidateDirectory;
        }
        const parentDirectory = dirname(candidateDirectory);
        if (parentDirectory === candidateDirectory) {
            throw new Error("Could not find a project root with package.json above the exporter.");
        }
        candidateDirectory = parentDirectory;
    }
}
class StaticSiteExporter {
    private readonly fileSystemOperations: FileSystemOperations;
    private readonly scopedLogger: ScopedLogger;
    private readonly xtermStylePath: string;
    private readonly bundleCache: Map<LanguageIdentifier, Promise<Uint8Array>> = new Map();
    constructor(
        fileSystemOperations: FileSystemOperations,
        scopedLogger: ScopedLogger,
        xtermStylePath?: string,
    ) {
        this.fileSystemOperations = fileSystemOperations;
        this.scopedLogger = scopedLogger;
        this.xtermStylePath =
            xtermStylePath ?? resolveProjectRoot() + "/node_modules/@xterm/xterm/css/xterm.css";
    }
    async exportSessionToZip(sessionRecord: SessionLifecycleRecord): Promise<Uint8Array> {
        const stagingDirectory = `${sessionRecord.sessionDirectory}/export`;
        await this.fileSystemOperations.removeRecursively(stagingDirectory);
        await this.fileSystemOperations.ensureDirectoryExists(stagingDirectory);
        try {
            const descriptor = sessionRecord.convertToDescriptor();
            const bundleBytes = await this.loadBundleBytes(descriptor.languageIdentifier);
            await this.fileSystemOperations.writeBinaryFile(
                `${stagingDirectory}/${EXPORT_BUNDLE_NAME}`,
                bundleBytes,
            );
            await this.copyExportStyle(stagingDirectory);
            await this.writeExportDescriptor(stagingDirectory, descriptor);
            await this.writeExportPage(stagingDirectory, descriptor);
            await this.fileSystemOperations.writeTextFile(
                `${stagingDirectory}/${EXPORT_HOST_KEEP_FILE}`,
                "",
            );
            await this.copyRuntimeAssets(sessionRecord, stagingDirectory);
            await this.copyUserCode(sessionRecord, stagingDirectory);
            await this.assertExportIsHostIndependent(stagingDirectory);
            return await this.zipStagingDirectory(stagingDirectory);
        } finally {
            await this.fileSystemOperations.removeRecursively(stagingDirectory);
        }
    }
    private loadBundleBytes(languageIdentifier: LanguageIdentifier): Promise<Uint8Array> {
        const cachedBundle = this.bundleCache.get(languageIdentifier);
        if (cachedBundle) {
            return cachedBundle;
        }
        const pendingBundle = this.buildBundleBytes(languageIdentifier);
        this.bundleCache.set(languageIdentifier, pendingBundle);
        return pendingBundle;
    }
    private async buildBundleBytes(languageIdentifier: LanguageIdentifier): Promise<Uint8Array> {
        const performerClassName = PERFORMER_CLASS_BY_LANGUAGE[languageIdentifier];
        if (!performerClassName) {
            throw new Error(`No static export performer is registered for ${languageIdentifier}.`);
        }
        const projectRoot = resolveProjectRoot();
        const bootstrapEntryPath = join(projectRoot, "src/clientTheatre/StaticExportBootstrap.ts");
        const performerEntryPath = join(
            projectRoot,
            `src/clientTheatre/runtimePerformers/${performerClassName}.ts`,
        );
        const generatedEntry = [
            `import { runStaticExport } from ${JSON.stringify(bootstrapEntryPath)};`,
            `import { ${performerClassName} } from ${JSON.stringify(performerEntryPath)};`,
            `runStaticExport(${JSON.stringify(languageIdentifier)}, (sessionBaseUrl) => new ${performerClassName}(sessionBaseUrl));`,
        ].join("\n");
        const generatedEntryPath = join(tmpdir(), `wasmverse-export-${languageIdentifier}.ts`);
        await writeFile(generatedEntryPath, generatedEntry);
        let bundledText: string;
        try {
            const buildOutcome = await build({
                entryPoints: [generatedEntryPath],
                bundle: true,
                write: false,
                format: "esm",
                platform: "browser",
                target: "es2020",
                minify: true,
                external: [...NODE_ONLY_MODULE_SPECIFIERS],
                tsconfig: join(projectRoot, "tsconfig.json"),
                logLevel: "silent",
            });
            const primaryOutput = buildOutcome.outputFiles[0];
            if (buildOutcome.outputFiles.length !== 1 || !primaryOutput) {
                throw new Error(
                    `Static export bundling for ${languageIdentifier} produced ${buildOutcome.outputFiles.length} outputs.`,
                );
            }
            bundledText = primaryOutput.text;
        } catch (bundlingError) {
            const bundlingMessage =
                bundlingError instanceof Error ? bundlingError.message : String(bundlingError);
            this.scopedLogger.logError(`Static export bundling failed: ${bundlingMessage}`);
            throw new Error(
                `Static export bundling for ${languageIdentifier} failed. See server logs.`,
            );
        }
        const scrubbedText = scrubRemoteAssetOrigins(bundledText);
        this.assertNoRemoteAssetOrigins(EXPORT_BUNDLE_NAME, scrubbedText);
        return new TextEncoder().encode(scrubbedText);
    }
    private async copyRuntimeAssets(
        sessionRecord: SessionLifecycleRecord,
        stagingDirectory: string,
    ): Promise<void> {
        const runtimeDirectory = `${sessionRecord.sessionDirectory}/dist/runtime`;
        const runtimeFiles = await this.fileSystemOperations.listFilesRecursively(runtimeDirectory);
        for (const relativePath of runtimeFiles) {
            const keepForExport = !UNSHIPPED_RUNTIME_FILE_PATTERNS.some((pattern) =>
                pattern.test(relativePath),
            );
            if (!keepForExport) {
                continue;
            }
            await this.fileSystemOperations.copyFileInto(
                `${runtimeDirectory}/${relativePath}`,
                `${stagingDirectory}/runtime/${relativePath}`,
            );
        }
    }
    private async copyUserCode(
        sessionRecord: SessionLifecycleRecord,
        stagingDirectory: string,
    ): Promise<void> {
        const userCodeDirectory = `${sessionRecord.sessionDirectory}/dist/user-code`;
        const userCodeFiles =
            await this.fileSystemOperations.listFilesRecursively(userCodeDirectory);
        for (const relativePath of userCodeFiles) {
            if (isBuildOutputPath(relativePath)) {
                continue;
            }
            await this.fileSystemOperations.copyFileInto(
                `${userCodeDirectory}/${relativePath}`,
                `${stagingDirectory}/user-code/${relativePath}`,
            );
        }
    }
    private async copyExportStyle(stagingDirectory: string): Promise<void> {
        if (!(await this.fileSystemOperations.pathExists(this.xtermStylePath))) {
            throw new Error("Terminal stylesheet is missing from node_modules.");
        }
        await this.fileSystemOperations.copyFileInto(
            this.xtermStylePath,
            `${stagingDirectory}/${EXPORT_STYLE_NAME}`,
        );
    }
    private async writeExportDescriptor(
        stagingDirectory: string,
        descriptor: SessionDescriptorRecord,
    ): Promise<void> {
        await this.fileSystemOperations.writeTextFile(
            `${stagingDirectory}/${EXPORT_DESCRIPTOR_NAME}`,
            JSON.stringify(descriptor),
        );
    }
    private async writeExportPage(
        stagingDirectory: string,
        descriptor: SessionDescriptorRecord,
    ): Promise<void> {
        const pageTitle = `WASM Session (${descriptor.languageIdentifier})`;
        const pageMarkup = [
            "<!doctype html>",
            '<html lang="en">',
            "<head>",
            '<meta charset="UTF-8" />',
            '<meta name="viewport" content="width=device-width, initial-scale=1.0" />',
            '<meta name="description" content="A WASMVERSE terminal replay of a compiled session." />',
            '<meta name="color-scheme" content="dark" />',
            '<meta name="theme-color" content="#0D0D0D" />',
            `<title>${pageTitle}</title>`,
            '<base href="./" />',
            `<link rel="icon" href="${FAVICON_DATA_URL}" />`,
            `<link rel="stylesheet" href="./${EXPORT_STYLE_NAME}" />`,
            "<style>",
            "html, body { margin: 0; padding: 0; background: #0D0D0D; height: 100%; }",
            "#terminal { height: 100vh; padding: 12px; box-sizing: border-box; }",
            "</style>",
            "</head>",
            "<body>",
            '<div id="terminal"></div>',
            "<noscript>This replay needs JavaScript enabled.</noscript>",
            `<script type="module" src="./${EXPORT_BUNDLE_NAME}"></script>`,
            "</body>",
            "</html>",
            "",
        ].join("\n");
        await this.fileSystemOperations.writeTextFile(
            `${stagingDirectory}/${EXPORT_PAGE_NAME}`,
            pageMarkup,
        );
    }
    private assertNoRemoteAssetOrigins(relativePath: string, text: string): void {
        const remoteOrigins = findRemoteAssetOrigins(text);
        if (remoteOrigins.length > 0) {
            throw new Error(
                `Export file ${relativePath} would reach out to ${remoteOrigins[0]}. Exports must be self contained.`,
            );
        }
    }
    private async assertExportIsHostIndependent(stagingDirectory: string): Promise<void> {
        const stagedFiles = await this.fileSystemOperations.listFilesRecursively(stagingDirectory);
        for (const relativePath of stagedFiles) {
            if (relativePath.endsWith(".mjs")) {
                throw new Error(
                    `Export file ${relativePath} uses the .mjs extension, which static hosts map inconsistently.`,
                );
            }
            if (relativePath.startsWith("user-code/")) {
                continue;
            }
            if (!SCANNED_TEXT_FILE_PATTERN.test(relativePath)) {
                continue;
            }
            this.assertNoRemoteAssetOrigins(
                relativePath,
                await this.fileSystemOperations.readTextFile(`${stagingDirectory}/${relativePath}`),
            );
        }
    }
    private async zipStagingDirectory(stagingDirectory: string): Promise<Uint8Array> {
        const relativePaths =
            await this.fileSystemOperations.listFilesRecursively(stagingDirectory);
        const zipEntries: Record<string, Uint8Array> = {};
        for (const relativePath of relativePaths) {
            zipEntries[relativePath] = await this.fileSystemOperations.readBinaryFile(
                `${stagingDirectory}/${relativePath}`,
            );
        }
        return zipSync(zipEntries, { level: ZIP_COMPRESSION_LEVEL });
    }
}
export { StaticSiteExporter };
