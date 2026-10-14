import type { BuildContextRecord } from "@sharedKernel/BuildContextRecord.ts";
import type { RuntimeAssetAssemblerContract } from "@serverAtelier/runtimeAssemblers/RuntimeAssetAssemblerContract.ts";
import { FileSystemOperations } from "@serverAtelier/utilities/FileSystemOperations.ts";
const PURESCRIPT_LOADER_FILE_NAME = "purescript-loader.js";
const PURESCRIPT_LOADER_SOURCE = [
    "export async function loadPureScriptModule(baseUrl, attemptIdentifier) {",
    "    const moduleNamespace = await import(`${baseUrl}/app.js?attempt=${encodeURIComponent(attemptIdentifier)}`);",
    "    let runFunction = moduleNamespace.main;",
    "    if (typeof runFunction !== 'function') {",
    "        runFunction = Object.values(moduleNamespace).find((value) => typeof value === 'function');",
    "    }",
    "    if (typeof runFunction !== 'function') {",
    "        throw new Error('The compiled PureScript module exports no runnable main.');",
    "    }",
    "    const runOutcome = runFunction();",
    "    if (runOutcome && typeof runOutcome.then === 'function') {",
    "        await runOutcome;",
    "    }",
    "}",
    "",
].join("\n");
class PureScriptLoaderRuntimeAssembler implements RuntimeAssetAssemblerContract {
    private readonly fileSystemOperations: FileSystemOperations;
    constructor(fileSystemOperations: FileSystemOperations) {
        this.fileSystemOperations = fileSystemOperations;
    }
    async assembleRuntimeInto(context: BuildContextRecord): Promise<void> {
        await this.fileSystemOperations.ensureDirectoryExists(context.runtimeDirectory);
        await this.fileSystemOperations.writeTextFile(
            `${context.runtimeDirectory}/${PURESCRIPT_LOADER_FILE_NAME}`,
            PURESCRIPT_LOADER_SOURCE,
        );
    }
}
export { PureScriptLoaderRuntimeAssembler };
