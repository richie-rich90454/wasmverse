import type { BuildContextRecord } from "@sharedKernel/BuildContextRecord.ts";
interface RuntimeAssetAssemblerContract {
    assembleRuntimeInto(context: BuildContextRecord): Promise<void>;
}
export type { RuntimeAssetAssemblerContract };
