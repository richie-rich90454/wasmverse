import type { BuildContextRecord } from "@sharedKernel/BuildContextRecord.ts";
import type { RuntimeAssetAssemblerContract } from "@serverAtelier/runtimeAssemblers/RuntimeAssetAssemblerContract.ts";
import { FileSystemOperations } from "@serverAtelier/utilities/FileSystemOperations.ts";
const HOST_SAFE_MODULE_EXTENSION = ".js";
const RELATIVE_IMPORT_PATTERN =
    /(?:^|[\s;(){}])(?:import|export)\b[^'"]*?from\s*['"](\.[^'"]+)['"]|import\s*\(\s*['"](\.[^'"]+)['"]\s*\)/g;
const BARE_IMPORT_PATTERN = /(?:^|[\s;(){}])import\s*['"]([^'".][^'"]*)['"]/g;
const WASM_FILE_NAME_PATTERN = /[0-9a-f]{40}\.wasm/;
class PhpWasmModuleGraphResolver {
    private readonly fileSystemOperations: FileSystemOperations;
    private readonly phpPackageDirectory: string;
    constructor(fileSystemOperations: FileSystemOperations, phpPackageDirectory: string) {
        this.fileSystemOperations = fileSystemOperations;
        this.phpPackageDirectory = phpPackageDirectory;
    }
    async collectModuleClosure(entryModuleName: string): Promise<Array<string>> {
        const visited = new Set<string>();
        const pending = [entryModuleName];
        while (pending.length > 0) {
            const moduleName = pending.pop() as string;
            if (visited.has(moduleName)) {
                continue;
            }
            visited.add(moduleName);
            const sourcePath = `${this.phpPackageDirectory}/${moduleName}`;
            if (!(await this.fileSystemOperations.pathExists(sourcePath))) {
                throw new Error(`PHP runtime module ${moduleName} is missing from php-wasm.`);
            }
            const sourceText = await this.fileSystemOperations.readTextFile(sourcePath);
            for (const specifier of PhpWasmModuleGraphResolver.extractRelativeSpecifiers(
                sourceText,
            )) {
                pending.push(specifier.slice(specifier.lastIndexOf("/") + 1));
            }
        }
        return [...visited].sort();
    }
    async findWasmFileName(versionModuleName: string): Promise<string> {
        const sourceText = await this.fileSystemOperations.readTextFile(
            `${this.phpPackageDirectory}/${versionModuleName}`,
        );
        const wasmFileName = sourceText.match(WASM_FILE_NAME_PATTERN)?.[0];
        if (!wasmFileName) {
            throw new Error(
                `PHP runtime module ${versionModuleName} does not name its WebAssembly binary.`,
            );
        }
        if (
            !(await this.fileSystemOperations.pathExists(
                `${this.phpPackageDirectory}/${wasmFileName}`,
            ))
        ) {
            throw new Error(`PHP runtime binary ${wasmFileName} is missing from php-wasm.`);
        }
        return wasmFileName;
    }
    private static extractRelativeSpecifiers(sourceText: string): Array<string> {
        const specifiers = new Set<string>();
        for (const match of sourceText.matchAll(RELATIVE_IMPORT_PATTERN)) {
            const specifier = match[1] ?? match[2];
            if (specifier) {
                specifiers.add(specifier);
            }
        }
        return [...specifiers];
    }
    static assertNoBareImports(moduleName: string, sourceText: string): void {
        const bareSpecifier = sourceText
            .match(BARE_IMPORT_PATTERN)?.[1]
            ?.replace(/^node:/, "")
            .split("/")[0];
        if (bareSpecifier) {
            throw new Error(
                `PHP runtime module ${moduleName} imports the bare specifier "${bareSpecifier}", which a static host cannot resolve.`,
            );
        }
    }
}
class PhpWasmRuntimeAssembler implements RuntimeAssetAssemblerContract {
    private readonly fileSystemOperations: FileSystemOperations;
    private readonly phpPackageDirectory: string;
    private readonly phpVersion: string;
    constructor(
        fileSystemOperations: FileSystemOperations,
        phpPackageDirectory: string = "./node_modules/php-wasm",
        phpVersion: string = "8.4",
    ) {
        this.fileSystemOperations = fileSystemOperations;
        this.phpPackageDirectory = phpPackageDirectory;
        this.phpVersion = phpVersion;
    }
    async assembleRuntimeInto(context: BuildContextRecord): Promise<void> {
        await this.fileSystemOperations.ensureDirectoryExists(context.runtimeDirectory);
        const versionModuleName = `php${this.phpVersion}-web.mjs`;
        const resolver = new PhpWasmModuleGraphResolver(
            this.fileSystemOperations,
            this.phpPackageDirectory,
        );
        const moduleNames = await resolver.collectModuleClosure("PhpWeb.mjs");
        moduleNames.push(versionModuleName);
        const wasmFileName = await resolver.findWasmFileName(versionModuleName);
        for (const moduleName of [...new Set(moduleNames)].sort()) {
            await this.publishHostSafeModule(context, moduleName);
        }
        await this.fileSystemOperations.copyFileInto(
            `${this.phpPackageDirectory}/${wasmFileName}`,
            `${context.runtimeDirectory}/php-wasm/${wasmFileName}`,
        );
    }
    private async publishHostSafeModule(
        context: BuildContextRecord,
        moduleName: string,
    ): Promise<void> {
        const sourcePath = `${this.phpPackageDirectory}/${moduleName}`;
        const sourceText = await this.fileSystemOperations.readTextFile(sourcePath);
        if (!moduleName.endsWith(".mjs")) {
            await this.fileSystemOperations.copyFileInto(
                sourcePath,
                `${context.runtimeDirectory}/php-wasm/${moduleName}`,
            );
            return;
        }
        PhpWasmModuleGraphResolver.assertNoBareImports(moduleName, sourceText);
        const hostSafeName = `${moduleName.slice(0, -".mjs".length)}${HOST_SAFE_MODULE_EXTENSION}`;
        await this.fileSystemOperations.writeTextFile(
            `${context.runtimeDirectory}/php-wasm/${hostSafeName}`,
            sourceText.split(".mjs").join(HOST_SAFE_MODULE_EXTENSION),
        );
    }
}
export { PhpWasmRuntimeAssembler };
