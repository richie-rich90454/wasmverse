import type { BuildContextRecord } from "@sharedKernel/BuildContextRecord.ts";
import type { RuntimeAssetAssemblerContract } from "@serverAtelier/runtimeAssemblers/RuntimeAssetAssemblerContract.ts";
import { EMBEDDED_ASSET_RESOLVER_GLUE_SOURCE } from "@serverAtelier/runtimeAssemblers/EmbeddedAssetResolverGlue.ts";
import { FileSystemOperations } from "@serverAtelier/utilities/FileSystemOperations.ts";
const KOTLIN_LOADER_FILE_NAME = "kotlin-loader.js";
const KOTLIN_LOADER_SOURCE = [
    EMBEDDED_ASSET_RESOLVER_GLUE_SOURCE,
    "export async function loadKotlinModule(baseUrl, attemptIdentifier) {",
    "    return await import(resolve(`${baseUrl}/app.js?attempt=${encodeURIComponent(attemptIdentifier)}`));",
    "}",
    "",
].join("\n");
class KotlinJsGlueRuntimeAssembler implements RuntimeAssetAssemblerContract {
    private readonly fileSystemOperations: FileSystemOperations;
    constructor(fileSystemOperations: FileSystemOperations) {
        this.fileSystemOperations = fileSystemOperations;
    }
    async assembleRuntimeInto(context: BuildContextRecord): Promise<void> {
        await this.fileSystemOperations.ensureDirectoryExists(context.runtimeDirectory);
        await this.fileSystemOperations.writeTextFile(
            `${context.runtimeDirectory}/${KOTLIN_LOADER_FILE_NAME}`,
            KOTLIN_LOADER_SOURCE,
        );
    }
}
export { KotlinJsGlueRuntimeAssembler };
