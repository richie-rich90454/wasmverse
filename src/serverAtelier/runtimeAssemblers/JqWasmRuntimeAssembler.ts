import type { BuildContextRecord } from "@sharedKernel/BuildContextRecord.ts";
import type { RuntimeAssetAssemblerContract } from "@serverAtelier/runtimeAssemblers/RuntimeAssetAssemblerContract.ts";
import { FileSystemOperations } from "@serverAtelier/utilities/FileSystemOperations.ts";
const JQ_RUNTIME_DIRECTORY_NAME = "jq";
const JQ_WASM_FILE_NAME = "jq.wasm";
const JQ_GLUE_FILE_NAME = "jq-runtime.mjs";
const JQ_GLUE_EXPORT_FILE_NAME = "jq-runtime.js";
class JqWasmRuntimeAssembler implements RuntimeAssetAssemblerContract {
    private readonly fileSystemOperations: FileSystemOperations;
    private readonly toolchainDirectory: string;
    constructor(
        fileSystemOperations: FileSystemOperations,
        toolchainDirectory: string = "./.tools/jq-wasm",
    ) {
        this.fileSystemOperations = fileSystemOperations;
        this.toolchainDirectory = toolchainDirectory;
    }
    async assembleRuntimeInto(context: BuildContextRecord): Promise<void> {
        const runtimeDirectory = `${context.runtimeDirectory}/${JQ_RUNTIME_DIRECTORY_NAME}`;
        const wasmSourcePath = `${this.toolchainDirectory}/${JQ_WASM_FILE_NAME}`;
        const glueSourcePath = `${this.toolchainDirectory}/${JQ_GLUE_FILE_NAME}`;
        if (!(await this.fileSystemOperations.pathExists(wasmSourcePath))) {
            throw new Error(`jq runtime file ${JQ_WASM_FILE_NAME} is missing. Run pnpm run setup.`);
        }
        if (!(await this.fileSystemOperations.pathExists(glueSourcePath))) {
            throw new Error(`jq runtime file ${JQ_GLUE_FILE_NAME} is missing. Run pnpm run setup.`);
        }
        await this.fileSystemOperations.copyFileInto(
            wasmSourcePath,
            `${runtimeDirectory}/${JQ_WASM_FILE_NAME}`,
        );
        await this.fileSystemOperations.copyFileInto(
            glueSourcePath,
            `${runtimeDirectory}/${JQ_GLUE_EXPORT_FILE_NAME}`,
        );
    }
}
export { JqWasmRuntimeAssembler };
