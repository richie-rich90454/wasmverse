import {
    directoryOf,
    joinRelativePath,
} from "@clientTheatre/runtimePerformers/UserFilePathResolver.ts";
type SpecifierReplacer = (specifier: string) => string;
const MODULE_SPECIFIER_PATTERNS: ReadonlyArray<RegExp> = [
    /(import\s+\*\s+as\s+[\w$]+\s+from\s+)"([^"]+)"/g,
    /(import\s+\*\s+as\s+[\w$]+\s+from\s+)'([^']+)'/g,
    /(\bimport\s*\()"([^"]+)"/g,
    /(\bimport\s*\()'([^']+)'/g,
];
class CherryModuleLinker {
    private readonly moduleSources: ReadonlyMap<string, string>;
    private readonly entryRelativePath: string;
    private readonly coreBaseUrl: string;
    constructor(
        moduleSources: ReadonlyMap<string, string>,
        entryRelativePath: string,
        coreBaseUrl: string,
    ) {
        this.moduleSources = moduleSources;
        this.entryRelativePath = entryRelativePath;
        this.coreBaseUrl = coreBaseUrl;
    }
    resolveLocalModule(specifier: string, requiringRelativePath: string): string {
        const requiringDirectory = directoryOf(requiringRelativePath);
        const candidateBaseNames = [specifier, specifier.replace(/\./g, "/")];
        const candidateDirectories =
            requiringDirectory.length > 0 ? [requiringDirectory, ""] : [""];
        for (const baseName of candidateBaseNames) {
            for (const candidateDirectory of candidateDirectories) {
                const candidatePath = `${joinRelativePath(candidateDirectory, baseName)}.cljs`;
                if (this.moduleSources.has(candidatePath)) {
                    return candidatePath;
                }
            }
        }
        throw new Error(`Cannot resolve ClojureScript namespace '${specifier}'.`);
    }
    rewriteModule(relativePath: string, replacer: SpecifierReplacer): string {
        const sourceText = this.moduleSources.get(relativePath);
        if (sourceText === undefined) {
            throw new Error(`Cannot find ClojureScript module ${relativePath}.`);
        }
        let rewrittenText = sourceText;
        for (const specifierPattern of MODULE_SPECIFIER_PATTERNS) {
            rewrittenText = rewrittenText.replace(
                specifierPattern,
                (_match, prefix: string, specifier: string) =>
                    `${prefix}${JSON.stringify(replacer(specifier))}`,
            );
        }
        return rewrittenText;
    }
    runtimeSpecifierFor(specifier: string): string {
        return `${this.coreBaseUrl}/${specifier.slice("cherry-cljs/".length)}`;
    }
    isRuntimeSpecifier(specifier: string): boolean {
        return specifier.startsWith("cherry-cljs/");
    }
    isLocalSpecifier(specifier: string): boolean {
        return (
            !specifier.startsWith("/") &&
            !specifier.startsWith("./") &&
            !specifier.startsWith("../") &&
            !specifier.includes(":")
        );
    }
    get entryPath(): string {
        return this.entryRelativePath;
    }
}
export { CherryModuleLinker };
