import type { TerminalStageController } from "@clientTheatre/services/TerminalStageController.ts";
import type { TerminalPerformerContract } from "@clientTheatre/runtimePerformers/TerminalPerformerContract.ts";
import { SessionUserFilesClient } from "@clientTheatre/runtimePerformers/SessionUserFilesClient.ts";
import { ReplayOutputTracker } from "@clientTheatre/runtimePerformers/ReplayOutputTracker.ts";
const WEBR_RUNTIME_DIRECTORY_NAME = "webr";
const WEBR_USER_HOME_DIRECTORY = "/home/web_user";
const R_STARTUP_BANNER_LINE_PREFIXES: ReadonlyArray<string> = [
    "R version ",
    "Copyright (C) ",
    "Platform: ",
    "R is free software",
    "You are welcome to redistribute",
    "Type 'license()'",
    "Type 'licence()'",
    "R is a collaborative project",
    "Type 'contributors()'",
    "Type 'citation()'",
    "Type 'demo()'",
    "Type 'help()'",
    "help.start()'",
    "Type 'q()'",
];
const CONSOLE_METHOD_NAMES: ReadonlyArray<string> = ["log", "error", "info", "warn", "debug"];
interface WebRMessageRecord {
    type: string;
    data?: unknown;
}
interface WebRFileSystem {
    mkdir(path: string): Promise<unknown>;
    writeFile(path: string, data: ArrayBufferView, flags?: string): Promise<void>;
}
interface WebRInstance {
    init(): Promise<unknown>;
    evalRVoid(code: string): Promise<void>;
    writeConsole(input: string): void;
    read(): Promise<WebRMessageRecord>;
    FS: WebRFileSystem;
}
interface WebRRuntimeModule {
    WebR: new (options: { baseUrl: string; interactive: boolean }) => WebRInstance;
}
class WebRRuntimeLoader {
    private readonly sessionBaseUrl: string;
    private runtimeModule: WebRRuntimeModule | undefined;
    constructor(sessionBaseUrl: string) {
        this.sessionBaseUrl = sessionBaseUrl.replace(/\/+$/, "");
    }
    get runtimeBaseUrl(): string {
        return `${this.sessionBaseUrl}/runtime/${WEBR_RUNTIME_DIRECTORY_NAME}`;
    }
    async loadRuntimeModule(stage: TerminalStageController): Promise<void> {
        stage.writeLine("Loading R runtime.");
        this.runtimeModule = (await import(
            /* @vite-ignore */ `${this.runtimeBaseUrl}/webr.js`
        )) as WebRRuntimeModule;
    }
    async createInstance(): Promise<WebRInstance> {
        if (!this.runtimeModule) {
            throw new Error("R runtime not loaded. Call loadRuntimeModule first.");
        }
        const webRInstance = new this.runtimeModule.WebR({
            baseUrl: `${this.runtimeBaseUrl}/`,
            interactive: false,
        });
        await webRInstance.init();
        return webRInstance;
    }
}
class WebRPerformer implements TerminalPerformerContract {
    private readonly runtimeLoader: WebRRuntimeLoader;
    private readonly userFilesClient: SessionUserFilesClient;
    private readonly outputTracker: ReplayOutputTracker;
    private webRInstance: WebRInstance | undefined;
    private entryRelativePath: string = "";
    private programArguments: ReadonlyArray<string> = [];
    private userFiles: Map<string, string> = new Map();
    private savedConsoleMethods: Array<[string, (...values: Array<unknown>) => void]> = [];
    constructor(sessionBaseUrl: string) {
        this.runtimeLoader = new WebRRuntimeLoader(sessionBaseUrl);
        this.userFilesClient = new SessionUserFilesClient(sessionBaseUrl);
        this.outputTracker = new ReplayOutputTracker();
    }
    async loadInto(stage: TerminalStageController): Promise<void> {
        try {
            await this.runtimeLoader.loadRuntimeModule(stage);
            this.webRInstance = await this.runtimeLoader.createInstance();
        } catch (loadError) {
            const loadMessage = loadError instanceof Error ? loadError.message : String(loadError);
            throw new Error(`R runtime failed to load: ${loadMessage}`);
        }
        const fetchedFiles = await this.userFilesClient.fetchUserFiles();
        this.entryRelativePath = fetchedFiles.entryRelativePath;
        this.programArguments = fetchedFiles.programArguments;
        this.userFiles = fetchedFiles.userFiles;
        await this.writeUserFilesIntoVirtualFileSystem();
        stage.writeLine("R runtime ready.");
    }
    async performOn(stage: TerminalStageController): Promise<void> {
        if (!this.webRInstance) {
            throw new Error("R runtime not loaded. Call loadInto first.");
        }
        const programText = this.buildProgramText();
        stage.writeLine("Running R program.");
        this.outputTracker.beginRun();
        this.routeConsoleIntoOutput();
        try {
            await this.runProgramWhilePumpingMessages(programText);
        } catch (runError) {
            throw new Error(this.describeRError(runError));
        } finally {
            this.restoreConsole();
            this.outputTracker.flushShownInto(stage);
        }
    }
    private async runProgramWhilePumpingMessages(programText: string): Promise<void> {
        const webRInstance = this.webRInstance as WebRInstance;
        let evaluationFailed = false;
        let failureReason: unknown = undefined;
        let readPending: Promise<WebRMessageRecord> | undefined;
        const completion = webRInstance.evalRVoid(programText).then(
            () => undefined,
            (error: unknown) => {
                evaluationFailed = true;
                failureReason = error;
            },
        );
        for (;;) {
            const outcome = await Promise.race([
                (readPending ??= webRInstance.read()).then((message) => ({
                    kind: "message" as const,
                    message,
                })),
                completion.then(() => ({ kind: "settled" as const })),
            ]);
            if (outcome.kind === "settled") {
                break;
            }
            readPending = undefined;
            this.handleRuntimeMessage(outcome.message);
        }
        if (evaluationFailed) {
            throw failureReason;
        }
    }
    private handleRuntimeMessage(message: WebRMessageRecord): void {
        if (message.type === "stdout" || message.type === "stderr") {
            const messageText = String(message.data ?? "");
            this.outputTracker.appendText(
                messageText.endsWith("\n") ? messageText : messageText + "\n",
            );
        }
    }
    private buildProgramText(): string {
        const argumentList = this.programArguments
            .map((argument) => this.escapeRSingleLineString(argument))
            .join(", ");
        return [
            `setwd(${this.escapeRSingleLineString(WEBR_USER_HOME_DIRECTORY)})`,
            `argv <- c(${argumentList})`,
            `commandArgs <- function(trailingOnly = FALSE) c("Rscript", ${this.escapeRSingleLineString(this.entryRelativePath)}, argv)`,
            `source(${this.escapeRSingleLineString(this.entryRelativePath)})`,
        ].join("\n");
    }
    private escapeRSingleLineString(value: string): string {
        return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
    }
    private async writeUserFilesIntoVirtualFileSystem(): Promise<void> {
        const webRInstance = this.webRInstance as WebRInstance;
        const textEncoder = new TextEncoder();
        for (const [relativePath, fileContent] of this.userFiles) {
            const pathSegments = relativePath.split("/");
            let currentDirectory = WEBR_USER_HOME_DIRECTORY;
            for (const directorySegment of pathSegments.slice(0, -1)) {
                currentDirectory = `${currentDirectory}/${directorySegment}`;
                await webRInstance.FS.mkdir(currentDirectory).catch(() => undefined);
            }
            await webRInstance.FS.writeFile(
                `${WEBR_USER_HOME_DIRECTORY}/${relativePath}`,
                textEncoder.encode(fileContent),
            );
        }
    }
    private describeRError(runError: unknown): string {
        const rawMessage = runError instanceof Error ? runError.message : String(runError);
        const messageLines = rawMessage
            .split("\n")
            .map((line) => line.trimEnd())
            .filter((line) => line.trim().length > 0);
        const lastLine = messageLines[messageLines.length - 1] ?? rawMessage;
        return lastLine.length > 300 ? lastLine.slice(0, 300) : lastLine;
    }
    private routeConsoleIntoOutput(): void {
        const consoleRecord = console as unknown as Record<
            string,
            (...values: Array<unknown>) => void
        >;
        for (const methodName of CONSOLE_METHOD_NAMES) {
            const originalMethod = consoleRecord[methodName] as (...values: Array<unknown>) => void;
            this.savedConsoleMethods.push([methodName, originalMethod]);
            consoleRecord[methodName] = (...values: Array<unknown>) => {
                this.appendFilteredOutput(values.map((value) => String(value)).join(" "));
            };
        }
    }
    private restoreConsole(): void {
        const consoleRecord = console as unknown as Record<
            string,
            (...values: Array<unknown>) => void
        >;
        for (const [methodName, originalMethod] of this.savedConsoleMethods) {
            consoleRecord[methodName] = originalMethod;
        }
        this.savedConsoleMethods = [];
    }
    private appendFilteredOutput(text: string): void {
        const keptLines = text.split("\n").filter((line) => !this.isRStartupBannerLine(line));
        if (keptLines.length === 0) {
            return;
        }
        const keptText = keptLines.join("\n");
        this.outputTracker.appendText(keptText.endsWith("\n") ? keptText : keptText + "\n");
    }
    private isRStartupBannerLine(line: string): boolean {
        const trimmedLine = line.trimStart();
        return R_STARTUP_BANNER_LINE_PREFIXES.some((prefix) => trimmedLine.startsWith(prefix));
    }
}
export { WebRPerformer };
