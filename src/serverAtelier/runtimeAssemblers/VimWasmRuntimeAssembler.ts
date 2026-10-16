import type { BuildContextRecord } from "@sharedKernel/BuildContextRecord.ts";
import type { RuntimeAssetAssemblerContract } from "@serverAtelier/runtimeAssemblers/RuntimeAssetAssemblerContract.ts";
import { FileSystemOperations } from "@serverAtelier/utilities/FileSystemOperations.ts";
const VIM_RUNTIME_DIRECTORY_NAME = "vim-wasm";
const VIM_RUNTIME_FILE_NAMES: ReadonlyArray<string> = ["vim.js", "vim.wasm", "vim.data"];
class VimWasmRuntimeAssembler implements RuntimeAssetAssemblerContract {
    private readonly fileSystemOperations: FileSystemOperations;
    private readonly toolchainDirectory: string;
    constructor(
        fileSystemOperations: FileSystemOperations,
        toolchainDirectory: string = "./.tools/vim-wasm",
    ) {
        this.fileSystemOperations = fileSystemOperations;
        this.toolchainDirectory = toolchainDirectory;
    }
    async assembleRuntimeInto(context: BuildContextRecord): Promise<void> {
        const runtimeDirectory = `${context.runtimeDirectory}/${VIM_RUNTIME_DIRECTORY_NAME}`;
        for (const fileName of VIM_RUNTIME_FILE_NAMES) {
            const sourcePath = `${this.toolchainDirectory}/${fileName}`;
            if (!(await this.fileSystemOperations.pathExists(sourcePath))) {
                throw new Error(`Vim runtime file ${fileName} is missing. Run pnpm run setup.`);
            }
            await this.fileSystemOperations.copyFileInto(
                sourcePath,
                `${runtimeDirectory}/${fileName}`,
            );
        }
    }
}
export { VimWasmRuntimeAssembler };
