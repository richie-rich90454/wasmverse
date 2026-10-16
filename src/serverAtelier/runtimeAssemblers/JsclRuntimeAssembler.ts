import type { BuildContextRecord } from "@sharedKernel/BuildContextRecord.ts";
import type { RuntimeAssetAssemblerContract } from "@serverAtelier/runtimeAssemblers/RuntimeAssetAssemblerContract.ts";
import { FileSystemOperations } from "@serverAtelier/utilities/FileSystemOperations.ts";
const COMMON_LISP_RUNTIME_DIRECTORY_NAME = "commonlisp";
const JSCL_TOOLCHAIN_DIRECTORY = "./.tools/jscl";
const JSCL_FILE_NAME = "jscl.js";
class JsclRuntimeAssembler implements RuntimeAssetAssemblerContract {
    private readonly fileSystemOperations: FileSystemOperations;
    private readonly toolchainDirectory: string;
    constructor(
        fileSystemOperations: FileSystemOperations,
        toolchainDirectory: string = JSCL_TOOLCHAIN_DIRECTORY,
    ) {
        this.fileSystemOperations = fileSystemOperations;
        this.toolchainDirectory = toolchainDirectory;
    }
    async assembleRuntimeInto(context: BuildContextRecord): Promise<void> {
        const sourcePath = `${this.toolchainDirectory}/${JSCL_FILE_NAME}`;
        if (!(await this.fileSystemOperations.pathExists(sourcePath))) {
            throw new Error(`JSCL runtime file ${JSCL_FILE_NAME} is missing. Run pnpm run setup.`);
        }
        await this.fileSystemOperations.copyFileInto(
            sourcePath,
            `${context.runtimeDirectory}/${COMMON_LISP_RUNTIME_DIRECTORY_NAME}/${JSCL_FILE_NAME}`,
        );
    }
}
export { JsclRuntimeAssembler };
