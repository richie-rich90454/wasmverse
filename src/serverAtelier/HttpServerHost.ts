import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { HttpRequestRouter } from "@serverAtelier/HttpRequestRouter.ts";
import { ServerConfiguration } from "@serverAtelier/ServerConfiguration.ts";
import { ScopedLogger } from "@serverAtelier/ScopedLogger.ts";
class HttpServerHost {
    private readonly httpRequestRouter: HttpRequestRouter;
    private readonly serverConfiguration: ServerConfiguration;
    private readonly scopedLogger: ScopedLogger;
    private serverHandle: ReturnType<typeof createServer> | undefined;
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
        this.serverHandle = createServer((nodeRequest, nodeResponse) => {
            void this.dispatchRequest(nodeRequest, nodeResponse);
        });
        this.serverHandle.requestTimeout =
            this.serverConfiguration.requestIdleTimeoutSeconds * 1000;
        this.serverHandle.listen(
            this.serverConfiguration.port,
            this.serverConfiguration.host,
            () => {
                this.scopedLogger.logSuccess(
                    `Listening on http://${this.serverConfiguration.host}:${this.serverConfiguration.port}.`,
                );
            },
        );
    }
    async stop(): Promise<void> {
        const serverHandle = this.serverHandle;
        if (!serverHandle) {
            return;
        }
        this.serverHandle = undefined;
        await new Promise<void>((resolveStop) => {
            serverHandle.close(() => resolveStop());
            serverHandle.closeAllConnections();
        });
    }
    private async dispatchRequest(
        nodeRequest: IncomingMessage,
        nodeResponse: ServerResponse,
    ): Promise<void> {
        try {
            const webResponse = await this.httpRequestRouter.routeRequest(
                this.buildWebRequest(nodeRequest),
            );
            await this.writeWebResponse(webResponse, nodeResponse, nodeRequest.method === "HEAD");
        } catch (dispatchError) {
            const errorMessage =
                dispatchError instanceof Error ? dispatchError.message : String(dispatchError);
            this.scopedLogger.logError(`Request dispatch failed: ${errorMessage}`);
            if (!nodeResponse.headersSent) {
                nodeResponse.statusCode = 500;
                nodeResponse.setHeader("content-type", "application/json; charset=utf-8");
            }
            nodeResponse.end(JSON.stringify({ errorMessage: "Internal server error." }));
        }
    }
    private buildWebRequest(nodeRequest: IncomingMessage): Request {
        const hostHeader =
            nodeRequest.headers.host ??
            `${this.serverConfiguration.host}:${this.serverConfiguration.port}`;
        const requestHeaders = new Headers();
        for (const [headerName, headerValue] of Object.entries(nodeRequest.headers)) {
            if (headerValue === undefined) {
                continue;
            }
            if (Array.isArray(headerValue)) {
                for (const singleValue of headerValue) {
                    requestHeaders.append(headerName, singleValue);
                }
            } else {
                requestHeaders.set(headerName, headerValue);
            }
        }
        const method = nodeRequest.method ?? "GET";
        const requestInit: RequestInit & { duplex?: string } = {
            method,
            headers: requestHeaders,
        };
        if (method !== "GET" && method !== "HEAD") {
            requestInit.body = Readable.toWeb(nodeRequest) as unknown as ReadableStream;
            requestInit.duplex = "half";
        }
        return new Request(`http://${hostHeader}${nodeRequest.url ?? "/"}`, requestInit);
    }
    private async writeWebResponse(
        webResponse: Response,
        nodeResponse: ServerResponse,
        isHeadRequest: boolean,
    ): Promise<void> {
        nodeResponse.statusCode = webResponse.status;
        webResponse.headers.forEach((headerValue, headerName) => {
            nodeResponse.setHeader(headerName, headerValue);
        });
        if (isHeadRequest || webResponse.body === null) {
            nodeResponse.end();
            return;
        }
        await pipeline(
            Readable.fromWeb(
                webResponse.body as unknown as import("node:stream/web").ReadableStream,
            ),
            nodeResponse,
        );
    }
}
export { HttpServerHost };
