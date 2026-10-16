import { spawn } from "node:child_process";
import { resolve } from "node:path";
interface ProcessOutcome {
    exitCode: number;
    standardOutput: string;
    standardError: string;
}
interface ProcessRunOptions {
    workingDirectory?: string;
    environmentOverrides?: Record<string, string>;
}
const RELATIVE_EXECUTABLE_PATTERN = /^\.\.?[\\/]/;
class ProcessRunner {
    async runToCompletion(
        command: ReadonlyArray<string>,
        options: ProcessRunOptions = {},
    ): Promise<ProcessOutcome> {
        const [executablePath, ...argumentList] = this.resolveCommand(command);
        const childProcess = spawn(executablePath as string, argumentList, {
            cwd: options.workingDirectory,
            env: { ...process.env, ...(options.environmentOverrides ?? {}) },
            stdio: ["ignore", "pipe", "pipe"],
        });
        const standardOutputChunks: Array<Buffer> = [];
        const standardErrorChunks: Array<Buffer> = [];
        childProcess.stdout?.on("data", (chunk: Buffer) => {
            standardOutputChunks.push(chunk);
        });
        childProcess.stderr?.on("data", (chunk: Buffer) => {
            standardErrorChunks.push(chunk);
        });
        const exitCode = await new Promise<number>((resolveExit, rejectExit) => {
            childProcess.once("error", (spawnError) => {
                rejectExit(spawnError);
            });
            childProcess.once("close", (reportedExitCode) => {
                resolveExit(reportedExitCode ?? 1);
            });
        });
        return {
            exitCode,
            standardOutput: Buffer.concat(standardOutputChunks).toString("utf8"),
            standardError: Buffer.concat(standardErrorChunks).toString("utf8"),
        };
    }
    async runAndCollectStandardOutput(
        command: ReadonlyArray<string>,
        options: ProcessRunOptions = {},
    ): Promise<string> {
        const outcome = await this.runToCompletion(command, options);
        if (outcome.exitCode !== 0) {
            throw new Error(
                `Command ${command.join(" ")} exited with ${outcome.exitCode}: ${outcome.standardError}`,
            );
        }
        return outcome.standardOutput;
    }
    runDetached(command: ReadonlyArray<string>, options: ProcessRunOptions = {}): unknown {
        const [executablePath, ...argumentList] = this.resolveCommand(command);
        return spawn(executablePath as string, argumentList, {
            cwd: options.workingDirectory,
            env: { ...process.env, ...(options.environmentOverrides ?? {}) },
            stdio: "inherit",
        });
    }
    private resolveCommand(command: ReadonlyArray<string>): ReadonlyArray<string> {
        const executablePath = command[0];
        if (!executablePath || !RELATIVE_EXECUTABLE_PATTERN.test(executablePath)) {
            return command;
        }
        return [resolve(process.cwd(), executablePath), ...command.slice(1)];
    }
}
export { ProcessRunner };
export type { ProcessOutcome, ProcessRunOptions };
