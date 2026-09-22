import type { ApiErrorResponseRecord } from "@sharedKernel/ApiErrorResponseRecord.ts";
import { BuildOrchestrator } from "@serverAtelier/BuildOrchestrator.ts";
import { SessionRegistry } from "@serverAtelier/SessionRegistry.ts";
import { StaticSiteExporter } from "@serverAtelier/StaticSiteExporter.ts";
import { LanguagePluginRegistry } from "@serverAtelier/pluginHost/LanguagePluginRegistry.ts";
import { ServerConfiguration } from "@serverAtelier/ServerConfiguration.ts";
import { ScopedLogger } from "@serverAtelier/ScopedLogger.ts";
import { PathGuard } from "@serverAtelier/utilities/PathGuard.ts";
import { RateLimitGuard } from "@serverAtelier/RateLimitGuard.ts";
import { applySecurityHeaders } from "@serverAtelier/SecurityHeaders.ts";
class HttpRequestRouter {
    private readonly buildOrchestrator: BuildOrchestrator;
    private readonly sessionRegistry: SessionRegistry;
    private readonly staticSiteExporter: StaticSiteExporter;
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
        this.languagePluginRegistry = languagePluginRegistry;
        this.serverConfiguration = serverConfiguration;
        this.scopedLogger = scopedLogger;
        this.pathGuard = pathGuard;
        this.sessionUploadRateGuard = new RateLimitGuard(10, 60_000);
    }
    async routeRequest(request: Request): Promise<Response> {
        const requestUrl = new URL(request.url);
        let routedResponse: Response;
        if (request.method === "POST" && requestUrl.pathname === "/api/session") {
            routedResponse = await this.handleSessionUpload(request);
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
        const clientKey =
            request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anonymous";
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
            const zipBuffer = new Uint8Array(await archiveField.arrayBuffer());
            const descriptor = await this.buildOrchestrator.produceBuildOutcome(
                zipBuffer,
                entryField.trim(),
            );
            return Response.json(descriptor);
        } catch (uploadError) {
            const errorMessage =
                uploadError instanceof Error ? uploadError.message : String(uploadError);
            this.scopedLogger.logError(`Upload failed: ${errorMessage}`);
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
        const assetFile = Bun.file(`${sessionRecord.sessionDirectory}/${relativeAssetPath}`);
        if (!(await assetFile.exists())) {
            return this.buildErrorResponse(404, "Session asset not found.");
        }
        return new Response(assetFile);
    }
    private async handleClientAssetRequest(requestUrl: URL): Promise<Response> {
        const relativePath = requestUrl.pathname.replace(/^\/+/, "");
        const exactCandidate = `${this.serverConfiguration.clientBuildDirectory}/${relativePath}`;
        const exactCandidateFile = Bun.file(exactCandidate);
        if (await exactCandidateFile.exists()) {
            return new Response(exactCandidateFile);
        }
        const requestLooksLikeFile = /\.[a-z0-9]+$/i.test(relativePath);
        if (!requestLooksLikeFile) {
            const indexFile = Bun.file(
                `${this.serverConfiguration.clientBuildDirectory}/index.html`,
            );
            if (await indexFile.exists()) {
                return new Response(indexFile);
            }
        }
        return this.buildErrorResponse(404, "Client asset not found.");
    }
    private buildErrorResponse(statusCode: number, errorMessage: string): Response {
        const payload: ApiErrorResponseRecord = { errorMessage };
        return Response.json(payload, { status: statusCode });
    }
}
export { HttpRequestRouter };
