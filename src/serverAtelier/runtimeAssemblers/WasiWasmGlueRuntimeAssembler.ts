import type { BuildContextRecord } from "@sharedKernel/BuildContextRecord.ts";
import type { RuntimeAssetAssemblerContract } from "@serverAtelier/runtimeAssemblers/RuntimeAssetAssemblerContract.ts";
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
            "export async function instantiateWasiModule(baseUrl, importObject){ const response = await fetch(`${baseUrl}/app.wasm`); if (!response.ok) { throw new Error(`app.wasm request failed with status ${response.status}`); } const { instance } = await WebAssembly.instantiate(await response.arrayBuffer(), importObject); return instance; }\n",
        );
    }
}
export { WasiWasmGlueRuntimeAssembler };
