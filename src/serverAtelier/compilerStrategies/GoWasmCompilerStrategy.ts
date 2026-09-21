import type { BuildContextRecord } from "@sharedKernel/BuildContextRecord.ts";
import type { CompilerStrategyContract } from "@serverAtelier/compilerStrategies/CompilerStrategyContract.ts";
import { ProcessRunner } from "@serverAtelier/utilities/ProcessRunner.ts";
class GoWasmCompilerStrategy implements CompilerStrategyContract {
    private readonly processRunner: ProcessRunner;
    constructor(processRunner: ProcessRunner) {
        this.processRunner = processRunner;
    }
    async compileSourceInto(context: BuildContextRecord): Promise<void> {
        const outcome = await this.processRunner.runToCompletion(
            [
                "go",
                "build",
                "-o",
                `${context.runtimeDirectory}/app.wasm`,
                context.entryFileRelativePath,
            ],
            {
                workingDirectory: context.sourceDirectory,
                environmentOverrides: { GOOS: "js", GOARCH: "wasm" },
            },
        );
        if (outcome.exitCode !== 0) {
            throw new Error(`Go WASM build failed: ${outcome.standardError}`);
        }
    }
}
export { GoWasmCompilerStrategy };
