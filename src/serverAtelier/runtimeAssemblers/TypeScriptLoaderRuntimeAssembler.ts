import type { BuildContextRecord } from "@sharedKernel/BuildContextRecord.ts";
import type { RuntimeAssetAssemblerContract } from "@serverAtelier/runtimeAssemblers/RuntimeAssetAssemblerContract.ts";
import { FileSystemOperations } from "@serverAtelier/utilities/FileSystemOperations.ts";
const TYPESCRIPT_LOADER_FILE_NAME = "typescript-loader.js";
const TYPESCRIPT_LOADER_SOURCE = [
    "export async function loadTypeScriptModule(baseUrl, attemptIdentifier) {",
    "    const composedUrl = `${baseUrl}/app.js?attempt=${encodeURIComponent(attemptIdentifier)}`;",
    "    const resolveEmbeddedAsset = globalThis.__WASMVERSE_RESOLVE_EMBEDDED_ASSET__;",
    "    return await import(resolveEmbeddedAsset ? resolveEmbeddedAsset(composedUrl) : composedUrl);",
    "}",
    "",
].join("\n");
class TypeScriptLoaderRuntimeAssembler implements RuntimeAssetAssemblerContract {
    private readonly fileSystemOperations: FileSystemOperations;
    constructor(fileSystemOperations: FileSystemOperations) {
        this.fileSystemOperations = fileSystemOperations;
    }
    async assembleRuntimeInto(context: BuildContextRecord): Promise<void> {
        await this.fileSystemOperations.writeTextFile(
            `${context.runtimeDirectory}/${TYPESCRIPT_LOADER_FILE_NAME}`,
            TYPESCRIPT_LOADER_SOURCE,
        );
    }
}
export { TypeScriptLoaderRuntimeAssembler };
