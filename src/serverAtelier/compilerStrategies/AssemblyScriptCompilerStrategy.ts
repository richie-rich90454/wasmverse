import type { BuildContextRecord } from "@sharedKernel/BuildContextRecord.ts";
import type { CompilerStrategyContract } from "@serverAtelier/compilerStrategies/CompilerStrategyContract.ts";
import { ProcessRunner } from "@serverAtelier/utilities/ProcessRunner.ts";
class AssemblyScriptCompilerStrategy implements CompilerStrategyContract {
    private readonly processRunner: ProcessRunner;
    constructor(processRunner: ProcessRunner) {
        this.processRunner = processRunner;
    }
    async compileSourceInto(context: BuildContextRecord): Promise<void> {
        const outcome = await this.processRunner.runToCompletion(
            [
                "bunx",
                "asc",
                context.entryFileRelativePath,
                "--outFile",
                `${context.runtimeDirectory}/app.wasm`,
                "--optimize",
            ],
            { workingDirectory: context.sourceDirectory },
        );
        if (outcome.exitCode !== 0) {
            throw new Error(`AssemblyScript compilation failed: ${outcome.standardError}`);
        }
    }
}
export { AssemblyScriptCompilerStrategy };
