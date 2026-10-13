import type { TerminalStageController } from "@clientTheatre/services/TerminalStageController.ts";
import type { TerminalPerformerContract } from "@clientTheatre/runtimePerformers/TerminalPerformerContract.ts";
import { SessionUserFilesClient } from "@clientTheatre/runtimePerformers/SessionUserFilesClient.ts";
import { ReplayOutputTracker } from "@clientTheatre/runtimePerformers/ReplayOutputTracker.ts";
interface JqRuntime {
    invoke(inputText: string, filterText: string, options?: ReadonlyArray<string>): Promise<string>;
}
interface JqRuntimeModule {
    default: (options: { wasmBinary: ArrayBuffer }) => Promise<JqRuntime>;
}
const DEFAULT_INPUT_DOCUMENT = "null";
const INPUT_DOCUMENT_FILE_NAME = "data.json";
class JqWasmPerformer implements TerminalPerformerContract {
    private readonly sessionBaseUrl: string;
    private readonly userFilesClient: SessionUserFilesClient;
    private readonly outputTracker: ReplayOutputTracker;
    private runtime: JqRuntime | undefined;
    private entrySourceText: string = "";
    private programArguments: ReadonlyArray<string> = [];
    private userFiles: Map<string, string> = new Map();
    constructor(sessionBaseUrl: string) {
        this.sessionBaseUrl = sessionBaseUrl;
        this.userFilesClient = new SessionUserFilesClient(sessionBaseUrl);
        this.outputTracker = new ReplayOutputTracker();
    }
    async loadInto(stage: TerminalStageController): Promise<void> {
        stage.writeLine("Loading jq runtime.");
        try {
            const runtimeModule = (await import(
                /* @vite-ignore */ `${this.sessionBaseUrl}/runtime/jq/jq-runtime.js`
            )) as JqRuntimeModule;
            const wasmResponse = await fetch(`${this.sessionBaseUrl}/runtime/jq/jq.wasm`);
            if (!wasmResponse.ok) {
                throw new Error(`jq.wasm request failed with status ${wasmResponse.status}.`);
            }
            const wasmBinary = await wasmResponse.arrayBuffer();
            this.runtime = await runtimeModule.default({ wasmBinary });
        } catch (loadError) {
            const loadMessage = loadError instanceof Error ? loadError.message : String(loadError);
            throw new Error(`jq runtime failed to load: ${loadMessage}`);
        }
        const fetchedFiles = await this.userFilesClient.fetchUserFiles();
        const entrySourceText = fetchedFiles.userFiles.get(fetchedFiles.entryRelativePath);
        if (entrySourceText === undefined) {
            throw new Error(
                `Entry filter ${fetchedFiles.entryRelativePath} is missing from the session.`,
            );
        }
        this.entrySourceText = entrySourceText;
        this.programArguments = fetchedFiles.programArguments;
        this.userFiles = fetchedFiles.userFiles;
        stage.writeLine("jq runtime ready.");
    }
    async performOn(stage: TerminalStageController): Promise<void> {
        if (!this.runtime) {
            throw new Error("jq runtime not loaded. Call loadInto first.");
        }
        stage.writeLine("Running jq filter.");
        this.outputTracker.beginRun();
        try {
            const inputText =
                this.userFiles.get(INPUT_DOCUMENT_FILE_NAME) ?? DEFAULT_INPUT_DOCUMENT;
            const invokeOptions = [
                ...this.programArguments.flatMap((argumentValue, argumentIndex) => [
                    "--arg",
                    `arg${argumentIndex}`,
                    argumentValue,
                ]),
                "-r",
            ];
            const filterOutput = await this.runtime.invoke(
                inputText,
                this.entrySourceText,
                invokeOptions,
            );
            this.outputTracker.appendText(
                filterOutput.endsWith("\n") ? filterOutput : `${filterOutput}\n`,
            );
        } catch (runError) {
            throw new Error(this.describeJqError(runError));
        } finally {
            this.outputTracker.flushShownInto(stage);
        }
    }
    private describeJqError(runError: unknown): string {
        const rawMessage = runError instanceof Error ? runError.message : String(runError);
        const messageLines = rawMessage
            .split("\n")
            .map((line) => line.trimEnd())
            .filter((line) => line.trim().length > 0);
        const lastLine = messageLines[messageLines.length - 1] ?? rawMessage;
        return lastLine.length > 300 ? lastLine.slice(0, 300) : lastLine;
    }
}
export { JqWasmPerformer };
