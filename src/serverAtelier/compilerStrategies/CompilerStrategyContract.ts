import type { BuildContextRecord } from "@sharedKernel/BuildContextRecord.ts";
interface CompilerStrategyContract {
    compileSourceInto(context: BuildContextRecord): Promise<void>;
}
export type { CompilerStrategyContract };
