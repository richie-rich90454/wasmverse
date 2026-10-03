import type { BuildContextRecord } from "@sharedKernel/BuildContextRecord.ts";
import type { RuntimeAssetAssemblerContract } from "@serverAtelier/runtimeAssemblers/RuntimeAssetAssemblerContract.ts";
import { FileSystemOperations } from "@serverAtelier/utilities/FileSystemOperations.ts";
class DartWasmGlueRuntimeAssembler implements RuntimeAssetAssemblerContract {
    private readonly fileSystemOperations: FileSystemOperations;
    constructor(fileSystemOperations: FileSystemOperations) {
        this.fileSystemOperations = fileSystemOperations;
    }
    async assembleRuntimeInto(context: BuildContextRecord): Promise<void> {
        await this.fileSystemOperations.ensureDirectoryExists(context.runtimeDirectory);
        await this.fileSystemOperations.writeTextFile(
            `${context.runtimeDirectory}/dart-loader.js`,
            [
                'import { compile } from "./app.wasm.js";',
                "export async function loadDartApp(baseUrl){",
                "  const response = await fetch(`${baseUrl}/app.wasm`);",
                "  if (!response.ok) {",
                "    throw new Error(`app.wasm request failed with status ${response.status}`);",
                "  }",
                "  const compiled = await compile(await response.arrayBuffer());",
                "  return compiled.instantiate();",
                "}\n",
            ].join("\n"),
        );
    }
}
export { DartWasmGlueRuntimeAssembler };
