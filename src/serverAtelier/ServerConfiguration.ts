class ServerConfiguration {
    readonly port: number;
    readonly host: string;
    readonly sessionsDirectory: string;
    readonly clientBuildDirectory: string;
    readonly sessionTimeToLiveMilliseconds: number;
    readonly maximumUploadSizeInBytes: number;
    readonly requestIdleTimeoutSeconds: number;
    readonly sessionUploadsPerMinute: number;
    constructor() {
        this.port = Number(process.env.PORT ?? 3000);
        this.host = process.env.HOST ?? "0.0.0.0";
        this.sessionsDirectory = process.env.SESSIONS_DIRECTORY ?? "./sessions";
        this.clientBuildDirectory = process.env.CLIENT_BUILD_DIRECTORY ?? "./dist/client";
        this.sessionTimeToLiveMilliseconds = Number(
            process.env.SESSION_TTL_MILLISECONDS ?? 30 * 60 * 1000,
        );
        this.maximumUploadSizeInBytes = Number(process.env.MAX_UPLOAD_BYTES ?? 25 * 1024 * 1024);
        this.requestIdleTimeoutSeconds = Number(process.env.REQUEST_IDLE_TIMEOUT_SECONDS ?? 255);
        this.sessionUploadsPerMinute = Number(process.env.SESSION_UPLOADS_PER_MINUTE ?? 10);
    }
}
export { ServerConfiguration };
