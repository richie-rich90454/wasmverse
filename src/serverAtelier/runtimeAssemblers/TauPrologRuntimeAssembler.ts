import type { BuildContextRecord } from "@sharedKernel/BuildContextRecord.ts";
import type { RuntimeAssetAssemblerContract } from "@serverAtelier/runtimeAssemblers/RuntimeAssetAssemblerContract.ts";
import { FileSystemOperations } from "@serverAtelier/utilities/FileSystemOperations.ts";
const PROLOG_RUNTIME_DIRECTORY_NAME = "prolog";
const TAU_PROLOG_COPIED_PACKAGE_FILE_NAMES: ReadonlyArray<string> = [
    "modules/core.js",
    "modules/lists.js",
];
class TauPrologRuntimeAssembler implements RuntimeAssetAssemblerContract {
    private readonly fileSystemOperations: FileSystemOperations;
    private readonly tauPrologPackageDirectory: string;
    constructor(
        fileSystemOperations: FileSystemOperations,
        tauPrologPackageDirectory: string = "./node_modules/tau-prolog",
    ) {
        this.fileSystemOperations = fileSystemOperations;
        this.tauPrologPackageDirectory = tauPrologPackageDirectory;
    }
    async assembleRuntimeInto(context: BuildContextRecord): Promise<void> {
        const runtimeDirectory = `${context.runtimeDirectory}/${PROLOG_RUNTIME_DIRECTORY_NAME}`;
        for (const packageFileName of TAU_PROLOG_COPIED_PACKAGE_FILE_NAMES) {
            const sourcePath = `${this.tauPrologPackageDirectory}/${packageFileName}`;
            if (!(await this.fileSystemOperations.pathExists(sourcePath))) {
                throw new Error(
                    `tau-prolog runtime file ${packageFileName} is missing. Run pnpm install.`,
                );
            }
            await this.fileSystemOperations.copyFileInto(
                sourcePath,
                `${runtimeDirectory}/${packageFileName}`,
            );
        }
    }
}
export { TauPrologRuntimeAssembler };
