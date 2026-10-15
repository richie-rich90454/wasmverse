import type { BuildContextRecord } from "@sharedKernel/BuildContextRecord.ts";
import type { RuntimeAssetAssemblerContract } from "@serverAtelier/runtimeAssemblers/RuntimeAssetAssemblerContract.ts";
import { EMBEDDED_ASSET_RESOLVER_GLUE_SOURCE } from "@serverAtelier/runtimeAssemblers/EmbeddedAssetResolverGlue.ts";
import { FileSystemOperations } from "@serverAtelier/utilities/FileSystemOperations.ts";
const FABLE_LOADER_FILE_NAME = "fable-loader.js";
const FABLE_LOADER_SOURCE = [
    EMBEDDED_ASSET_RESOLVER_GLUE_SOURCE,
    "export async function loadFableModule(baseUrl, attemptIdentifier) {",
    "    return await import(resolve(`${baseUrl}/app.js?attempt=${encodeURIComponent(attemptIdentifier)}`));",
    "}",
    "",
].join("\n");
class FableLoaderRuntimeAssembler implements RuntimeAssetAssemblerContract {
    private readonly fileSystemOperations: FileSystemOperations;
    constructor(fileSystemOperations: FileSystemOperations) {
        this.fileSystemOperations = fileSystemOperations;
    }
    async assembleRuntimeInto(context: BuildContextRecord): Promise<void> {
        await this.fileSystemOperations.ensureDirectoryExists(context.runtimeDirectory);
        await this.fileSystemOperations.writeTextFile(
            `${context.runtimeDirectory}/${FABLE_LOADER_FILE_NAME}`,
            FABLE_LOADER_SOURCE,
        );
    }
}
export { FableLoaderRuntimeAssembler };
