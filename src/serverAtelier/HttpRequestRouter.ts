import type { ApiErrorResponseRecord } from "@sharedKernel/ApiErrorResponseRecord.ts";
import { BuildOrchestrator } from "@serverAtelier/BuildOrchestrator.ts";
import { SessionRegistry } from "@serverAtelier/SessionRegistry.ts";
import { LanguagePluginRegistry } from "@serverAtelier/pluginHost/LanguagePluginRegistry.ts";
import { ServerConfiguration } from "@serverAtelier/ServerConfiguration.ts";
import { ScopedLogger } from "@serverAtelier/ScopedLogger.ts";
import { PathGuard } from "@serverAtelier/utilities/PathGuard.ts";
class HttpRequestRouter {
    private readonly buildOrchestrator: BuildOrchestrator;
    private readonly sessionRegistry: SessionRegistry;
    private readonly languagePluginRegistry: LanguagePluginRegistry;
    private readonly serverConfiguration: ServerConfiguration;
    private readonly scopedLogger: ScopedLogger;
    private readonly pathGuard: PathGuard;
    constructor(
        buildOrchestrator: BuildOrchestrator,
        sessionRegistry: SessionRegistry,
        languagePluginRegistry: LanguagePluginRegistry,
        serverConfiguration: ServerConfiguration,
        scopedLogger: ScopedLogger,
        pathGuard: PathGuard,
    ) {
        this.buildOrchestrator = buildOrchestrator;
        this.sessionRegistry = sessionRegistry;
        this.languagePluginRegistry = languagePluginRegistry;
        this.serverConfiguration = serverConfiguration;
        this.scopedLogger = scopedLogger;
        this.pathGuard = pathGuard;
    }
    async routeRequest(request: Request): Promise<Response> {
        const requestUrl = new URL(request.url);
        if (request.method === "POST" && requestUrl.pathname === "/api/session") {
            return this.handleSessionUpload(request);
        }
        if (request.method === "GET" && requestUrl.pathname === "/api/health") {
            return this.handleHealthCheck();
        }
        if (request.method === "GET" && requestUrl.pathname.startsWith("/session/")) {
            return this.handleSessionAssetRequest(requestUrl);
        }
        return this.handleClientAssetRequest(requestUrl);
    }
    private async handleSessionUpload(request: Request): Promise<Response> {
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
        const candidatePaths = [
            `${this.serverConfiguration.clientBuildDirectory}/${relativePath}`,
            `${this.serverConfiguration.clientBuildDirectory}/index.html`,
        ];
        for (const candidatePath of candidatePaths) {
            const candidateFile = Bun.file(candidatePath);
            if (await candidateFile.exists()) {
                return new Response(candidateFile);
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
