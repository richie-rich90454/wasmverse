import type { BuildContextRecord } from "@sharedKernel/BuildContextRecord.ts";
import type { RuntimeAssetAssemblerContract } from "@serverAtelier/runtimeAssemblers/RuntimeAssetAssemblerContract.ts";
import { FileSystemOperations } from "@serverAtelier/utilities/FileSystemOperations.ts";
const VERILOG_RUNTIME_DIRECTORY_NAME = "verilog";
const VERILOG_RUNTIME_FILE_NAMES: ReadonlyArray<string> = [
    "ivlpp.js",
    "ivlpp.wasm",
    "ivl.js",
    "ivl.wasm",
    "vvp.js",
    "vvp.wasm",
];
class VerilogWasmRuntimeAssembler implements RuntimeAssetAssemblerContract {
    private readonly fileSystemOperations: FileSystemOperations;
    private readonly toolchainDirectory: string;
    constructor(
        fileSystemOperations: FileSystemOperations,
        toolchainDirectory: string = "./.tools/verilog",
    ) {
        this.fileSystemOperations = fileSystemOperations;
        this.toolchainDirectory = toolchainDirectory;
    }
    async assembleRuntimeInto(context: BuildContextRecord): Promise<void> {
        const runtimeDirectory = `${context.runtimeDirectory}/${VERILOG_RUNTIME_DIRECTORY_NAME}`;
        for (const fileName of VERILOG_RUNTIME_FILE_NAMES) {
            const sourcePath = `${this.toolchainDirectory}/${fileName}`;
            if (!(await this.fileSystemOperations.pathExists(sourcePath))) {
                throw new Error(`Verilog runtime file ${fileName} is missing. Run pnpm run setup.`);
            }
            await this.fileSystemOperations.copyFileInto(
                sourcePath,
                `${runtimeDirectory}/${fileName}`,
            );
        }
    }
}
export { VerilogWasmRuntimeAssembler };
