import type { TerminalStageController } from "@clientTheatre/services/TerminalStageController.ts";
import type { TerminalPerformerContract } from "@clientTheatre/runtimePerformers/TerminalPerformerContract.ts";
import { SessionUserFilesClient } from "@clientTheatre/runtimePerformers/SessionUserFilesClient.ts";
import {
    TerminalInputNeededSignal,
    isTerminalInputNeeded,
} from "@clientTheatre/runtimePerformers/ReplayableStdinFile.ts";
import { ReplayOutputTracker } from "@clientTheatre/runtimePerformers/ReplayOutputTracker.ts";
import { GwBasicInterpreter } from "@clientTheatre/runtimePerformers/GwBasicInterpreter.ts";
const MAXIMUM_REPLAY_INPUTS = 1000;
class GwBasicFedLineReader {
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
class GwBasicPerformer implements TerminalPerformerContract {
    private readonly userFilesClient: SessionUserFilesClient;
    private readonly outputTracker: ReplayOutputTracker;
    private entryRelativePath: string = "";
    private userFiles: Map<string, string> = new Map();
    constructor(sessionBaseUrl: string) {
        this.userFilesClient = new SessionUserFilesClient(sessionBaseUrl);
        this.outputTracker = new ReplayOutputTracker();
    }
    async loadInto(stage: TerminalStageController): Promise<void> {
        const fetchedFiles = await this.userFilesClient.fetchUserFiles();
        this.entryRelativePath = fetchedFiles.entryRelativePath;
        this.userFiles = fetchedFiles.userFiles;
        stage.writeLine("GW-BASIC runtime ready. Programs run in this browser tab.");
    }
    async performOn(stage: TerminalStageController): Promise<void> {
        const entrySourceText = this.userFiles.get(this.entryRelativePath);
        if (entrySourceText === undefined) {
            throw new Error(`Entry file ${this.entryRelativePath} is missing from the session.`);
        }
        const fedLines: Array<string> = [];
        stage.writeLine("Running GW-BASIC program.");
        for (let inputCount = 0; ; inputCount++) {
            if (inputCount > MAXIMUM_REPLAY_INPUTS) {
                throw new Error("Too many input prompts. Stopping to protect the session.");
            }
            this.outputTracker.beginRun();
            let inputWasNeeded = false;
            try {
                const fedLineReader = new GwBasicFedLineReader(fedLines);
                const interpreter = new GwBasicInterpreter();
                interpreter.run(entrySourceText, {
                    sink: {
                        writeText: (text: string) => this.outputTracker.appendText(text),
                    },
                    readLine: () => fedLineReader.readLine(),
                });
            } catch (runError) {
                if (!isTerminalInputNeeded(runError)) {
                    throw new Error(`GW-BASIC error: ${describeGwBasicError(runError)}`);
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
}
function describeGwBasicError(runError: unknown): string {
    const rawMessage = runError instanceof Error ? runError.message : String(runError);
    const messageLines = rawMessage
        .split("\n")
        .map((line) => line.trimEnd())
        .filter((line) => line.trim().length > 0);
    const lastLine = messageLines[messageLines.length - 1] ?? rawMessage;
    return lastLine.length > 300 ? lastLine.slice(0, 300) : lastLine;
}
export { GwBasicFedLineReader, GwBasicPerformer, describeGwBasicError };
