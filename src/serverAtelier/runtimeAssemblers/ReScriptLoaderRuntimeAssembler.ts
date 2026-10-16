import type { BuildContextRecord } from "@sharedKernel/BuildContextRecord.ts";
import type { RuntimeAssetAssemblerContract } from "@serverAtelier/runtimeAssemblers/RuntimeAssetAssemblerContract.ts";
import { EMBEDDED_ASSET_RESOLVER_GLUE_SOURCE } from "@serverAtelier/runtimeAssemblers/EmbeddedAssetResolverGlue.ts";
import { FileSystemOperations } from "@serverAtelier/utilities/FileSystemOperations.ts";
const RESCRIPT_LOADER_FILE_NAME = "rescript-loader.js";
const RESCRIPT_LOADER_SOURCE = [
    EMBEDDED_ASSET_RESOLVER_GLUE_SOURCE,
    "export async function loadReScriptModule(baseUrl, attemptIdentifier) {",
    "    return await import(resolve(`${baseUrl}/app.js?attempt=${encodeURIComponent(attemptIdentifier)}`));",
    "}",
    "",
].join("\n");
class ReScriptLoaderRuntimeAssembler implements RuntimeAssetAssemblerContract {
    private readonly fileSystemOperations: FileSystemOperations;
    constructor(fileSystemOperations: FileSystemOperations) {
        this.fileSystemOperations = fileSystemOperations;
    }
    async assembleRuntimeInto(context: BuildContextRecord): Promise<void> {
        await this.fileSystemOperations.ensureDirectoryExists(context.runtimeDirectory);
        await this.fileSystemOperations.writeTextFile(
            `${context.runtimeDirectory}/${RESCRIPT_LOADER_FILE_NAME}`,
            RESCRIPT_LOADER_SOURCE,
        );
    }
}
export { ReScriptLoaderRuntimeAssembler };
