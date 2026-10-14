import type { BuildContextRecord } from "@sharedKernel/BuildContextRecord.ts";
import type { RuntimeAssetAssemblerContract } from "@serverAtelier/runtimeAssemblers/RuntimeAssetAssemblerContract.ts";
import { FileSystemOperations } from "@serverAtelier/utilities/FileSystemOperations.ts";
import { scrubRemoteAssetOrigins } from "@serverAtelier/utilities/RemoteAssetScrubber.ts";
const APL_RUNTIME_DIRECTORY_NAME = "ngn-apl";
const APL_RUNTIME_FILE_NAME = "apl.js";
const GLOBAL_NAMESPACE_SOURCE = "let apl=this.apl=";
const GLOBAL_NAMESPACE_REPLACEMENT = "let apl=globalThis.apl=";
const STDIN_CONSTRUCTOR_SOURCE = "asrt(typeof s==='string');return new A(s)}";
const STDIN_CONSTRUCTOR_REPLACEMENT =
    "asrt(typeof s==='string');return A(s.split(''),s.length===1?[]:[s.length])}";
const ESM_EXPORT_SUFFIX = "\nexport default globalThis.apl;\n";
class NgnAplRuntimeAssembler implements RuntimeAssetAssemblerContract {
    private readonly fileSystemOperations: FileSystemOperations;
    private readonly ngnAplPackageDirectory: string;
    constructor(
        fileSystemOperations: FileSystemOperations,
        ngnAplPackageDirectory: string = "./.tools/ngn-apl",
    ) {
        this.fileSystemOperations = fileSystemOperations;
        this.ngnAplPackageDirectory = ngnAplPackageDirectory;
    }
    async assembleRuntimeInto(context: BuildContextRecord): Promise<void> {
        const sourcePath = `${this.ngnAplPackageDirectory}/${APL_RUNTIME_FILE_NAME}`;
        if (!(await this.fileSystemOperations.pathExists(sourcePath))) {
            throw new Error(
                `APL runtime file ${APL_RUNTIME_FILE_NAME} is missing. Run pnpm run setup.`,
            );
        }
        await this.fileSystemOperations.writeTextFile(
            `${context.runtimeDirectory}/${APL_RUNTIME_DIRECTORY_NAME}/${APL_RUNTIME_FILE_NAME}`,
            this.buildBrowserModule(await this.fileSystemOperations.readTextFile(sourcePath)),
        );
    }
    private buildBrowserModule(sourceText: string): string {
        if (!sourceText.includes(GLOBAL_NAMESPACE_SOURCE)) {
            throw new Error(
                "apl.js no longer assigns window.apl from the module scope. Re-pin ./.tools/ngn-apl/apl.js and recheck the runtime patch.",
            );
        }
        if (!sourceText.includes(STDIN_CONSTRUCTOR_SOURCE)) {
            throw new Error(
                "apl.js no longer builds quad input with new A(s). Re-pin ./.tools/ngn-apl/apl.js and recheck the runtime patch.",
            );
        }
        const patchedText = scrubRemoteAssetOrigins(
            sourceText
                .split(GLOBAL_NAMESPACE_SOURCE)
                .join(GLOBAL_NAMESPACE_REPLACEMENT)
                .split(STDIN_CONSTRUCTOR_SOURCE)
                .join(STDIN_CONSTRUCTOR_REPLACEMENT),
        );
        return patchedText + ESM_EXPORT_SUFFIX;
    }
}
export { NgnAplRuntimeAssembler };
