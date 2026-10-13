import { resolve } from "node:path";
import type { BuildContextRecord } from "@sharedKernel/BuildContextRecord.ts";
import type { CompilerStrategyContract } from "@serverAtelier/compilerStrategies/CompilerStrategyContract.ts";
import { FileSystemOperations } from "@serverAtelier/utilities/FileSystemOperations.ts";
import { ProcessRunner } from "@serverAtelier/utilities/ProcessRunner.ts";
const ASSEMBLYSCRIPT_COMPILER_RELATIVE_PATH = "node_modules/assemblyscript/bin/asc.js";
const ASSEMBLYSCRIPT_LOADER_TEXT =
    "let instance = null;\n" +
    "function forwardedWrite(pointer, length){ const text = new TextDecoder().decode(new Uint8Array(instance.exports.memory.buffer, pointer, length)); const hook = globalThis.__wasmverseWriteLine; if (typeof hook === 'function'){ hook(text); } }\n" +
    "function forwardedRead(pointer, maxLength){ const readLine = globalThis.__wasmverseReadLine; if (typeof readLine !== 'function'){ throw new Error('Terminal input is unavailable.'); } const bytes = new TextEncoder().encode(readLine()); const length = Math.min(bytes.length, maxLength); new Uint8Array(instance.exports.memory.buffer, pointer, length).set(bytes.subarray(0, length)); return length; }\n" +
    "export default async function(){ const response = await fetch(new URL('./app.wasm', import.meta.url)); const bytes = await response.arrayBuffer(); const result = await WebAssembly.instantiate(bytes, { env: { abort(){ throw new Error('AssemblyScript abort'); }, write: forwardedWrite, read: forwardedRead } }); instance = result.instance; }\n" +
    "export function main(){ instance.exports.main(); }\n" +
    "export function run(){ instance.exports.main(); }\n";
class AssemblyScriptCompilerStrategy implements CompilerStrategyContract {
    private readonly processRunner: ProcessRunner;
    private readonly fileSystemOperations: FileSystemOperations;
    constructor(processRunner: ProcessRunner) {
        this.processRunner = processRunner;
        this.fileSystemOperations = new FileSystemOperations();
    }
    async compileSourceInto(context: BuildContextRecord): Promise<void> {
        const outcome = await this.processRunner.runToCompletion(
            [
                process.execPath,
                resolve(process.cwd(), ASSEMBLYSCRIPT_COMPILER_RELATIVE_PATH),
                context.entryFileRelativePath,
                "--outFile",
                `${context.runtimeDirectory}/app.wasm`,
                "--optimize",
            ],
            { workingDirectory: context.sourceDirectory },
        );
        if (outcome.exitCode !== 0) {
            const detail =
                outcome.standardError.trim().length > 0
                    ? outcome.standardError
                    : outcome.standardOutput;
            throw new Error(`AssemblyScript compilation failed: ${detail}`);
        }
        await this.fileSystemOperations.writeTextFile(
            `${context.runtimeDirectory}/app.js`,
            ASSEMBLYSCRIPT_LOADER_TEXT,
        );
    }
}
export { AssemblyScriptCompilerStrategy };
