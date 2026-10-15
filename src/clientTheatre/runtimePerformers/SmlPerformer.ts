import type { TerminalStageController } from "@clientTheatre/services/TerminalStageController.ts";
import type { TerminalPerformerContract } from "@clientTheatre/runtimePerformers/TerminalPerformerContract.ts";
import { SessionUserFilesClient } from "@clientTheatre/runtimePerformers/SessionUserFilesClient.ts";
import {
    TerminalInputNeededSignal,
    isTerminalInputNeeded,
} from "@clientTheatre/runtimePerformers/ReplayableStdinFile.ts";
import { ReplayOutputTracker } from "@clientTheatre/runtimePerformers/ReplayOutputTracker.ts";
import {
    createRuntimeAssetLocator,
    type RuntimeAssetLocator,
} from "@clientTheatre/runtimePerformers/RuntimeAssetLocator.ts";
const MAXIMUM_REPLAY_INPUTS = 1000;
const SML_RUNTIME_FILE_NAME = "app.js";
class SmlFedLineReader {
    private readonly fedLines: ReadonlyArray<string>;
    private lineIndex: number = 0;
    constructor(fedLines: ReadonlyArray<string>) {
        this.fedLines = fedLines;
    }
    readLine(): string {
        if (this.lineIndex >= this.fedLines.length) {
            throw new TerminalInputNeededSignal();
        }
        const fedLine = this.fedLines[this.lineIndex] as string;
        this.lineIndex++;
        return fedLine;
    }
}
class SmlPerformer implements TerminalPerformerContract {
    private readonly assetLocator: RuntimeAssetLocator;
    private readonly userFilesClient: SessionUserFilesClient;
    private readonly outputTracker: ReplayOutputTracker;
    private entryRelativePath: string = "";
    private programArguments: ReadonlyArray<string> = [];
    private userFiles: Map<string, string> = new Map();
    private runtimeSourceText: string | undefined;
    constructor(sessionBaseUrl: string) {
        this.assetLocator = createRuntimeAssetLocator(sessionBaseUrl.replace(/\/+$/, ""));
        this.userFilesClient = new SessionUserFilesClient(sessionBaseUrl);
        this.outputTracker = new ReplayOutputTracker();
    }
    async loadInto(stage: TerminalStageController): Promise<void> {
        const fetchedFiles = await this.userFilesClient.fetchUserFiles();
        this.entryRelativePath = fetchedFiles.entryRelativePath;
        this.programArguments = fetchedFiles.programArguments;
        this.userFiles = fetchedFiles.userFiles;
        stage.writeLine("Standard ML runtime ready. Programs run in this browser tab.");
    }
    async performOn(stage: TerminalStageController): Promise<void> {
        if (!this.userFiles.has(this.entryRelativePath)) {
            throw new Error(`Entry file ${this.entryRelativePath} is missing from the session.`);
        }
        const runtimeSourceText = await this.loadRuntimeSource();
        const fedLines: Array<string> = [];
        stage.writeLine("Running Standard ML program.");
        for (let inputCount = 0; ; inputCount++) {
            if (inputCount > MAXIMUM_REPLAY_INPUTS) {
                throw new Error("Too many input prompts. Stopping to protect the session.");
            }
            this.outputTracker.beginRun();
            let inputWasNeeded = false;
            try {
                const fedLineReader = new SmlFedLineReader(fedLines);
                const runtimeFunction = new Function(
                    "wasmversePrint",
                    "wasmverseReadLine",
                    "wasmverseProgramArguments",
                    runtimeSourceText,
                );
                runtimeFunction(
                    (text: string) => this.outputTracker.appendText(String(text)),
                    () => fedLineReader.readLine(),
                    [...this.programArguments],
                );
            } catch (runError) {
                if (!isTerminalInputNeeded(runError)) {
                    throw new Error(`Standard ML error: ${describeSmlError(runError)}`);
                }
                inputWasNeeded = true;
            } finally {
                this.outputTracker.flushShownInto(stage);
            }
            if (!inputWasNeeded) {
                break;
            }
            const fedLine = await stage.readLine("");
            fedLines.push(fedLine);
        }
    }
    private async loadRuntimeSource(): Promise<string> {
        if (this.runtimeSourceText !== undefined) {
            return this.runtimeSourceText;
        }
        const response = await fetch(
            this.assetLocator.resolveAssetUrl(`runtime/${SML_RUNTIME_FILE_NAME}`),
        );
        if (!response.ok) {
            throw new Error(
                "Standard ML runtime is missing from this session. Run pnpm run setup to provision ./.tools/sml/ and rebuild.",
            );
        }
        this.runtimeSourceText = await response.text();
        return this.runtimeSourceText;
    }
}
function describeSmlError(runError: unknown): string {
    const rawMessage = runError instanceof Error ? runError.message : String(runError);
    const messageLines = rawMessage
        .split("\n")
        .map((line) => line.trimEnd())
        .filter((line) => line.trim().length > 0);
    const lastLine = messageLines[messageLines.length - 1] ?? rawMessage;
    return lastLine.length > 300 ? lastLine.slice(0, 300) : lastLine;
}
export { SmlFedLineReader, SmlPerformer, describeSmlError };
