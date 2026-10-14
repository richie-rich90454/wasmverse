import type { BuildContextRecord } from "@sharedKernel/BuildContextRecord.ts";
import type { RuntimeAssetAssemblerContract } from "@serverAtelier/runtimeAssemblers/RuntimeAssetAssemblerContract.ts";
import { FileSystemOperations } from "@serverAtelier/utilities/FileSystemOperations.ts";
const SCHEME_RUNTIME_DIRECTORY_NAME = "scheme";
const BIWASCHEME_PACKAGE_FILE_NAME = "release/biwascheme.mjs";
const BIWASCHEME_EXPORT_FILE_NAME = "biwascheme.js";
class BiwaschemeRuntimeAssembler implements RuntimeAssetAssemblerContract {
    private readonly fileSystemOperations: FileSystemOperations;
    private readonly biwaschemePackageDirectory: string;
    constructor(
        fileSystemOperations: FileSystemOperations,
        biwaschemePackageDirectory: string = "./node_modules/biwascheme",
    ) {
        this.fileSystemOperations = fileSystemOperations;
        this.biwaschemePackageDirectory = biwaschemePackageDirectory;
    }
    async assembleRuntimeInto(context: BuildContextRecord): Promise<void> {
        const sourcePath = `${this.biwaschemePackageDirectory}/${BIWASCHEME_PACKAGE_FILE_NAME}`;
        if (!(await this.fileSystemOperations.pathExists(sourcePath))) {
            throw new Error(
                `BiwaScheme runtime file ${BIWASCHEME_PACKAGE_FILE_NAME} is missing. Run pnpm install.`,
            );
        }
        await this.fileSystemOperations.copyFileInto(
            sourcePath,
            `${context.runtimeDirectory}/${SCHEME_RUNTIME_DIRECTORY_NAME}/${BIWASCHEME_EXPORT_FILE_NAME}`,
        );
    }
}
export { BiwaschemeRuntimeAssembler };
