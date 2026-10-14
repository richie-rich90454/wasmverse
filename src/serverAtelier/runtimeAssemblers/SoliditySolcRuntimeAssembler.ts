import type { BuildContextRecord } from "@sharedKernel/BuildContextRecord.ts";
import type { RuntimeAssetAssemblerContract } from "@serverAtelier/runtimeAssemblers/RuntimeAssetAssemblerContract.ts";
import { FileSystemOperations } from "@serverAtelier/utilities/FileSystemOperations.ts";
const SOLIDITY_RUNTIME_DIRECTORY_NAME = "solidity";
const SOLC_BUNDLE_FILE_NAME = "soljson.js";
class SoliditySolcRuntimeAssembler implements RuntimeAssetAssemblerContract {
    private readonly fileSystemOperations: FileSystemOperations;
    private readonly solcPackageDirectory: string;
    constructor(
        fileSystemOperations: FileSystemOperations,
        solcPackageDirectory: string = "./node_modules/solc",
    ) {
        this.fileSystemOperations = fileSystemOperations;
        this.solcPackageDirectory = solcPackageDirectory;
    }
    async assembleRuntimeInto(context: BuildContextRecord): Promise<void> {
        const runtimeDirectory = `${context.runtimeDirectory}/${SOLIDITY_RUNTIME_DIRECTORY_NAME}`;
        const sourcePath = `${this.solcPackageDirectory}/${SOLC_BUNDLE_FILE_NAME}`;
        if (!(await this.fileSystemOperations.pathExists(sourcePath))) {
            throw new Error(
                `Solc runtime file ${SOLC_BUNDLE_FILE_NAME} is missing. Run pnpm install.`,
            );
        }
        await this.fileSystemOperations.copyFileInto(
            sourcePath,
            `${runtimeDirectory}/${SOLC_BUNDLE_FILE_NAME}`,
        );
    }
}
export { SoliditySolcRuntimeAssembler };
