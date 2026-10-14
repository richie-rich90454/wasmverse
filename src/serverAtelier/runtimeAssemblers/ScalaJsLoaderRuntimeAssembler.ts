import type { BuildContextRecord } from "@sharedKernel/BuildContextRecord.ts";
import type { RuntimeAssetAssemblerContract } from "@serverAtelier/runtimeAssemblers/RuntimeAssetAssemblerContract.ts";
import { FileSystemOperations } from "@serverAtelier/utilities/FileSystemOperations.ts";
const SCALA_LOADER_FILE_NAME = "scala-loader.js";
const SCALA_LOADER_SOURCE = [
    "export async function loadScalaModule(baseUrl, attemptIdentifier) {",
    "    return await import(`${baseUrl}/app.js?attempt=${encodeURIComponent(attemptIdentifier)}`);",
    "}",
    "",
].join("\n");
class ScalaJsLoaderRuntimeAssembler implements RuntimeAssetAssemblerContract {
    private readonly fileSystemOperations: FileSystemOperations;
    constructor(fileSystemOperations: FileSystemOperations) {
        this.fileSystemOperations = fileSystemOperations;
    }
    async assembleRuntimeInto(context: BuildContextRecord): Promise<void> {
        await this.fileSystemOperations.ensureDirectoryExists(context.runtimeDirectory);
        await this.fileSystemOperations.writeTextFile(
            `${context.runtimeDirectory}/${SCALA_LOADER_FILE_NAME}`,
            SCALA_LOADER_SOURCE,
        );
    }
}
export { ScalaJsLoaderRuntimeAssembler };
