import type { BuildContextRecord } from "@sharedKernel/BuildContextRecord.ts";
import type { RuntimeAssetAssemblerContract } from "@serverAtelier/runtimeAssemblers/RuntimeAssetAssemblerContract.ts";
class NullRuntimeAssembler implements RuntimeAssetAssemblerContract {
    async assembleRuntimeInto(_context: BuildContextRecord): Promise<void> {
        return Promise.resolve();
    }
}
export { NullRuntimeAssembler };
