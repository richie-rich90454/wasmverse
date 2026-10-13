import type { ApiErrorResponseRecord } from "@sharedKernel/ApiErrorResponseRecord.ts";
import { readFile, stat } from "node:fs/promises";
import { BuildOrchestrator } from "@serverAtelier/BuildOrchestrator.ts";
import { SessionRegistry } from "@serverAtelier/SessionRegistry.ts";
import { StaticSiteExporter } from "@serverAtelier/StaticSiteExporter.ts";
import { GitHubRepositoryFetcher } from "@serverAtelier/GitHubRepositoryFetcher.ts";
import { LanguagePluginRegistry } from "@serverAtelier/pluginHost/LanguagePluginRegistry.ts";
import { ServerConfiguration } from "@serverAtelier/ServerConfiguration.ts";
import { ScopedLogger } from "@serverAtelier/ScopedLogger.ts";
import { PathGuard } from "@serverAtelier/utilities/PathGuard.ts";
import { RateLimitGuard } from "@serverAtelier/RateLimitGuard.ts";
import { applySecurityHeaders } from "@serverAtelier/SecurityHeaders.ts";
const MAXIMUM_PROGRAM_ARGUMENT_COUNT = 64;
const MAXIMUM_PROGRAM_ARGUMENT_LENGTH = 4096;
const CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".wasm": "application/wasm",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".ico": "image/x-icon",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".ttf": "font/ttf",
    ".otf": "font/otf",
    ".map": "application/json; charset=utf-8",
    ".txt": "text/plain; charset=utf-8",
    ".data": "application/octet-stream",
};
function contentTypeForPath(absolutePath: string): string {
    const finalDotIndex = absolutePath.lastIndexOf(".");
    if (finalDotIndex < 0) {
        return "application/octet-stream";
    }
    return (
        CONTENT_TYPE_BY_EXTENSION[absolutePath.slice(finalDotIndex).toLowerCase()] ??
        "application/octet-stream"
    );
}
class HttpRequestRouter {
    private readonly buildOrchestrator: BuildOrchestrator;
    private readonly sessionRegistry: SessionRegistry;
    private readonly staticSiteExporter: StaticSiteExporter;
    private readonly gitHubRepositoryFetcher: GitHubRepositoryFetcher;
    private readonly languagePluginRegistry: LanguagePluginRegistry;
    private readonly serverConfiguration: ServerConfiguration;
    private readonly scopedLogger: ScopedLogger;
    private readonly pathGuard: PathGuard;
    private readonly sessionUploadRateGuard: RateLimitGuard;
    constructor(
        buildOrchestrator: BuildOrchestrator,
        sessionRegistry: SessionRegistry,
        staticSiteExporter: StaticSiteExporter,
        languagePluginRegistry: LanguagePluginRegistry,
        serverConfiguration: ServerConfiguration,
        scopedLogger: ScopedLogger,
        pathGuard: PathGuard,
    ) {
        this.buildOrchestrator = buildOrchestrator;
        this.sessionRegistry = sessionRegistry;
        this.staticSiteExporter = staticSiteExporter;
        this.gitHubRepositoryFetcher = new GitHubRepositoryFetcher(
            undefined,
            serverConfiguration.maximumUploadSizeInBytes,
        );
        this.languagePluginRegistry = languagePluginRegistry;
        this.serverConfiguration = serverConfiguration;
        this.scopedLogger = scopedLogger;
        this.pathGuard = pathGuard;
        this.sessionUploadRateGuard = new RateLimitGuard(
            serverConfiguration.sessionUploadsPerMinute,
            60_000,
        );
    }
    async routeRequest(request: Request): Promise<Response> {
        const requestUrl = new URL(request.url);
        let routedResponse: Response;
        if (request.method === "POST" && requestUrl.pathname === "/api/session") {
            routedResponse = await this.handleSessionUpload(request);
        } else if (request.method === "POST" && requestUrl.pathname === "/api/import-github") {
            routedResponse = await this.handleGitHubImport(request);
        } else if (request.method === "GET" && requestUrl.pathname === "/api/health") {
            routedResponse = this.handleHealthCheck();
        } else if (request.method === "GET" && requestUrl.pathname.startsWith("/api/export/")) {
            routedResponse = await this.handleStaticExport(requestUrl);
        } else if (request.method === "GET" && requestUrl.pathname.startsWith("/session/")) {
            routedResponse = await this.handleSessionAssetRequest(requestUrl);
        } else {
            routedResponse = await this.handleClientAssetRequest(requestUrl);
        }
        return applySecurityHeaders(routedResponse);
    }
    private async handleSessionUpload(request: Request): Promise<Response> {
        const clientKey = this.resolveClientKey(request);
        if (!this.sessionUploadRateGuard.tryConsume(clientKey)) {
            return this.buildErrorResponse(429, "Too many uploads. Wait one minute and try again.");
        }
        try {
            const formData = await request.formData();
            const archiveField = formData.get("archive");
            const entryField = formData.get("entry");
            if (!(archiveField instanceof File)) {
                return this.buildErrorResponse(400, "Missing archive field. Upload a zip file.");
            }
            if (typeof entryField !== "string" || entryField.trim().length === 0) {
                return this.buildErrorResponse(400, "Missing entry field. Name the entry file.");
            }
            if (archiveField.size > this.serverConfiguration.maximumUploadSizeInBytes) {
                return this.buildErrorResponse(400, "Archive exceeds the maximum upload size.");
            }
            const programArguments = this.parseProgramArgumentsField(formData.get("args"));
            const zipBuffer = new Uint8Array(await archiveField.arrayBuffer());
            const descriptor = await this.buildOrchestrator.produceBuildOutcome(
                zipBuffer,
                entryField.trim(),
                programArguments,
            );
            return Response.json(descriptor);
        } catch (uploadError) {
            const errorMessage =
                uploadError instanceof Error ? uploadError.message : String(uploadError);
            this.scopedLogger.logError(`Upload failed: ${errorMessage}`);
            return this.buildErrorResponse(400, errorMessage);
        }
    }
    private async handleGitHubImport(request: Request): Promise<Response> {
        const clientKey = this.resolveClientKey(request);
        if (!this.sessionUploadRateGuard.tryConsume(clientKey)) {
            return this.buildErrorResponse(429, "Too many imports. Wait one minute and try again.");
        }
        try {
            const payload = (await request.json()) as {
                repositoryReference?: unknown;
                ref?: unknown;
                entry?: unknown;
                programArguments?: unknown;
            };
            const repositoryReference = payload.repositoryReference;
            if (
                typeof repositoryReference !== "string" ||
                repositoryReference.trim().length === 0
            ) {
                return this.buildErrorResponse(
                    400,
                    "Missing repositoryReference. Provide owner/repository or a github.com URL.",
                );
            }
            const ref =
                typeof payload.ref === "string" && payload.ref.trim().length > 0
                    ? payload.ref.trim()
                    : undefined;
            const entry = typeof payload.entry === "string" ? payload.entry.trim() : "";
            const programArguments = this.parseProgramArgumentsValue(payload.programArguments);
            const archiveBytes = await this.gitHubRepositoryFetcher.fetchArchive(
                this.composeReferenceWithRef(repositoryReference.trim(), ref),
            );
            const descriptor = await this.buildOrchestrator.produceBuildOutcome(
                archiveBytes,
                entry,
                programArguments,
            );
            return Response.json(descriptor);
        } catch (importError) {
            const errorMessage =
                importError instanceof Error ? importError.message : String(importError);
            this.scopedLogger.logError(`GitHub import failed: ${errorMessage}`);
            return this.buildErrorResponse(400, errorMessage);
        }
    }
    private handleHealthCheck(): Response {
        return Response.json({
            status: "healthy",
            registeredLanguages: this.languagePluginRegistry
                .listAll()
                .map((pluginInstance) => pluginInstance.languageIdentifier),
        });
    }
    private async handleStaticExport(requestUrl: URL): Promise<Response> {
        const pathSegments = requestUrl.pathname.split("/").filter((segment) => segment.length > 0);
        const sessionIdentifier = pathSegments[2] as string;
        const sessionRecord = this.sessionRegistry.findByIdentifier(sessionIdentifier);
        if (!sessionRecord) {
            return this.buildErrorResponse(404, "Session not found.");
        }
        try {
            const zipBytes = await this.staticSiteExporter.exportSessionToZip(sessionRecord);
            const zipBody = zipBytes.slice().buffer as ArrayBuffer;
            return new Response(zipBody, {
                headers: {
                    "content-type": "application/zip",
                    "content-disposition": `attachment; filename="wasm-session-${sessionIdentifier}.zip"`,
                },
            });
        } catch (exportError) {
            const errorMessage =
                exportError instanceof Error ? exportError.message : String(exportError);
            this.scopedLogger.logError(`Export failed: ${errorMessage}`);
            return this.buildErrorResponse(500, errorMessage);
        }
    }
    private async handleSessionAssetRequest(requestUrl: URL): Promise<Response> {
        const pathSegments = requestUrl.pathname.split("/").filter((segment) => segment.length > 0);
        const sessionIdentifier = pathSegments[1] as string;
        const relativeAssetPath = pathSegments.slice(2).join("/");
        const sessionRecord = this.sessionRegistry.findByIdentifier(sessionIdentifier);
        if (!sessionRecord || !relativeAssetPath) {
            return this.buildErrorResponse(404, "Session or asset not found.");
        }
        try {
            this.pathGuard.assertInsideBaseDirectory(
                relativeAssetPath,
                sessionRecord.sessionDirectory,
            );
        } catch {
            return this.buildErrorResponse(403, "Asset path escapes the session directory.");
        }
        const assetResponse = await this.readAssetResponse(
            `${sessionRecord.sessionDirectory}/${relativeAssetPath}`,
        );
        if (!assetResponse) {
            return this.buildErrorResponse(404, "Session asset not found.");
        }
        return assetResponse;
    }
    private async handleClientAssetRequest(requestUrl: URL): Promise<Response> {
        const relativePath = requestUrl.pathname.replace(/^\/+/, "");
        const exactCandidate = `${this.serverConfiguration.clientBuildDirectory}/${relativePath}`;
        const exactCandidateResponse = await this.readAssetResponse(exactCandidate);
        if (exactCandidateResponse) {
            return exactCandidateResponse;
        }
        const requestLooksLikeFile = /\.[a-z0-9]+$/i.test(relativePath);
        if (!requestLooksLikeFile) {
            const indexResponse = await this.readAssetResponse(
                `${this.serverConfiguration.clientBuildDirectory}/index.html`,
            );
            if (indexResponse) {
                return indexResponse;
            }
        }
        return this.buildErrorResponse(404, "Client asset not found.");
    }
    private async readAssetResponse(absolutePath: string): Promise<Response | undefined> {
        try {
            const fileStats = await stat(absolutePath);
            if (!fileStats.isFile()) {
                return undefined;
            }
            const fileBytes = await readFile(absolutePath);
            return new Response(new Uint8Array(fileBytes), {
                headers: { "content-type": contentTypeForPath(absolutePath) },
            });
        } catch {
            return undefined;
        }
    }
    private resolveClientKey(request: Request): string {
        return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anonymous";
    }
    private composeReferenceWithRef(repositoryReference: string, ref: string | undefined): string {
        if (!ref || repositoryReference.includes("/tree/")) {
            return repositoryReference;
        }
        const trimmedBase = repositoryReference.replace(/\/$/, "");
        if (trimmedBase.includes("://")) {
            return `${trimmedBase}/tree/${ref}`;
        }
        return `https://github.com/${trimmedBase}/tree/${ref}`;
    }
    private parseProgramArgumentsField(fieldValue: unknown): Array<string> {
        if (typeof fieldValue !== "string") {
            return [];
        }
        return this.parseProgramArgumentsValue(fieldValue.split("\n"));
    }
    private parseProgramArgumentsValue(rawValue: unknown): Array<string> {
        if (!Array.isArray(rawValue)) {
            return [];
        }
        const programArguments: Array<string> = [];
        for (const rawArgument of rawValue) {
            if (programArguments.length >= MAXIMUM_PROGRAM_ARGUMENT_COUNT) {
                break;
            }
            if (typeof rawArgument !== "string") {
                continue;
            }
            const argumentText = rawArgument.trim();
            if (
                argumentText.length === 0 ||
                argumentText.length > MAXIMUM_PROGRAM_ARGUMENT_LENGTH
            ) {
                continue;
            }
            programArguments.push(argumentText);
        }
        return programArguments;
    }
    private buildErrorResponse(statusCode: number, errorMessage: string): Response {
        const payload: ApiErrorResponseRecord = { errorMessage };
        return Response.json(payload, { status: statusCode });
    }
}
export { HttpRequestRouter };
