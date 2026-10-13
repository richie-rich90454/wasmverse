import type { BuildContextRecord } from "@sharedKernel/BuildContextRecord.ts";
import type { RuntimeAssetAssemblerContract } from "@serverAtelier/runtimeAssemblers/RuntimeAssetAssemblerContract.ts";
import { FileSystemOperations } from "@serverAtelier/utilities/FileSystemOperations.ts";
const BUSYBOX_RUNTIME_DIRECTORY_NAME = "busybox";
const BUSYBOX_PACKAGE_FILE_NAME = "dist/busybox.wasm";
const BUSYBOX_EXPORT_FILE_NAME = "busybox.wasm";
const SHIM_PACKAGE_FILE_NAME = "src/shim.mjs";
const SHIM_EXPORT_FILE_NAME = "wasi-sh-shim.js";
const FS_PACKAGE_FILE_NAME = "src/fs.mjs";
const FS_EXPORT_FILE_NAME = "wasi-sh-fs.js";
const SHIM_FS_SPECIFIERS: ReadonlyArray<[string, string]> = [
    ['"./fs.mjs"', '"./wasi-sh-fs.js"'],
    ["'./fs.mjs'", "'./wasi-sh-fs.js'"],
];
class BusyboxWasiRuntimeAssembler implements RuntimeAssetAssemblerContract {
    private readonly fileSystemOperations: FileSystemOperations;
    private readonly toolchainDirectory: string;
    constructor(
        fileSystemOperations: FileSystemOperations,
        toolchainDirectory: string = "./.tools/wasi-sh",
    ) {
        this.fileSystemOperations = fileSystemOperations;
        this.toolchainDirectory = toolchainDirectory;
    }
    async assembleRuntimeInto(context: BuildContextRecord): Promise<void> {
        const runtimeDirectory = `${context.runtimeDirectory}/${BUSYBOX_RUNTIME_DIRECTORY_NAME}`;
        const busyboxSourcePath = `${this.toolchainDirectory}/${BUSYBOX_PACKAGE_FILE_NAME}`;
        const shimSourcePath = `${this.toolchainDirectory}/${SHIM_PACKAGE_FILE_NAME}`;
        const fsSourcePath = `${this.toolchainDirectory}/${FS_PACKAGE_FILE_NAME}`;
        if (!(await this.fileSystemOperations.pathExists(busyboxSourcePath))) {
            throw new Error(
                `Busybox shell runtime file ${BUSYBOX_PACKAGE_FILE_NAME} is missing. Run pnpm run setup.`,
            );
        }
        if (!(await this.fileSystemOperations.pathExists(shimSourcePath))) {
            throw new Error(
                `Busybox shell runtime file ${SHIM_PACKAGE_FILE_NAME} is missing. Run pnpm run setup.`,
            );
        }
        if (!(await this.fileSystemOperations.pathExists(fsSourcePath))) {
            throw new Error(
                `Busybox shell runtime file ${FS_PACKAGE_FILE_NAME} is missing. Run pnpm run setup.`,
            );
        }
        await this.fileSystemOperations.copyFileInto(
            busyboxSourcePath,
            `${runtimeDirectory}/${BUSYBOX_EXPORT_FILE_NAME}`,
        );
        await this.fileSystemOperations.writeTextFile(
            `${runtimeDirectory}/${SHIM_EXPORT_FILE_NAME}`,
            await this.buildHostSafeShimModule(shimSourcePath),
        );
        await this.fileSystemOperations.copyFileInto(
            fsSourcePath,
            `${runtimeDirectory}/${FS_EXPORT_FILE_NAME}`,
        );
    }
    private async buildHostSafeShimModule(shimSourcePath: string): Promise<string> {
        const sourceText = await this.fileSystemOperations.readTextFile(shimSourcePath);
        let patchedText = sourceText;
        for (const [originalSpecifier, hostSafeSpecifier] of SHIM_FS_SPECIFIERS) {
            patchedText = patchedText.split(originalSpecifier).join(hostSafeSpecifier);
        }
        if (patchedText === sourceText) {
            throw new Error(
                `${SHIM_PACKAGE_FILE_NAME} no longer imports ./fs.mjs. Reinstall wasi-sh and recheck the runtime patch.`,
            );
        }
        return patchedText;
    }
}
export { BusyboxWasiRuntimeAssembler };
