import { HttpRequestRouter } from "@serverAtelier/HttpRequestRouter.ts";
import { ServerConfiguration } from "@serverAtelier/ServerConfiguration.ts";
import { ScopedLogger } from "@serverAtelier/ScopedLogger.ts";
class HttpServerHost {
    private readonly httpRequestRouter: HttpRequestRouter;
    private readonly serverConfiguration: ServerConfiguration;
    private readonly scopedLogger: ScopedLogger;
    private serverHandle: ReturnType<typeof Bun.serve> | undefined;
    constructor(
        httpRequestRouter: HttpRequestRouter,
        serverConfiguration: ServerConfiguration,
        scopedLogger: ScopedLogger,
    ) {
        this.httpRequestRouter = httpRequestRouter;
        this.serverConfiguration = serverConfiguration;
        this.scopedLogger = scopedLogger;
    }
    start(): void {
        const router = this.httpRequestRouter;
        this.serverHandle = Bun.serve({
            hostname: this.serverConfiguration.host,
            port: this.serverConfiguration.port,
            idleTimeout: this.serverConfiguration.requestIdleTimeoutSeconds,
            fetch: (request: Request) => router.routeRequest(request),
        });
        this.scopedLogger.logSuccess(
            `Listening on http://${this.serverConfiguration.host}:${this.serverConfiguration.port}.`,
        );
    }
    async stop(): Promise<void> {
        this.serverHandle?.stop(true);
        this.serverHandle = undefined;
    }
}
export { HttpServerHost };
