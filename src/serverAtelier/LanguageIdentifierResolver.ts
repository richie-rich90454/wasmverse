import type { LanguageIdentifier } from "@sharedKernel/LanguageIdentifier.ts";
class LanguageIdentifierResolver {
    private readonly extensionToIdentifier: Map<string, LanguageIdentifier>;
    constructor() {
        this.extensionToIdentifier = new Map<string, LanguageIdentifier>([
            [".py", "python"],
            [".rb", "ruby"],
            [".lua", "lua"],
            [".php", "php"],
            [".rs", "rust"],
            [".c", "c"],
            [".h", "c"],
            [".cpp", "cpp"],
            [".cc", "cpp"],
            [".hpp", "cpp"],
            [".go", "go"],
            [".zig", "zig"],
            [".swift", "swift"],
            [".kt", "kotlin"],
            [".kts", "kotlin"],
            [".dart", "dart"],
            [".java", "java"],
            [".cs", "csharp"],
            [".as", "assemblyscript"],
            [".ml", "ocaml"],
            [".mli", "ocaml"],
            [".hs", "haskell"],
            [".js", "javascript"],
            [".mjs", "javascript"],
            [".ts", "typescript"],
            [".mts", "typescript"],
            [".sql", "sql"],
        ]);
    }
    resolveFromFileName(fileName: string): LanguageIdentifier {
        const lowercasedName = fileName.toLowerCase();
        for (const [extension, identifier] of this.extensionToIdentifier) {
            if (lowercasedName.endsWith(extension)) {
                return identifier;
            }
        }
        throw new Error(
            `Cannot determine language for entry file ${fileName}. Supported extensions: ${[...this.extensionToIdentifier.keys()].join(", ")}.`,
        );
    }
}
export { LanguageIdentifierResolver };
