import type { BuildContextRecord } from "@sharedKernel/BuildContextRecord.ts";
import type { RuntimeAssetAssemblerContract } from "@serverAtelier/runtimeAssemblers/RuntimeAssetAssemblerContract.ts";
import { EMBEDDED_ASSET_RESOLVER_GLUE_SOURCE } from "@serverAtelier/runtimeAssemblers/EmbeddedAssetResolverGlue.ts";
import { FileSystemOperations } from "@serverAtelier/utilities/FileSystemOperations.ts";
class EmscriptenGlueRuntimeAssembler implements RuntimeAssetAssemblerContract {
    private readonly fileSystemOperations: FileSystemOperations;
    constructor(fileSystemOperations: FileSystemOperations) {
        this.fileSystemOperations = fileSystemOperations;
    }
    async assembleRuntimeInto(context: BuildContextRecord): Promise<void> {
        await this.fileSystemOperations.ensureDirectoryExists(context.runtimeDirectory);
        await this.fileSystemOperations.writeTextFile(
            `${context.runtimeDirectory}/emscripten-loader.js`,
            `${EMBEDDED_ASSET_RESOLVER_GLUE_SOURCE}\n` +
                "export async function loadEmscriptenModule(baseUrl, overrides){ const factory = (await import(resolve(`${baseUrl}/app.js`))).default; return factory({ locateFile: (fileName) => resolve(`${baseUrl}/${fileName}`), ...overrides }); }\n",
        );
    }
}
export { EmscriptenGlueRuntimeAssembler };
