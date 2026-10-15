import type { BuildContextRecord } from "@sharedKernel/BuildContextRecord.ts";
import type { RuntimeAssetAssemblerContract } from "@serverAtelier/runtimeAssemblers/RuntimeAssetAssemblerContract.ts";
import { EMBEDDED_ASSET_RESOLVER_GLUE_SOURCE } from "@serverAtelier/runtimeAssemblers/EmbeddedAssetResolverGlue.ts";
import { FileSystemOperations } from "@serverAtelier/utilities/FileSystemOperations.ts";
const WEBR_RUNTIME_DIRECTORY_NAME = "webr";
const WEBR_LOADER_PACKAGE_FILE_NAME = "webr.js";
const WEBR_WORKER_PACKAGE_FILE_NAME = "webr-worker.js";
const WEBR_KERNEL_PACKAGE_FILE_NAME = "R.js";
const WEBR_KERNEL_EXPORT_FILE_NAME = "R.js";
const WEBR_COPIED_PACKAGE_FILE_NAMES: ReadonlyArray<string> = [
    "R.wasm",
    "libRblas.so",
    "libRlapack.so",
];
const WEBR_VFS_PACKAGE_DIRECTORY_NAME = "vfs";
const STREAMING_INSTANTIATION = "WebAssembly.instantiateStreaming(response,imports)";
const BUFFERED_INSTANTIATION =
    "WebAssembly.instantiate(await (await response).arrayBuffer(),imports)";
const LAZY_FILE_LOADER =
    "let fn = ENVIRONMENT_IS_NODE ? FS.createPreloadedFile : FS.createLazyFile;";
const LAZY_FILE_LOADER_PATCHED =
    'let resolvedSourceFile = Module.locateFile(src); let fn = (ENVIRONMENT_IS_NODE || resolvedSourceFile.startsWith("blob:")) ? FS.createPreloadedFile : FS.createLazyFile;';
const LAZY_FILE_LOAD_CALL = "fn(dir, file, Module.locateFile(src), true, true);";
const LAZY_FILE_LOAD_CALL_PATCHED = "fn(dir, file, resolvedSourceFile, true, true);";
const WEBR_LOADER_WORKER_URL = "`${t.baseUrl}webr-worker.js`";
const WEBR_LOADER_WORKER_URL_PATCHED = "resolve(`${t.baseUrl}webr-worker.js`)";
const WEBR_WORKER_LOCATE_FILE = "c.locateFile=t=>X.baseUrl+t";
const WEBR_WORKER_LOCATE_FILE_PATCHED =
    "c.locateFile=t=>{const u=X.wasmverseEmbeddedAssetUrls;return u&&u[t]||X.baseUrl+t}";
const WEBR_WORKER_KERNEL_URL = "let t=`${X.baseUrl}R.js`;Tt(t)";
const WEBR_WORKER_KERNEL_URL_PATCHED =
    'let t=(X.wasmverseEmbeddedAssetUrls&&X.wasmverseEmbeddedAssetUrls["R.js"])||`${X.baseUrl}R.js`;Tt(t)';
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
            WEBR_WORKER_PACKAGE_FILE_NAME,
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
        await this.fileSystemOperations.writeTextFile(
            `${runtimeDirectory}/${WEBR_LOADER_PACKAGE_FILE_NAME}`,
            await this.buildEmbeddedAwareLoaderModule(),
        );
        await this.fileSystemOperations.writeTextFile(
            `${runtimeDirectory}/${WEBR_WORKER_PACKAGE_FILE_NAME}`,
            await this.buildEmbeddedAwareWorkerScript(),
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
    private async buildEmbeddedAwareLoaderModule(): Promise<string> {
        const sourceText = await this.fileSystemOperations.readTextFile(
            `${this.webRPackageDirectory}/${WEBR_LOADER_PACKAGE_FILE_NAME}`,
        );
        const patchedText = sourceText
            .split(WEBR_LOADER_WORKER_URL)
            .join(WEBR_LOADER_WORKER_URL_PATCHED);
        if (patchedText === sourceText) {
            throw new Error(
                `${WEBR_LOADER_PACKAGE_FILE_NAME} no longer creates its worker from baseUrl. Reinstall webr and recheck the runtime patch.`,
            );
        }
        return `${EMBEDDED_ASSET_RESOLVER_GLUE_SOURCE}\n${patchedText}`;
    }
    private async buildEmbeddedAwareWorkerScript(): Promise<string> {
        const sourceText = await this.fileSystemOperations.readTextFile(
            `${this.webRPackageDirectory}/${WEBR_WORKER_PACKAGE_FILE_NAME}`,
        );
        const patchedText = sourceText
            .split(WEBR_WORKER_LOCATE_FILE)
            .join(WEBR_WORKER_LOCATE_FILE_PATCHED)
            .split(WEBR_WORKER_KERNEL_URL)
            .join(WEBR_WORKER_KERNEL_URL_PATCHED);
        if (patchedText === sourceText) {
            throw new Error(
                `${WEBR_WORKER_PACKAGE_FILE_NAME} no longer composes its asset urls from baseUrl. Reinstall webr and recheck the runtime patch.`,
            );
        }
        return patchedText;
    }
    private async buildHostSafeKernelModule(): Promise<string> {
        const sourceText = await this.fileSystemOperations.readTextFile(
            `${this.webRPackageDirectory}/${WEBR_KERNEL_PACKAGE_FILE_NAME}`,
        );
        const streamingPatchedText = sourceText
            .split(STREAMING_INSTANTIATION)
            .join(BUFFERED_INSTANTIATION);
        if (streamingPatchedText === sourceText) {
            throw new Error(
                `${WEBR_KERNEL_PACKAGE_FILE_NAME} no longer streams its wasm. Reinstall webr and recheck the runtime patch.`,
            );
        }
        const lazyLoaderPatchedText = streamingPatchedText
            .split(LAZY_FILE_LOADER)
            .join(LAZY_FILE_LOADER_PATCHED)
            .split(LAZY_FILE_LOAD_CALL)
            .join(LAZY_FILE_LOAD_CALL_PATCHED);
        if (lazyLoaderPatchedText === streamingPatchedText) {
            throw new Error(
                `${WEBR_KERNEL_PACKAGE_FILE_NAME} no longer mounts its vfs files lazily. Reinstall webr and recheck the runtime patch.`,
            );
        }
        return lazyLoaderPatchedText;
    }
}
export { WebRRuntimeAssembler };
