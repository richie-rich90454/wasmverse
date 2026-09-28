import type { BuildContextRecord } from "@sharedKernel/BuildContextRecord.ts";
import type { RuntimeAssetAssemblerContract } from "@serverAtelier/runtimeAssemblers/RuntimeAssetAssemblerContract.ts";
import { FileSystemOperations } from "@serverAtelier/utilities/FileSystemOperations.ts";
const PYTHON_LOADER_FILE_NAME = "python-runtime.js";
const PYTHON_ASM_FILE_NAME = "python-asm.js";
const REQUIRED_RUNTIME_FILES: ReadonlyArray<[string, string]> = [
    ["pyodide.mjs", PYTHON_LOADER_FILE_NAME],
    ["pyodide.asm.mjs", PYTHON_ASM_FILE_NAME],
    ["pyodide.asm.wasm", "pyodide.asm.wasm"],
    ["python_stdlib.zip", "python_stdlib.zip"],
    ["pyodide-lock.json", "pyodide-lock.json"],
];
const STREAMING_INSTANTIATION =
    "n?l=await WebAssembly.instantiateStreaming(n,s):l=await WebAssembly.instantiate(await t,s)";
const BUFFERED_INSTANTIATION =
    "l=await WebAssembly.instantiate(t??(await(await n).arrayBuffer()),s)";
const REMOTE_PACKAGE_HOST = "cdn.jsdelivr.net";
const REMOTE_PACKAGE_VERSION_TOKEN = "${U}";
const REMOTE_PACKAGE_BASE = `https://${REMOTE_PACKAGE_HOST}/pyodide/v${REMOTE_PACKAGE_VERSION_TOKEN}/full/`;
const REMOTE_HOST_MARKERS = ["cdn.jsdelivr.net"];
const STREAMING_MARKERS_BY_FILE: Record<string, ReadonlyArray<string>> = {
    "pyodide.mjs": ["instantiateStreaming"],
    "pyodide.asm.mjs": [],
};
const MODULE_EXTENSION_REWRITES: ReadonlyArray<[string, string]> = [
    ["pyodide.asm.mjs", PYTHON_ASM_FILE_NAME],
];
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
        for (const [packageFileName, exportFileName] of REQUIRED_RUNTIME_FILES) {
            const sourcePath = `${this.pyodidePackageDirectory}/${packageFileName}`;
            if (!(await this.fileSystemOperations.pathExists(sourcePath))) {
                throw new Error(
                    `Pyodide runtime file ${packageFileName} is missing. Run bun install.`,
                );
            }
            if (packageFileName.endsWith(".mjs")) {
                await this.fileSystemOperations.writeTextFile(
                    `${context.runtimeDirectory}/${exportFileName}`,
                    await this.buildHostSafeModule(packageFileName),
                );
                continue;
            }
            await this.fileSystemOperations.copyFileInto(
                sourcePath,
                `${context.runtimeDirectory}/${exportFileName}`,
            );
        }
    }
    private async buildHostSafeModule(packageFileName: string): Promise<string> {
        const sourceText = await this.fileSystemOperations.readTextFile(
            `${this.pyodidePackageDirectory}/${packageFileName}`,
        );
        let patchedText = sourceText
            .split(STREAMING_INSTANTIATION)
            .join(BUFFERED_INSTANTIATION)
            .split(REMOTE_PACKAGE_BASE)
            .join("./");
        for (const [originalSpecifier, hostSafeSpecifier] of MODULE_EXTENSION_REWRITES) {
            patchedText = patchedText.split(originalSpecifier).join(hostSafeSpecifier);
        }
        for (const forbiddenMarker of [
            ...REMOTE_HOST_MARKERS,
            ...(STREAMING_MARKERS_BY_FILE[packageFileName] ?? []),
        ]) {
            if (patchedText.includes(forbiddenMarker)) {
                throw new Error(
                    `${packageFileName} still contains ${forbiddenMarker}. Reinstall pyodide and recheck the runtime patch.`,
                );
            }
        }
        return patchedText;
    }
}
export { PyodideRuntimeAssembler };
