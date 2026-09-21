import { zipSync } from "fflate";
import type { SessionDescriptorRecord } from "@sharedKernel/SessionDescriptorRecord.ts";
import { SessionLifecycleRecord } from "@serverAtelier/SessionLifecycleRecord.ts";
import { FileSystemOperations } from "@serverAtelier/utilities/FileSystemOperations.ts";
import { ScopedLogger } from "@serverAtelier/ScopedLogger.ts";
const EXPORT_BOOTSTRAP_ENTRY = "./src/clientTheatre/StaticExportBootstrap.ts";
const EXPORT_BUNDLE_NAME = "app.js";
const EXPORT_STYLE_NAME = "terminal.css";
const EXPORT_DESCRIPTOR_NAME = "session.json";
const EXPORT_PAGE_NAME = "index.html";
class StaticSiteExporter {
    private readonly fileSystemOperations: FileSystemOperations;
    private readonly scopedLogger: ScopedLogger;
    private readonly xtermStylePath: string;
    constructor(
        fileSystemOperations: FileSystemOperations,
        scopedLogger: ScopedLogger,
        xtermStylePath: string = "./node_modules/@xterm/xterm/css/xterm.css",
    ) {
        this.fileSystemOperations = fileSystemOperations;
        this.scopedLogger = scopedLogger;
        this.xtermStylePath = xtermStylePath;
    }
    async exportSessionToZip(sessionRecord: SessionLifecycleRecord): Promise<Uint8Array> {
        const stagingDirectory = `${sessionRecord.sessionDirectory}/export`;
        await this.fileSystemOperations.removeRecursively(stagingDirectory);
        await this.fileSystemOperations.ensureDirectoryExists(stagingDirectory);
        try {
            await this.bundleExportScript(stagingDirectory);
            await this.copyExportStyle(stagingDirectory);
            await this.writeExportDescriptor(stagingDirectory, sessionRecord.convertToDescriptor());
            await this.writeExportPage(stagingDirectory, sessionRecord.convertToDescriptor());
            await this.fileSystemOperations.copyDirectoryInto(
                `${sessionRecord.sessionDirectory}/dist/runtime`,
                `${stagingDirectory}/runtime`,
            );
            await this.fileSystemOperations.copyDirectoryInto(
                `${sessionRecord.sessionDirectory}/dist/user-code`,
                `${stagingDirectory}/user-code`,
            );
            return await this.zipStagingDirectory(stagingDirectory);
        } finally {
            await this.fileSystemOperations.removeRecursively(stagingDirectory);
        }
    }
    private async bundleExportScript(stagingDirectory: string): Promise<void> {
        const buildOutcome = await Bun.build({
            entrypoints: [EXPORT_BOOTSTRAP_ENTRY],
            outdir: stagingDirectory,
            target: "browser",
            format: "esm",
            naming: EXPORT_BUNDLE_NAME,
            minify: false,
            external: ["wasmoon"],
        });
        if (!buildOutcome.success) {
            for (const buildMessage of buildOutcome.logs) {
                this.scopedLogger.logError(buildMessage.message);
            }
            throw new Error("Static export bundling failed. See server logs for details.");
        }
        await this.fileSystemOperations.copyFileInto(
            "./node_modules/wasmoon/dist/index.js",
            `${stagingDirectory}/vendor/wasmoon.mjs`,
        );
    }
    private async copyExportStyle(stagingDirectory: string): Promise<void> {
        const styleExists = await this.fileSystemOperations.pathExists(this.xtermStylePath);
        if (!styleExists) {
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
        await this.fileSystemOperations.writeTextFile(
            `${stagingDirectory}/${EXPORT_PAGE_NAME}`,
            `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="UTF-8" />\n<meta name="viewport" content="width=device-width, initial-scale=1.0" />\n<title>${pageTitle}</title>\n<link rel="stylesheet" href="./${EXPORT_STYLE_NAME}" />\n<script type="importmap">\n{"imports": {"wasmoon": "./vendor/wasmoon.mjs"}}\n</script>\n<style>\nhtml, body { margin: 0; padding: 0; background: #0D0D0D; height: 100%; }\n#terminal { height: 100vh; padding: 12px; box-sizing: border-box; }\n</style>\n</head>\n<body>\n<div id="terminal"></div>\n<script type="module" src="./${EXPORT_BUNDLE_NAME}"></script>\n</body>\n</html>\n`,
        );
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
        return zipSync(zipEntries, { level: 6 });
    }
}
export { StaticSiteExporter };
