import type { TerminalStageController } from "@clientTheatre/services/TerminalStageController.ts";
import type { TerminalPerformerContract } from "@clientTheatre/runtimePerformers/TerminalPerformerContract.ts";
import { SessionUserFilesClient } from "@clientTheatre/runtimePerformers/SessionUserFilesClient.ts";
import { RiscvAssembler } from "@clientTheatre/runtimePerformers/RiscvAssembler.ts";
import type { RiscvProgramImage } from "@clientTheatre/runtimePerformers/RiscvAssembler.ts";
import { RiscvMachine } from "@clientTheatre/runtimePerformers/RiscvEmulator.ts";
import {
    TerminalInputNeededSignal,
    isTerminalInputNeeded,
} from "@clientTheatre/runtimePerformers/ReplayableStdinFile.ts";
import { ReplayOutputTracker } from "@clientTheatre/runtimePerformers/ReplayOutputTracker.ts";
import {
    directoryOf,
    joinRelativePath,
    normalizeWithinRoot,
} from "@clientTheatre/runtimePerformers/UserFilePathResolver.ts";
const MAXIMUM_REPLAY_INPUTS = 1000;
class RiscvPerformer implements TerminalPerformerContract {
    private readonly userFilesClient: SessionUserFilesClient;
    private readonly outputTracker: ReplayOutputTracker;
    private entryRelativePath: string = "";
    private programArguments: ReadonlyArray<string> = [];
    private userFiles: Map<string, string> = new Map();
    private programImage: RiscvProgramImage | undefined;
    constructor(sessionBaseUrl: string) {
        this.userFilesClient = new SessionUserFilesClient(sessionBaseUrl);
        this.outputTracker = new ReplayOutputTracker();
    }
    async loadInto(stage: TerminalStageController): Promise<void> {
        const fetchedFiles = await this.userFilesClient.fetchUserFiles();
        this.entryRelativePath = fetchedFiles.entryRelativePath;
        this.programArguments = fetchedFiles.programArguments;
        this.userFiles = fetchedFiles.userFiles;
        stage.writeLine("Assembling RISC-V program.");
        const assembler = new RiscvAssembler((relativePath) =>
            this.resolveIncludedFile(relativePath),
        );
        try {
            this.programImage = assembler.assemble(
                this.entrySourceTextFor(fetchedFiles.entryRelativePath),
                fetchedFiles.entryRelativePath,
            );
        } catch (assemblyError) {
            throw new Error(this.describeRiscvError(assemblyError));
        }
        stage.writeLine("RISC-V program assembled. Programs run in this browser tab.");
    }
    async performOn(stage: TerminalStageController): Promise<void> {
        if (!this.programImage) {
            throw new Error("RISC-V program not assembled. Call loadInto first.");
        }
        stage.writeLine("Running RISC-V program.");
        const fedLines: Array<string> = [];
        for (let inputCount = 0; ; inputCount++) {
            if (inputCount > MAXIMUM_REPLAY_INPUTS) {
                throw new Error("Too many input prompts. Stopping to protect the session.");
            }
            this.outputTracker.beginRun();
            let fedLineIndex = 0;
            let inputWasNeeded = false;
            try {
                const machine = new RiscvMachine(
                    this.programImage,
                    {
                        writeText: (text) => this.outputTracker.appendText(text),
                        readLine: () => {
                            if (fedLineIndex >= fedLines.length) {
                                throw new TerminalInputNeededSignal();
                            }
                            const fedLine = fedLines[fedLineIndex] as string;
                            fedLineIndex += 1;
                            return fedLine;
                        },
                        readFile: (relativePath) => this.lookupUserFile(relativePath),
                    },
                    this.programArguments,
                );
                const exitCode = machine.run();
                if (exitCode !== 0) {
                    throw new Error(`RISC-V program exited with code ${exitCode}.`);
                }
            } catch (runError) {
                if (!isTerminalInputNeeded(runError)) {
                    throw new Error(this.describeRiscvError(runError));
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
    private entrySourceTextFor(entryRelativePath: string): string {
        const entrySourceText = this.userFiles.get(entryRelativePath);
        if (entrySourceText === undefined) {
            throw new Error(`Entry source ${entryRelativePath} is missing from the session.`);
        }
        return entrySourceText;
    }
    private resolveIncludedFile(relativePath: string): string | undefined {
        const basePath = normalizeWithinRoot(
            joinRelativePath(directoryOf(this.entryRelativePath), relativePath),
        );
        return this.userFiles.get(basePath);
    }
    private lookupUserFile(relativePath: string): Uint8Array | undefined {
        const normalizedPath = relativePath.replace(/^\.?\//, "");
        const directMatch = this.userFiles.get(normalizedPath);
        if (directMatch !== undefined) {
            return new TextEncoder().encode(directMatch);
        }
        const basenameMatch = [...this.userFiles.entries()].find(
            ([relativeUserPath]) => relativeUserPath.split("/").pop() === normalizedPath,
        );
        return basenameMatch ? new TextEncoder().encode(basenameMatch[1]) : undefined;
    }
    private describeRiscvError(runError: unknown): string {
        const rawMessage = runError instanceof Error ? runError.message : String(runError);
        const messageLines = rawMessage
            .split("\n")
            .map((line) => line.trimEnd())
            .filter((line) => line.trim().length > 0);
        const lastLine = messageLines[messageLines.length - 1] ?? rawMessage;
        return lastLine.length > 300 ? lastLine.slice(0, 300) : lastLine;
    }
}
export { RiscvPerformer };
