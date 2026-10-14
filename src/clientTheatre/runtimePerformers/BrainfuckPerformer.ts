import type { TerminalStageController } from "@clientTheatre/services/TerminalStageController.ts";
import type { TerminalPerformerContract } from "@clientTheatre/runtimePerformers/TerminalPerformerContract.ts";
import { SessionUserFilesClient } from "@clientTheatre/runtimePerformers/SessionUserFilesClient.ts";
import {
    TerminalInputNeededSignal,
    isTerminalInputNeeded,
} from "@clientTheatre/runtimePerformers/ReplayableStdinFile.ts";
import { ReplayOutputTracker } from "@clientTheatre/runtimePerformers/ReplayOutputTracker.ts";
const MAXIMUM_REPLAY_INPUTS = 1000;
const BRAINFUCK_TAPE_LENGTH = 30000;
const BRAINFUCK_STEP_LIMIT = 5_000_000;
interface BrainfuckInputSource {
    readByte(): number;
}
interface BrainfuckOutputSink {
    writeByte(byte: number): void;
}
class BrainfuckInterpreter {
    run(
        sourceText: string,
        inputSource: BrainfuckInputSource,
        outputSink: BrainfuckOutputSink,
    ): void {
        const jumpByBracketIndex = this.buildJumpTable(sourceText);
        const cells = new Uint8Array(BRAINFUCK_TAPE_LENGTH);
        let cellIndex = 0;
        let stepCount = 0;
        for (
            let instructionIndex = 0;
            instructionIndex < sourceText.length;
            instructionIndex += 1
        ) {
            stepCount += 1;
            if (stepCount > BRAINFUCK_STEP_LIMIT) {
                throw new Error(
                    `Brainfuck program exceeded ${BRAINFUCK_STEP_LIMIT} steps; it probably loops forever.`,
                );
            }
            const instruction = sourceText[instructionIndex];
            switch (instruction) {
                case ">":
                    cellIndex += 1;
                    break;
                case "<":
                    cellIndex -= 1;
                    break;
                case "+":
                    cells[cellIndex] = (cells[cellIndex] + 1) & 0xff;
                    break;
                case "-":
                    cells[cellIndex] = (cells[cellIndex] + 0xff) & 0xff;
                    break;
                case ".":
                    outputSink.writeByte(cells[cellIndex] as number);
                    break;
                case ",":
                    cells[cellIndex] = inputSource.readByte() & 0xff;
                    break;
                case "[":
                    if (cells[cellIndex] === 0) {
                        instructionIndex = jumpByBracketIndex[instructionIndex] as number;
                    }
                    break;
                case "]":
                    if (cells[cellIndex] !== 0) {
                        instructionIndex = jumpByBracketIndex[instructionIndex] as number;
                    }
                    break;
                default:
                    break;
            }
            if (cellIndex < 0 || cellIndex >= BRAINFUCK_TAPE_LENGTH) {
                throw new Error(
                    `Brainfuck pointer left the ${BRAINFUCK_TAPE_LENGTH}-cell tape near position ${instructionIndex}.`,
                );
            }
        }
    }
    private buildJumpTable(sourceText: string): Int32Array {
        const jumpByBracketIndex = new Int32Array(sourceText.length).fill(-1);
        const openBracketPositions: Array<number> = [];
        for (let position = 0; position < sourceText.length; position += 1) {
            const instruction = sourceText[position];
            if (instruction === "[") {
                openBracketPositions.push(position);
            } else if (instruction === "]") {
                const openPosition = openBracketPositions.pop();
                if (openPosition === undefined) {
                    throw new Error(`Unmatched ']' at position ${position}.`);
                }
                jumpByBracketIndex[openPosition] = position;
                jumpByBracketIndex[position] = openPosition;
            }
        }
        if (openBracketPositions.length > 0) {
            throw new Error(`Unmatched '[' at position ${openBracketPositions[0]}.`);
        }
        return jumpByBracketIndex;
    }
}
class BrainfuckStdinBytes implements BrainfuckInputSource {
    private readonly encodedBytes: Uint8Array;
    private byteCursor: number = 0;
    constructor(fedLines: ReadonlyArray<string>) {
        const stdinText = fedLines.map((fedLine) => `${fedLine}\n`).join("");
        this.encodedBytes = new TextEncoder().encode(stdinText);
    }
    readByte(): number {
        if (this.byteCursor >= this.encodedBytes.length) {
            throw new TerminalInputNeededSignal();
        }
        const byte = this.encodedBytes[this.byteCursor] as number;
        this.byteCursor += 1;
        return byte;
    }
}
class BrainfuckByteBuffer implements BrainfuckOutputSink {
    private readonly bytes: Array<number> = [];
    writeByte(byte: number): void {
        this.bytes.push(byte);
    }
    decodedText(): string {
        return new TextDecoder().decode(Uint8Array.from(this.bytes));
    }
}
class BrainfuckPerformer implements TerminalPerformerContract {
    private readonly userFilesClient: SessionUserFilesClient;
    private readonly outputTracker: ReplayOutputTracker;
    private entryRelativePath: string = "";
    private entrySourceText: string = "";
    constructor(sessionBaseUrl: string) {
        this.userFilesClient = new SessionUserFilesClient(sessionBaseUrl);
        this.outputTracker = new ReplayOutputTracker();
    }
    async loadInto(stage: TerminalStageController): Promise<void> {
        const fetchedFiles = await this.userFilesClient.fetchUserFiles();
        this.entryRelativePath = fetchedFiles.entryRelativePath;
        const entrySourceText = fetchedFiles.userFiles.get(this.entryRelativePath);
        if (entrySourceText === undefined) {
            throw new Error(`Entry program ${this.entryRelativePath} is missing from the session.`);
        }
        this.entrySourceText = entrySourceText;
        stage.writeLine("Brainfuck runtime ready. Programs run in this browser tab.");
    }
    async performOn(stage: TerminalStageController): Promise<void> {
        const fedLines: Array<string> = [];
        stage.writeLine("Running Brainfuck program.");
        for (let inputCount = 0; ; inputCount += 1) {
            if (inputCount > MAXIMUM_REPLAY_INPUTS) {
                throw new Error("Too many input prompts. Stopping to protect the session.");
            }
            this.outputTracker.beginRun();
            let inputWasNeeded = false;
            const byteBuffer = new BrainfuckByteBuffer();
            try {
                const interpreter = new BrainfuckInterpreter();
                interpreter.run(
                    this.entrySourceText,
                    new BrainfuckStdinBytes(fedLines),
                    byteBuffer,
                );
            } catch (runError) {
                if (!isTerminalInputNeeded(runError)) {
                    throw new Error(this.describeBrainfuckError(runError));
                }
                inputWasNeeded = true;
            } finally {
                this.outputTracker.appendText(byteBuffer.decodedText());
                this.outputTracker.flushShownInto(stage);
            }
            if (!inputWasNeeded) {
                break;
            }
            const fedLine = await stage.readLine("");
            fedLines.push(fedLine);
        }
    }
    private describeBrainfuckError(runError: unknown): string {
        const rawMessage = runError instanceof Error ? runError.message : String(runError);
        const messageLines = rawMessage
            .split("\n")
            .map((line) => line.trimEnd())
            .filter((line) => line.trim().length > 0);
        const lastLine = messageLines[messageLines.length - 1] ?? rawMessage;
        return lastLine.length > 300 ? lastLine.slice(0, 300) : lastLine;
    }
}
export { BrainfuckInterpreter, BrainfuckStdinBytes, BrainfuckPerformer };
export type { BrainfuckInputSource, BrainfuckOutputSink };
