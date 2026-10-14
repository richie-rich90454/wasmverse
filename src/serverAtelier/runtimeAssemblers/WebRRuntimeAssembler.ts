import type { BuildContextRecord } from "@sharedKernel/BuildContextRecord.ts";
import type { RuntimeAssetAssemblerContract } from "@serverAtelier/runtimeAssemblers/RuntimeAssetAssemblerContract.ts";
import { FileSystemOperations } from "@serverAtelier/utilities/FileSystemOperations.ts";
const WEBR_RUNTIME_DIRECTORY_NAME = "webr";
const WEBR_LOADER_PACKAGE_FILE_NAME = "webr.js";
const WEBR_KERNEL_PACKAGE_FILE_NAME = "R.js";
const WEBR_KERNEL_EXPORT_FILE_NAME = "R.js";
const WEBR_COPIED_PACKAGE_FILE_NAMES: ReadonlyArray<string> = [
    "webr-worker.js",
    "R.wasm",
    "libRblas.so",
    "libRlapack.so",
];
const WEBR_VFS_PACKAGE_DIRECTORY_NAME = "vfs";
const STREAMING_INSTANTIATION = "WebAssembly.instantiateStreaming(response,imports)";
const BUFFERED_INSTANTIATION =
    "WebAssembly.instantiate(await (await response).arrayBuffer(),imports)";
class WebRRuntimeAssembler implements RuntimeAssetAssemblerContract {
    private readonly fileSystemOperations: FileSystemOperations;
    private readonly webRPackageDirectory: string;
    constructor(
        fileSystemOperations: FileSystemOperations,
        webRPackageDirectory: string = "./node_modules/webr/dist",
    ) {
        this.fileSystemOperations = fileSystemOperations;
        this.webRPackageDirectory = webRPackageDirectory;
    }
    async assembleRuntimeInto(context: BuildContextRecord): Promise<void> {
        const runtimeDirectory = `${context.runtimeDirectory}/${WEBR_RUNTIME_DIRECTORY_NAME}`;
        for (const packageFileName of [
            WEBR_LOADER_PACKAGE_FILE_NAME,
            WEBR_KERNEL_PACKAGE_FILE_NAME,
            ...WEBR_COPIED_PACKAGE_FILE_NAMES,
        ]) {
            if (
                !(await this.fileSystemOperations.pathExists(
                    `${this.webRPackageDirectory}/${packageFileName}`,
                ))
            ) {
                throw new Error(
                    `webR runtime file ${packageFileName} is missing. Run pnpm install.`,
                );
            }
        }
        await this.fileSystemOperations.copyFileInto(
            `${this.webRPackageDirectory}/${WEBR_LOADER_PACKAGE_FILE_NAME}`,
            `${runtimeDirectory}/${WEBR_LOADER_PACKAGE_FILE_NAME}`,
        );
        for (const packageFileName of WEBR_COPIED_PACKAGE_FILE_NAMES) {
            await this.fileSystemOperations.copyFileInto(
                `${this.webRPackageDirectory}/${packageFileName}`,
                `${runtimeDirectory}/${packageFileName}`,
            );
        }
        await this.fileSystemOperations.writeTextFile(
            `${runtimeDirectory}/${WEBR_KERNEL_EXPORT_FILE_NAME}`,
            await this.buildHostSafeKernelModule(),
        );
        const vfsSourceDirectory = `${this.webRPackageDirectory}/${WEBR_VFS_PACKAGE_DIRECTORY_NAME}`;
        if (!(await this.fileSystemOperations.pathExists(vfsSourceDirectory))) {
            throw new Error(
                `webR runtime directory ${WEBR_VFS_PACKAGE_DIRECTORY_NAME} is missing. Run pnpm install.`,
            );
        }
        const vfsFilePaths =
            await this.fileSystemOperations.listFilesRecursively(vfsSourceDirectory);
        for (const relativePath of vfsFilePaths) {
            await this.fileSystemOperations.copyFileInto(
                `${vfsSourceDirectory}/${relativePath}`,
                `${runtimeDirectory}/${WEBR_VFS_PACKAGE_DIRECTORY_NAME}/${relativePath}`,
            );
        }
    }
    private async buildHostSafeKernelModule(): Promise<string> {
        const sourceText = await this.fileSystemOperations.readTextFile(
            `${this.webRPackageDirectory}/${WEBR_KERNEL_PACKAGE_FILE_NAME}`,
        );
        const patchedText = sourceText.split(STREAMING_INSTANTIATION).join(BUFFERED_INSTANTIATION);
        if (patchedText === sourceText) {
            throw new Error(
                `${WEBR_KERNEL_PACKAGE_FILE_NAME} no longer streams its wasm. Reinstall webr and recheck the runtime patch.`,
            );
        }
        return patchedText;
    }
}
export { WebRRuntimeAssembler };
