interface ProcessOutcome {
    exitCode: number;
    standardOutput: string;
    standardError: string;
}
interface ProcessRunOptions {
    workingDirectory?: string;
    environmentOverrides?: Record<string, string>;
}
class ProcessRunner {
    async runToCompletion(
        command: ReadonlyArray<string>,
        options: ProcessRunOptions = {},
    ): Promise<ProcessOutcome> {
        const childProcess = Bun.spawn(command as string[], {
            cwd: options.workingDirectory,
            env: { ...process.env, ...(options.environmentOverrides ?? {}) } as Record<
                string,
                string
            >,
            stdout: "pipe",
            stderr: "pipe",
        });
        const [standardOutput, standardError, exitCode] = await Promise.all([
            new Response(childProcess.stdout).text(),
            new Response(childProcess.stderr).text(),
            childProcess.exited,
        ]);
        return { exitCode, standardOutput, standardError };
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
        return Bun.spawn(command as string[], {
            cwd: options.workingDirectory,
            env: { ...process.env, ...(options.environmentOverrides ?? {}) } as Record<
                string,
                string
            >,
            stdout: "inherit",
            stderr: "inherit",
        });
    }
}
export { ProcessRunner };
export type { ProcessOutcome, ProcessRunOptions };
