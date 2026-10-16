import type { BuildContextRecord } from "@sharedKernel/BuildContextRecord.ts";
import type { RuntimeAssetAssemblerContract } from "@serverAtelier/runtimeAssemblers/RuntimeAssetAssemblerContract.ts";
import { EMBEDDED_ASSET_RESOLVER_GLUE_SOURCE } from "@serverAtelier/runtimeAssemblers/EmbeddedAssetResolverGlue.ts";
import { FileSystemOperations } from "@serverAtelier/utilities/FileSystemOperations.ts";
class WasiWasmGlueRuntimeAssembler implements RuntimeAssetAssemblerContract {
    private readonly fileSystemOperations: FileSystemOperations;
    constructor(fileSystemOperations: FileSystemOperations) {
        this.fileSystemOperations = fileSystemOperations;
    }
    async assembleRuntimeInto(context: BuildContextRecord): Promise<void> {
        await this.fileSystemOperations.ensureDirectoryExists(context.runtimeDirectory);
        await this.fileSystemOperations.writeTextFile(
            `${context.runtimeDirectory}/wasi-loader.js`,
            `${EMBEDDED_ASSET_RESOLVER_GLUE_SOURCE}\n` +
                "export async function instantiateWasiModule(baseUrl, importObject){ const response = await fetch(resolve(`${baseUrl}/app.wasm`)); if (!response.ok) { throw new Error(`app.wasm request failed with status ${response.status}`); } const { instance } = await WebAssembly.instantiate(await response.arrayBuffer(), importObject); return instance; }\n",
        );
    }
}
export { WasiWasmGlueRuntimeAssembler };
