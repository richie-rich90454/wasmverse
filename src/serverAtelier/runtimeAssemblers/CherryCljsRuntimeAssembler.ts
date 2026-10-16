import type { BuildContextRecord } from "@sharedKernel/BuildContextRecord.ts";
import type { RuntimeAssetAssemblerContract } from "@serverAtelier/runtimeAssemblers/RuntimeAssetAssemblerContract.ts";
import { FileSystemOperations } from "@serverAtelier/utilities/FileSystemOperations.ts";
const CLOJURESCRIPT_RUNTIME_DIRECTORY_NAME = "clojurescript";
const CHERRY_ENTRY_PACKAGE_FILE_NAME = "lib/compiler.js";
const CHERRY_COPIED_PACKAGE_FILE_NAMES: ReadonlyArray<string> = [
    "cljs.core.js",
    "lib/cljs.core.js",
    "lib/clojure.string.js",
    "lib/clojure.walk.js",
    "lib/clojure.set.js",
    "lib/clojure.test.js",
    "lib/cljs.pprint.js",
];
class CherryCljsRuntimeAssembler implements RuntimeAssetAssemblerContract {
    private readonly fileSystemOperations: FileSystemOperations;
    private readonly cherryPackageDirectory: string;
    constructor(
        fileSystemOperations: FileSystemOperations,
        cherryPackageDirectory: string = "./node_modules/cherry-cljs",
    ) {
        this.fileSystemOperations = fileSystemOperations;
        this.cherryPackageDirectory = cherryPackageDirectory;
    }
    async assembleRuntimeInto(context: BuildContextRecord): Promise<void> {
        const runtimeDirectory = `${context.runtimeDirectory}/${CLOJURESCRIPT_RUNTIME_DIRECTORY_NAME}`;
        for (const packageFileName of [
            CHERRY_ENTRY_PACKAGE_FILE_NAME,
            ...CHERRY_COPIED_PACKAGE_FILE_NAMES,
        ]) {
            const sourcePath = `${this.cherryPackageDirectory}/${packageFileName}`;
            if (!(await this.fileSystemOperations.pathExists(sourcePath))) {
                throw new Error(
                    `Cherry runtime file ${packageFileName} is missing. Run pnpm install.`,
                );
            }
            await this.fileSystemOperations.copyFileInto(
                sourcePath,
                `${runtimeDirectory}/${packageFileName}`,
            );
        }
    }
}
export { CherryCljsRuntimeAssembler };
