import { ScopedLogger } from "@serverAtelier/ScopedLogger.ts";
import { ServerComposition } from "@serverAtelier/ServerComposition.ts";
class ServerApplication {
    private readonly composition: ServerComposition;
    private readonly scopedLogger: ScopedLogger;
    constructor() {
        this.composition = new ServerComposition();
        this.scopedLogger = new ScopedLogger("ServerApplication");
    }
    async run(): Promise<void> {
        await this.composition.fileSystemOperations.ensureDirectoryExists(
            this.composition.serverConfiguration.sessionsDirectory,
        );
        this.scopedLogger.logInformation("Universal WASM Platform server starting.");
        this.composition.httpServerHost.start();
        const shutdownHandler = async () => {
            this.scopedLogger.logInformation("Shutting down.");
            await this.composition.httpServerHost.stop();
            process.exit(0);
        };
        process.on("SIGINT", () => void shutdownHandler());
        process.on("SIGTERM", () => void shutdownHandler());
    }
}
export { ServerApplication };
