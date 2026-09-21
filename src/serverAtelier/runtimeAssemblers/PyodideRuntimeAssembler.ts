import type { BuildContextRecord } from "@sharedKernel/BuildContextRecord.ts";
import type { RuntimeAssetAssemblerContract } from "@serverAtelier/runtimeAssemblers/RuntimeAssetAssemblerContract.ts";
import { FileSystemOperations } from "@serverAtelier/utilities/FileSystemOperations.ts";
class PyodideRuntimeAssembler implements RuntimeAssetAssemblerContract {
    private readonly fileSystemOperations: FileSystemOperations;
    private readonly pyodidePackageDirectory: string;
    constructor(
        fileSystemOperations: FileSystemOperations,
        pyodidePackageDirectory: string = "./node_modules/pyodide",
    ) {
        this.fileSystemOperations = fileSystemOperations;
        this.pyodidePackageDirectory = pyodidePackageDirectory;
    }
    async assembleRuntimeInto(context: BuildContextRecord): Promise<void> {
        await this.fileSystemOperations.ensureDirectoryExists(context.runtimeDirectory);
        const packageFiles = await this.fileSystemOperations.listFilesRecursively(
            this.pyodidePackageDirectory,
        );
        for (const packageFile of packageFiles) {
            if (packageFile.endsWith(".ts") || packageFile.endsWith(".map")) {
                continue;
            }
            await this.fileSystemOperations.copyFileInto(
                `${this.pyodidePackageDirectory}/${packageFile}`,
                `${context.runtimeDirectory}/${packageFile}`,
            );
        }
    }
}
export { PyodideRuntimeAssembler };
