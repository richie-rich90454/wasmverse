import type { TerminalStageController } from "@clientTheatre/services/TerminalStageController.ts";
import type { TerminalPerformerContract } from "@clientTheatre/runtimePerformers/TerminalPerformerContract.ts";
import { SessionUserFilesClient } from "@clientTheatre/runtimePerformers/SessionUserFilesClient.ts";
import {
    TerminalInputNeededSignal,
    isTerminalInputNeeded,
} from "@clientTheatre/runtimePerformers/ReplayableStdinFile.ts";
import { ReplayOutputTracker } from "@clientTheatre/runtimePerformers/ReplayOutputTracker.ts";
import { M6502Assembler } from "@clientTheatre/runtimePerformers/M6502Assembler.ts";
import { M6502Cpu, toHexWord } from "@clientTheatre/runtimePerformers/M6502Cpu.ts";
import {
    directoryOf,
    joinRelativePath,
    normalizeWithinRoot,
} from "@clientTheatre/runtimePerformers/UserFilePathResolver.ts";
const MAXIMUM_REPLAY_INPUTS = 1000;
const MAXIMUM_INSTRUCTION_STEPS = 5_000_000;
class M6502FedInputReader {
    private readonly fedLines: ReadonlyArray<string>;
    private lineIndex: number = 0;
    private byteOffset: number = 0;
    private pendingBytes: ReadonlyArray<number> = [];
    constructor(fedLines: ReadonlyArray<string>) {
        this.fedLines = fedLines;
    }
    readByte(): number {
        while (this.byteOffset >= this.pendingBytes.length) {
            if (this.lineIndex >= this.fedLines.length) {
                throw new TerminalInputNeededSignal();
            }
            const fedLine = this.fedLines[this.lineIndex] as string;
            this.lineIndex++;
            const encodedLine: Array<number> = [];
            for (const character of fedLine) {
                encodedLine.push(character.charCodeAt(0) & 0xff);
            }
            encodedLine.push(13, 10);
            this.pendingBytes = encodedLine;
            this.byteOffset = 0;
        }
        const nextByte = this.pendingBytes[this.byteOffset] as number;
        this.byteOffset++;
        return nextByte;
    }
}
class M6502Performer implements TerminalPerformerContract {
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
        stage.writeLine("6502 runtime ready. Programs assemble and run in this browser tab.");
    }
    async performOn(stage: TerminalStageController): Promise<void> {
        const entrySourceText = this.userFiles.get(this.entryRelativePath);
        if (entrySourceText === undefined) {
            throw new Error(`Entry file ${this.entryRelativePath} is missing from the session.`);
        }
        const fedLines: Array<string> = [];
        stage.writeLine("Assembling and running 6502 program.");
        for (let inputCount = 0; ; inputCount++) {
            if (inputCount > MAXIMUM_REPLAY_INPUTS) {
                throw new Error("Too many input prompts. Stopping to protect the session.");
            }
            this.outputTracker.beginRun();
            let inputWasNeeded = false;
            try {
                const assembly = new M6502Assembler().assemble(entrySourceText, {
                    readFile: (requestedPath: string) => this.readUserFile(requestedPath),
                });
                const inputReader = new M6502FedInputReader(fedLines);
                const cpu = new M6502Cpu({
                    writeOutputCharacter: (characterCode: number) =>
                        this.outputTracker.appendText(String.fromCharCode(characterCode)),
                    readInputByte: () => inputReader.readByte(),
                });
                cpu.loadProgram(assembly.bytes, assembly.origin);
                cpu.reset(assembly.origin);
                const outcome = cpu.run(MAXIMUM_INSTRUCTION_STEPS);
                if (outcome.haltReason === "brk") {
                    throw new Error(`Program stopped by BRK at ${toHexWord(outcome.haltAddress)}.`);
                }
            } catch (runError) {
                if (!isTerminalInputNeeded(runError)) {
                    throw new Error(`6502 error: ${describeM6502Error(runError)}`);
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
    private readUserFile(rawPath: string): string {
        const normalizedPath = normalizeWithinRoot(rawPath);
        const entryDirectory = directoryOf(this.entryRelativePath);
        const candidatePaths =
            entryDirectory.length > 0
                ? [joinRelativePath(entryDirectory, normalizedPath), normalizedPath]
                : [normalizedPath];
        for (const candidatePath of candidatePaths) {
            const fileContent = this.userFiles.get(candidatePath);
            if (fileContent !== undefined) {
                return fileContent;
            }
        }
        throw new Error(`File not found: ${rawPath}`);
    }
}
function describeM6502Error(runError: unknown): string {
    const rawMessage = runError instanceof Error ? runError.message : String(runError);
    const messageLines = rawMessage
        .split("\n")
        .map((line) => line.trimEnd())
        .filter((line) => line.trim().length > 0);
    const lastLine = messageLines[messageLines.length - 1] ?? rawMessage;
    return lastLine.length > 300 ? lastLine.slice(0, 300) : lastLine;
}
export { M6502FedInputReader, M6502Performer, describeM6502Error };
