import type { BuildContextRecord } from "@sharedKernel/BuildContextRecord.ts";
import type { RuntimeAssetAssemblerContract } from "@serverAtelier/runtimeAssemblers/RuntimeAssetAssemblerContract.ts";
import { FileSystemOperations } from "@serverAtelier/utilities/FileSystemOperations.ts";
class TeaVmGlueRuntimeAssembler implements RuntimeAssetAssemblerContract {
    private readonly fileSystemOperations: FileSystemOperations;
    constructor(fileSystemOperations: FileSystemOperations) {
        this.fileSystemOperations = fileSystemOperations;
    }
    async assembleRuntimeInto(context: BuildContextRecord): Promise<void> {
        await this.fileSystemOperations.ensureDirectoryExists(context.runtimeDirectory);
        await this.fileSystemOperations.writeTextFile(
            `${context.runtimeDirectory}/teavm-loader.js`,
            "export async function loadTeaVmModule(baseUrl, writeLine, writeText, attemptIdentifier, readLine){ globalThis.$rt_putStdoutCustom = typeof writeText === \"function\" ? (rawText) => { writeText(String(rawText)); } : (rawText) => { const lines = String(rawText).split('\\n'); if (lines[lines.length - 1] === '') { lines.pop(); } for (const line of lines) { writeLine(line); } }; globalThis.$rt_putStderrCustom = globalThis.$rt_putStdoutCustom; if (typeof readLine === \"function\") { const textEncoder = new TextEncoder(); let pendingBytes = []; globalThis.$wasmverseReadByte = () => { if (pendingBytes.length === 0) { pendingBytes = Array.from(textEncoder.encode(String(readLine()) + \"\\n\")); } return pendingBytes.shift(); }; } else { delete globalThis.$wasmverseReadByte; } const cacheSuffix = attemptIdentifier === undefined ? '' : `?attempt=${attemptIdentifier}`; return await import(`${baseUrl}/classes.js${cacheSuffix}`); }\n",
        );
    }
}
export { TeaVmGlueRuntimeAssembler };
