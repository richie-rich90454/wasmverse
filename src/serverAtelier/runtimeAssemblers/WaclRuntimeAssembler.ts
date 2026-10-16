import type { BuildContextRecord } from "@sharedKernel/BuildContextRecord.ts";
import type { RuntimeAssetAssemblerContract } from "@serverAtelier/runtimeAssemblers/RuntimeAssetAssemblerContract.ts";
import { FileSystemOperations } from "@serverAtelier/utilities/FileSystemOperations.ts";
const TCL_RUNTIME_DIRECTORY_NAME = "tcl";
const WACL_TOOLCHAIN_DIRECTORY = "./.tools/tcl";
const WACL_RUNTIME_FILE_NAMES: ReadonlyArray<string> = [
    "wacl.js",
    "wacl.wasm",
    "wacl-library.data",
    "wacl-custom.data",
];
class WaclRuntimeAssembler implements RuntimeAssetAssemblerContract {
    private readonly fileSystemOperations: FileSystemOperations;
    private readonly toolchainDirectory: string;
    constructor(
        fileSystemOperations: FileSystemOperations,
        toolchainDirectory: string = WACL_TOOLCHAIN_DIRECTORY,
    ) {
        this.fileSystemOperations = fileSystemOperations;
        this.toolchainDirectory = toolchainDirectory;
    }
    async assembleRuntimeInto(context: BuildContextRecord): Promise<void> {
        const runtimeDirectory = `${context.runtimeDirectory}/${TCL_RUNTIME_DIRECTORY_NAME}`;
        for (const fileName of WACL_RUNTIME_FILE_NAMES) {
            const sourcePath = `${this.toolchainDirectory}/${fileName}`;
            if (!(await this.fileSystemOperations.pathExists(sourcePath))) {
                throw new Error(`Tcl runtime file ${fileName} is missing. Run pnpm run setup.`);
            }
        }
        for (const fileName of WACL_RUNTIME_FILE_NAMES) {
            await this.fileSystemOperations.copyFileInto(
                `${this.toolchainDirectory}/${fileName}`,
                `${runtimeDirectory}/${fileName}`,
            );
        }
    }
}
export { WaclRuntimeAssembler };
