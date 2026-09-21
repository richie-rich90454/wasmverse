import type { BuildContextRecord } from "@sharedKernel/BuildContextRecord.ts";
import type { CompilerStrategyContract } from "@serverAtelier/compilerStrategies/CompilerStrategyContract.ts";
import { ProcessRunner } from "@serverAtelier/utilities/ProcessRunner.ts";
class WasmPackCompilerStrategy implements CompilerStrategyContract {
    private readonly processRunner: ProcessRunner;
    constructor(processRunner: ProcessRunner) {
        this.processRunner = processRunner;
    }
    async compileSourceInto(context: BuildContextRecord): Promise<void> {
        const outcome = await this.processRunner.runToCompletion([
            "bunx",
            "wasm-pack",
            "build",
            context.sourceDirectory,
            "--target",
            "web",
            "--out-dir",
            context.runtimeDirectory,
        ]);
        if (outcome.exitCode !== 0) {
            throw new Error(`wasm-pack build failed: ${outcome.standardError}`);
        }
    }
}
export { WasmPackCompilerStrategy };
