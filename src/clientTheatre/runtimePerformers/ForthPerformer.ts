import type { TerminalStageController } from "@clientTheatre/services/TerminalStageController.ts";
import type { TerminalPerformerContract } from "@clientTheatre/runtimePerformers/TerminalPerformerContract.ts";
import { SessionUserFilesClient } from "@clientTheatre/runtimePerformers/SessionUserFilesClient.ts";
import {
    TerminalInputNeededSignal,
    isTerminalInputNeeded,
} from "@clientTheatre/runtimePerformers/ReplayableStdinFile.ts";
import { ReplayOutputTracker } from "@clientTheatre/runtimePerformers/ReplayOutputTracker.ts";
import { ForthInterpreter } from "@clientTheatre/runtimePerformers/ForthInterpreter.ts";
const MAXIMUM_REPLAY_INPUTS = 1000;
class ForthFedLineReader {
    private readonly fedLines: ReadonlyArray<string>;
    private fedIndex = 0;
    constructor(fedLines: ReadonlyArray<string>) {
        this.fedLines = fedLines;
    }
    readLine(): string {
        const fedLine = this.fedLines[this.fedIndex];
        if (fedLine === undefined) {
            throw new TerminalInputNeededSignal();
        }
        this.fedIndex += 1;
        return fedLine;
    }
}
class ForthProgramRunner {
    private readonly userFiles: ReadonlyMap<string, string>;
    private readonly entryRelativePath: string;
    private readonly programArguments: ReadonlyArray<string>;
    private readonly outputTracker: ReplayOutputTracker;
    constructor(
        userFiles: ReadonlyMap<string, string>,
        entryRelativePath: string,
        programArguments: ReadonlyArray<string>,
        outputTracker: ReplayOutputTracker,
    ) {
        this.userFiles = userFiles;
        this.entryRelativePath = entryRelativePath;
        this.programArguments = programArguments;
        this.outputTracker = outputTracker;
    }
    runOnce(fedLines: ReadonlyArray<string>): void {
        const entrySourceText = this.userFiles.get(this.entryRelativePath);
        if (entrySourceText === undefined) {
            throw new Error(`Entry program ${this.entryRelativePath} is missing from the session.`);
        }
        const fedLineReader = new ForthFedLineReader(fedLines);
        const interpreter = new ForthInterpreter({
            appendOutput: (text: string) => {
                this.outputTracker.appendText(text);
            },
            readLine: () => fedLineReader.readLine(),
            programArguments: this.programArguments,
            userFiles: this.userFiles,
            entryRelativePath: this.entryRelativePath,
        });
        interpreter.run(entrySourceText);
    }
}
class ForthPerformer implements TerminalPerformerContract {
    private readonly userFilesClient: SessionUserFilesClient;
    private readonly outputTracker: ReplayOutputTracker;
    private entryRelativePath: string = "";
    private programArguments: ReadonlyArray<string> = [];
    private userFiles: Map<string, string> = new Map();
    constructor(sessionBaseUrl: string) {
        this.userFilesClient = new SessionUserFilesClient(sessionBaseUrl);
        this.outputTracker = new ReplayOutputTracker();
    }
    async loadInto(stage: TerminalStageController): Promise<void> {
        const fetchedFiles = await this.userFilesClient.fetchUserFiles();
        this.entryRelativePath = fetchedFiles.entryRelativePath;
        this.programArguments = fetchedFiles.programArguments;
        this.userFiles = fetchedFiles.userFiles;
        stage.writeLine("Forth interpreter ready. Programs run in this browser tab.");
    }
    async performOn(stage: TerminalStageController): Promise<void> {
        const fedLines: Array<string> = [];
        const programRunner = new ForthProgramRunner(
            this.userFiles,
            this.entryRelativePath,
            this.programArguments,
            this.outputTracker,
        );
        stage.writeLine("Running Forth program.");
        for (let inputCount = 0; ; inputCount++) {
            if (inputCount > MAXIMUM_REPLAY_INPUTS) {
                throw new Error("Too many input prompts. Stopping to protect the session.");
            }
            this.outputTracker.beginRun();
            let inputWasNeeded = false;
            try {
                programRunner.runOnce(fedLines);
            } catch (runError) {
                if (!isTerminalInputNeeded(runError)) {
                    throw new Error(this.describeForthError(runError));
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
    private describeForthError(runError: unknown): string {
        const rawMessage = runError instanceof Error ? runError.message : String(runError);
        const messageLines = rawMessage
            .split("\n")
            .map((line) => line.trimEnd())
            .filter((line) => line.trim().length > 0);
        const lastLine = messageLines[messageLines.length - 1] ?? rawMessage;
        const shapedLine = lastLine.length > 300 ? lastLine.slice(0, 300) : lastLine;
        return `Forth error: ${shapedLine}`;
    }
}
export { ForthFedLineReader, ForthPerformer };
