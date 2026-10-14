import type { BuildContextRecord } from "@sharedKernel/BuildContextRecord.ts";
import type { RuntimeAssetAssemblerContract } from "@serverAtelier/runtimeAssemblers/RuntimeAssetAssemblerContract.ts";
import { FileSystemOperations } from "@serverAtelier/utilities/FileSystemOperations.ts";
const GLEAM_LOADER_FILE_NAME = "gleam-loader.js";
const GLEAM_LOADER_SOURCE = [
    "export async function loadGleamModule(baseUrl, attemptIdentifier) {",
    "    const moduleNamespace = await import(`${baseUrl}/app.js?attempt=${encodeURIComponent(attemptIdentifier)}`);",
    "    const runFunction = moduleNamespace.main;",
    "    if (typeof runFunction !== 'function') {",
    "        throw new Error('The compiled Gleam module exports no main function.');",
    "    }",
    "    const runOutcome = runFunction();",
    "    if (runOutcome && typeof runOutcome.then === 'function') {",
    "        await runOutcome;",
    "    }",
    "}",
    "",
].join("\n");
class GleamLoaderRuntimeAssembler implements RuntimeAssetAssemblerContract {
    private readonly fileSystemOperations: FileSystemOperations;
    constructor(fileSystemOperations: FileSystemOperations) {
        this.fileSystemOperations = fileSystemOperations;
    }
    async assembleRuntimeInto(context: BuildContextRecord): Promise<void> {
        await this.fileSystemOperations.ensureDirectoryExists(context.runtimeDirectory);
        await this.fileSystemOperations.writeTextFile(
            `${context.runtimeDirectory}/${GLEAM_LOADER_FILE_NAME}`,
            GLEAM_LOADER_SOURCE,
        );
    }
}
export { GleamLoaderRuntimeAssembler };
