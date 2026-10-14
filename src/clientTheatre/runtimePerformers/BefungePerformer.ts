import type { TerminalStageController } from "@clientTheatre/services/TerminalStageController.ts";
import type { TerminalPerformerContract } from "@clientTheatre/runtimePerformers/TerminalPerformerContract.ts";
import { SessionUserFilesClient } from "@clientTheatre/runtimePerformers/SessionUserFilesClient.ts";
import {
    TerminalInputNeededSignal,
    isTerminalInputNeeded,
} from "@clientTheatre/runtimePerformers/ReplayableStdinFile.ts";
import { ReplayOutputTracker } from "@clientTheatre/runtimePerformers/ReplayOutputTracker.ts";
const MAXIMUM_REPLAY_INPUTS = 1000;
const BEFUNGE_PLAYFIELD_WIDTH = 80;
const BEFUNGE_PLAYFIELD_HEIGHT = 25;
const BEFUNGE_STEP_LIMIT = 1_000_000;
interface BefungeInputSource {
    readCharacter(): number;
    readInteger(): number;
}
interface BefungeOutputSink {
    writeText(text: string): void;
}
class BefungeInterpreter {
    run(sourceText: string, inputSource: BefungeInputSource, outputSink: BefungeOutputSink): void {
        const playfield = this.buildPlayfield(sourceText);
        const valueStack: Array<number> = [];
        const popValue = (): number => (valueStack.length > 0 ? (valueStack.pop() as number) : 0);
        let positionX = 0;
        let positionY = 0;
        let directionX = 1;
        let directionY = 0;
        let stringMode = false;
        let stepCount = 0;
        for (;;) {
            stepCount += 1;
            if (stepCount > BEFUNGE_STEP_LIMIT) {
                throw new Error(
                    `Befunge program exceeded ${BEFUNGE_STEP_LIMIT} steps; it probably loops forever.`,
                );
            }
            const playfieldRow = playfield[positionY] as Array<string>;
            const instruction = playfieldRow[positionX] as string;
            let advanceTwice = false;
            if (stringMode && instruction !== '"') {
                valueStack.push(instruction.charCodeAt(0));
            } else {
                switch (instruction) {
                    case "0":
                    case "1":
                    case "2":
                    case "3":
                    case "4":
                    case "5":
                    case "6":
                    case "7":
                    case "8":
                    case "9":
                        valueStack.push(Number(instruction));
                        break;
                    case "+": {
                        const firstValue = popValue();
                        const secondValue = popValue();
                        valueStack.push(secondValue + firstValue);
                        break;
                    }
                    case "-": {
                        const firstValue = popValue();
                        const secondValue = popValue();
                        valueStack.push(secondValue - firstValue);
                        break;
                    }
                    case "*": {
                        const firstValue = popValue();
                        const secondValue = popValue();
                        valueStack.push(secondValue * firstValue);
                        break;
                    }
                    case "/": {
                        const firstValue = popValue();
                        const secondValue = popValue();
                        if (firstValue === 0) {
                            throw new Error("Befunge '/' division by zero.");
                        }
                        valueStack.push(Math.trunc(secondValue / firstValue));
                        break;
                    }
                    case "%": {
                        const firstValue = popValue();
                        const secondValue = popValue();
                        if (firstValue === 0) {
                            throw new Error("Befunge '%' modulo by zero.");
                        }
                        valueStack.push(secondValue % firstValue);
                        break;
                    }
                    case "!": {
                        const value = popValue();
                        valueStack.push(value === 0 ? 1 : 0);
                        break;
                    }
                    case "`": {
                        const firstValue = popValue();
                        const secondValue = popValue();
                        valueStack.push(secondValue > firstValue ? 1 : 0);
                        break;
                    }
                    case ">":
                        directionX = 1;
                        directionY = 0;
                        break;
                    case "<":
                        directionX = -1;
                        directionY = 0;
                        break;
                    case "^":
                        directionX = 0;
                        directionY = -1;
                        break;
                    case "v":
                        directionX = 0;
                        directionY = 1;
                        break;
                    case "?": {
                        const directions: ReadonlyArray<ReadonlyArray<number>> = [
                            [1, 0],
                            [-1, 0],
                            [0, -1],
                            [0, 1],
                        ];
                        const chosenDirection = directions[
                            Math.floor(Math.random() * directions.length)
                        ] as ReadonlyArray<number>;
                        directionX = chosenDirection[0] as number;
                        directionY = chosenDirection[1] as number;
                        break;
                    }
                    case "_": {
                        const value = popValue();
                        directionX = value === 0 ? 1 : -1;
                        directionY = 0;
                        break;
                    }
                    case "|": {
                        const value = popValue();
                        directionX = 0;
                        directionY = value === 0 ? 1 : -1;
                        break;
                    }
                    case '"':
                        stringMode = !stringMode;
                        break;
                    case ":": {
                        const topValue =
                            valueStack.length > 0
                                ? (valueStack[valueStack.length - 1] as number)
                                : 0;
                        valueStack.push(topValue);
                        break;
                    }
                    case "\\": {
                        const firstValue = popValue();
                        const secondValue = popValue();
                        valueStack.push(firstValue);
                        valueStack.push(secondValue);
                        break;
                    }
                    case "$":
                        popValue();
                        break;
                    case ".":
                        outputSink.writeText(`${popValue()} `);
                        break;
                    case ",":
                        outputSink.writeText(String.fromCharCode(popValue()));
                        break;
                    case "#":
                        advanceTwice = true;
                        break;
                    case "g": {
                        const positionYValue = popValue();
                        const positionXValue = popValue();
                        if (this.isInsidePlayfield(positionXValue, positionYValue)) {
                            const readingRow = playfield[positionYValue] as Array<string>;
                            valueStack.push((readingRow[positionXValue] as string).charCodeAt(0));
                        } else {
                            valueStack.push(0);
                        }
                        break;
                    }
                    case "p": {
                        const positionYValue = popValue();
                        const positionXValue = popValue();
                        const writtenValue = popValue();
                        if (this.isInsidePlayfield(positionXValue, positionYValue)) {
                            const writingRow = playfield[positionYValue] as Array<string>;
                            writingRow[positionXValue] = String.fromCharCode(writtenValue & 0xffff);
                        }
                        break;
                    }
                    case "~":
                        valueStack.push(inputSource.readCharacter());
                        break;
                    case "&":
                        valueStack.push(inputSource.readInteger());
                        break;
                    case "@":
                        return;
                    default:
                        break;
                }
            }
            const advanceDistance = advanceTwice ? 2 : 1;
            positionX =
                (positionX + directionX * advanceDistance + BEFUNGE_PLAYFIELD_WIDTH) %
                BEFUNGE_PLAYFIELD_WIDTH;
            positionY =
                (positionY + directionY * advanceDistance + BEFUNGE_PLAYFIELD_HEIGHT) %
                BEFUNGE_PLAYFIELD_HEIGHT;
        }
    }
    private buildPlayfield(sourceText: string): Array<Array<string>> {
        const programLines = sourceText.replace(/\r\n?/g, "\n").split("\n");
        while (
            programLines.length > 0 &&
            (programLines[programLines.length - 1] as string).trim().length === 0
        ) {
            programLines.pop();
        }
        if (programLines.length > BEFUNGE_PLAYFIELD_HEIGHT) {
            throw new Error(
                `Befunge program has ${programLines.length} lines; the playfield is ${BEFUNGE_PLAYFIELD_HEIGHT} rows.`,
            );
        }
        for (const programLine of programLines) {
            if (programLine.length > BEFUNGE_PLAYFIELD_WIDTH) {
                throw new Error(
                    `Befunge line '${programLine.slice(0, 24)}...' exceeds the ${BEFUNGE_PLAYFIELD_WIDTH}-column playfield.`,
                );
            }
        }
        const playfield: Array<Array<string>> = [];
        for (let rowIndex = 0; rowIndex < BEFUNGE_PLAYFIELD_HEIGHT; rowIndex += 1) {
            const row = new Array<string>(BEFUNGE_PLAYFIELD_WIDTH).fill(" ");
            const programLine = programLines[rowIndex];
            if (programLine !== undefined) {
                for (let columnIndex = 0; columnIndex < programLine.length; columnIndex += 1) {
                    row[columnIndex] = programLine[columnIndex] as string;
                }
            }
            playfield.push(row);
        }
        return playfield;
    }
    private isInsidePlayfield(positionX: number, positionY: number): boolean {
        return (
            positionX >= 0 &&
            positionX < BEFUNGE_PLAYFIELD_WIDTH &&
            positionY >= 0 &&
            positionY < BEFUNGE_PLAYFIELD_HEIGHT
        );
    }
}
class BefungeStdinSource implements BefungeInputSource {
    private readonly text: string;
    private cursor: number = 0;
    constructor(fedLines: ReadonlyArray<string>) {
        this.text = fedLines.map((fedLine) => `${fedLine}\n`).join("");
    }
    readCharacter(): number {
        if (this.cursor >= this.text.length) {
            throw new TerminalInputNeededSignal();
        }
        const characterCode = this.text.charCodeAt(this.cursor);
        this.cursor += 1;
        return characterCode;
    }
    readInteger(): number {
        while (this.cursor < this.text.length && /\s/.test(this.text[this.cursor] as string)) {
            this.cursor += 1;
        }
        if (this.cursor >= this.text.length) {
            throw new TerminalInputNeededSignal();
        }
        const integerMatch = /^[+-]?\d+/.exec(this.text.slice(this.cursor));
        if (!integerMatch) {
            throw new Error(
                `Befunge '&' expected an integer on stdin, found '${this.text.slice(this.cursor, this.cursor + 8)}'.`,
            );
        }
        this.cursor += integerMatch[0].length;
        return Number(integerMatch[0]);
    }
}
class BefungePerformer implements TerminalPerformerContract {
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
        stage.writeLine("Befunge runtime ready. Programs run in this browser tab.");
    }
    async performOn(stage: TerminalStageController): Promise<void> {
        const fedLines: Array<string> = [];
        stage.writeLine("Running Befunge program.");
        for (let inputCount = 0; ; inputCount += 1) {
            if (inputCount > MAXIMUM_REPLAY_INPUTS) {
                throw new Error("Too many input prompts. Stopping to protect the session.");
            }
            this.outputTracker.beginRun();
            let inputWasNeeded = false;
            try {
                const interpreter = new BefungeInterpreter();
                interpreter.run(this.entrySourceText, new BefungeStdinSource(fedLines), {
                    writeText: (text: string) => this.outputTracker.appendText(text),
                });
            } catch (runError) {
                if (!isTerminalInputNeeded(runError)) {
                    throw new Error(this.describeBefungeError(runError));
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
    private describeBefungeError(runError: unknown): string {
        const rawMessage = runError instanceof Error ? runError.message : String(runError);
        const messageLines = rawMessage
            .split("\n")
            .map((line) => line.trimEnd())
            .filter((line) => line.trim().length > 0);
        const lastLine = messageLines[messageLines.length - 1] ?? rawMessage;
        return lastLine.length > 300 ? lastLine.slice(0, 300) : lastLine;
    }
}
export { BefungeInterpreter, BefungeStdinSource, BefungePerformer };
export type { BefungeInputSource, BefungeOutputSink };
