import type { BuildContextRecord } from "@sharedKernel/BuildContextRecord.ts";
import type { RuntimeAssetAssemblerContract } from "@serverAtelier/runtimeAssemblers/RuntimeAssetAssemblerContract.ts";
import { FileSystemOperations } from "@serverAtelier/utilities/FileSystemOperations.ts";
const WEBPERL_RUNTIME_DIRECTORY_NAME = "webperl";
const WEBPERL_LOADER_PACKAGE_FILE_NAME = "perl-runtime.js";
const WEBPERL_WASM_PACKAGE_FILE_NAME = "zeroperl.wasm";
const STDIN_FORWARDING_NEEDLE = "L({withFileSystem:r,withStdIo:{stdout:";
const STDIN_FORWARDING_REPLACEMENT =
    "L({withFileSystem:r,withStdIo:{stdin:(u)=>A.stdin?.(u),stdout:";
class ZeroPerlRuntimeAssembler implements RuntimeAssetAssemblerContract {
    private readonly fileSystemOperations: FileSystemOperations;
    private readonly webPerlDirectory: string;
    constructor(
        fileSystemOperations: FileSystemOperations,
        webPerlDirectory: string = "./.tools/webperl",
    ) {
        this.fileSystemOperations = fileSystemOperations;
        this.webPerlDirectory = webPerlDirectory;
    }
    async assembleRuntimeInto(context: BuildContextRecord): Promise<void> {
        const runtimeDirectory = `${context.runtimeDirectory}/${WEBPERL_RUNTIME_DIRECTORY_NAME}`;
        const loaderSourcePath = `${this.webPerlDirectory}/${WEBPERL_LOADER_PACKAGE_FILE_NAME}`;
        const wasmSourcePath = `${this.webPerlDirectory}/${WEBPERL_WASM_PACKAGE_FILE_NAME}`;
        if (!(await this.fileSystemOperations.pathExists(loaderSourcePath))) {
            throw new Error(
                `WebPerl runtime file ${WEBPERL_LOADER_PACKAGE_FILE_NAME} is missing. Run pnpm run setup to provision ./.tools/webperl/.`,
            );
        }
        if (!(await this.fileSystemOperations.pathExists(wasmSourcePath))) {
            throw new Error(
                `WebPerl runtime file ${WEBPERL_WASM_PACKAGE_FILE_NAME} is missing. Run pnpm run setup to provision ./.tools/webperl/.`,
            );
        }
        await this.fileSystemOperations.writeTextFile(
            `${runtimeDirectory}/${WEBPERL_LOADER_PACKAGE_FILE_NAME}`,
            await this.buildStdinForwardingLoaderModule(loaderSourcePath),
        );
        await this.fileSystemOperations.copyFileInto(
            wasmSourcePath,
            `${runtimeDirectory}/${WEBPERL_WASM_PACKAGE_FILE_NAME}`,
        );
    }
    private async buildStdinForwardingLoaderModule(loaderSourcePath: string): Promise<string> {
        const sourceText = await this.fileSystemOperations.readTextFile(loaderSourcePath);
        const patchedText = sourceText
            .split(STDIN_FORWARDING_NEEDLE)
            .join(STDIN_FORWARDING_REPLACEMENT);
        if (patchedText === sourceText) {
            throw new Error(
                `${WEBPERL_LOADER_PACKAGE_FILE_NAME} does not forward its stdin option. Re-download the zeroperl runtime and recheck the runtime patch.`,
            );
        }
        return patchedText;
    }
}
export { ZeroPerlRuntimeAssembler };
