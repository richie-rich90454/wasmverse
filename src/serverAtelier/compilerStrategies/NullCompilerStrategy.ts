import type { BuildContextRecord } from "@sharedKernel/BuildContextRecord.ts";
import type { CompilerStrategyContract } from "@serverAtelier/compilerStrategies/CompilerStrategyContract.ts";
class NullCompilerStrategy implements CompilerStrategyContract {
    async compileSourceInto(_context: BuildContextRecord): Promise<void> {
        return Promise.resolve();
    }
}
export { NullCompilerStrategy };
