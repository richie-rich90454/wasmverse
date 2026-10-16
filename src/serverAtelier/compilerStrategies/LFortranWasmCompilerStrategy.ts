import type { BuildContextRecord } from "@sharedKernel/BuildContextRecord.ts";
import type { CompilerStrategyContract } from "@serverAtelier/compilerStrategies/CompilerStrategyContract.ts";
import { FileSystemOperations } from "@serverAtelier/utilities/FileSystemOperations.ts";
import { ProcessRunner } from "@serverAtelier/utilities/ProcessRunner.ts";
const LFORTRAN_COMPILER_CANDIDATE_PATHS: ReadonlyArray<string> = [
    "./.tools/lfortran/bin/lfortran.exe",
    "./.tools/lfortran/bin/lfortran",
];
const LFORTRAN_WASM_FILE_NAME = "app.wasm";
const WASM_GLOBAL_SECTION_ID = 6;
const WASM_TAG_SECTION_ID = 13;
interface LebReading {
    value: number;
    nextOffset: number;
}
function readUnsignedLeb(wasmBytes: Uint8Array, offset: number): LebReading | undefined {
    let value = 0;
    let shift = 0;
    let position = offset;
    while (position < wasmBytes.length && shift <= 35) {
        const byte = wasmBytes[position] as number;
        position += 1;
        value += (byte & 0x7f) * 2 ** shift;
        if ((byte & 0x80) === 0) {
            return { value, nextOffset: position };
        }
        shift += 7;
    }
    return undefined;
}
function hasTagSectionAfterGlobalSection(wasmBytes: Uint8Array): boolean {
    if (
        wasmBytes.length < 8 ||
        wasmBytes[0] !== 0x00 ||
        wasmBytes[1] !== 0x61 ||
        wasmBytes[2] !== 0x73 ||
        wasmBytes[3] !== 0x6d
    ) {
        return false;
    }
    let offset = 8;
    let sawGlobalSection = false;
    while (offset < wasmBytes.length) {
        const sectionId = wasmBytes[offset] as number;
        if (sectionId > WASM_TAG_SECTION_ID) {
            return false;
        }
        const sectionSize = readUnsignedLeb(wasmBytes, offset + 1);
        if (!sectionSize) {
            return false;
        }
        if (sectionId === WASM_GLOBAL_SECTION_ID) {
            sawGlobalSection = true;
        }
        if (sectionId === WASM_TAG_SECTION_ID) {
            return sawGlobalSection;
        }
        offset = sectionSize.nextOffset + sectionSize.value;
    }
    return false;
}
class LFortranWasmCompilerStrategy implements CompilerStrategyContract {
    private readonly processRunner: ProcessRunner;
    private readonly fileSystemOperations: FileSystemOperations;
    private readonly lfortranCompilerPath: string | undefined;
    constructor(
        processRunner: ProcessRunner,
        fileSystemOperations: FileSystemOperations,
        lfortranCompilerPath?: string,
    ) {
        this.processRunner = processRunner;
        this.fileSystemOperations = fileSystemOperations;
        this.lfortranCompilerPath = lfortranCompilerPath;
    }
    async compileSourceInto(context: BuildContextRecord): Promise<void> {
        const compilerPath = await this.resolveCompilerPath();
        const sourceFilePaths = await this.collectFortranSources(context);
        const outcome = await this.processRunner.runToCompletion(
            [
                compilerPath,
                ...sourceFilePaths,
                "--backend=wasm",
                "-o",
                `${context.runtimeDirectory}/${LFORTRAN_WASM_FILE_NAME}`,
            ],
            { workingDirectory: context.sourceDirectory },
        );
        if (outcome.exitCode !== 0) {
            const failureLines = outcome.standardError
                .split("\n")
                .map((line) => line.trim())
                .filter((line) => line.length > 0);
            const failureLine = failureLines[0] ?? "unknown LFortran failure";
            throw new Error(
                `LFortran wasm build failed: ${failureLine}. The prebuilt LFortran custom wasm backend does not implement DO loops, stdin, command arguments, or file access, so this pipeline cannot run the showcase or the feature probes. Run pnpm run setup when an LFortran release with full wasm backend coverage is available.`,
            );
        }
        const wasmBytes = await this.fileSystemOperations.readBinaryFile(
            `${context.runtimeDirectory}/${LFORTRAN_WASM_FILE_NAME}`,
        );
        if (hasTagSectionAfterGlobalSection(wasmBytes)) {
            throw new Error(
                "LFortran emitted a wasm module that browsers reject: its Tag section appears after the Global section, and V8 requires the Tag section first. No released LFortran build (0.64 through 0.67, the only prebuilt Windows binaries) emits a browser runnable module from --backend=wasm. Run pnpm run setup when an LFortran release with the section ordering fix is available.",
            );
        }
    }
    private async collectFortranSources(context: BuildContextRecord): Promise<Array<string>> {
        const sourceDirectoryFiles = await this.fileSystemOperations.listFilesRecursively(
            context.sourceDirectory,
        );
        const companionSources = sourceDirectoryFiles
            .filter(
                (relativePath) =>
                    relativePath.endsWith(".f90") && relativePath !== context.entryFileRelativePath,
            )
            .sort();
        return [...companionSources, context.entryFileRelativePath];
    }
    private async resolveCompilerPath(): Promise<string> {
        if (this.lfortranCompilerPath) {
            if (await this.fileSystemOperations.pathExists(this.lfortranCompilerPath)) {
                return this.lfortranCompilerPath;
            }
            throw new Error(
                "LFortran toolchain not found. Run pnpm run setup to provision ./.tools/lfortran/.",
            );
        }
        for (const candidatePath of LFORTRAN_COMPILER_CANDIDATE_PATHS) {
            if (await this.fileSystemOperations.pathExists(candidatePath)) {
                return candidatePath;
            }
        }
        throw new Error(
            "LFortran toolchain not found. Run pnpm run setup to provision ./.tools/lfortran/.",
        );
    }
}
export { LFortranWasmCompilerStrategy, hasTagSectionAfterGlobalSection };
