import type { LanguageIdentifier } from "@sharedKernel/LanguageIdentifier.ts";
class LanguageIdentifierResolver {
    private readonly extensionToIdentifier: Map<string, LanguageIdentifier>;
    constructor() {
        this.extensionToIdentifier = new Map<string, LanguageIdentifier>([
            [".py", "python"],
            [".r", "r"],
            [".cljs", "clojurescript"],
            [".scm", "scheme"],
            [".pl", "prolog"],
            [".rb", "ruby"],
            [".pl", "perl"],
            [".pm", "perl"],
            [".pas", "pascal"],
            [".cob", "cobol"],
            [".f90", "fortran"],
            [".lua", "lua"],
            [".php", "php"],
            [".rs", "rust"],
            [".lisp", "commonlisp"],
            [".lsp", "commonlisp"],
            [".cl", "commonlisp"],
            [".tcl", "tcl"],
            [".fth", "forth"],
            [".forth", "forth"],
            [".st", "smalltalk"],
            [".c", "c"],
            [".h", "c"],
            [".bf", "brainfuck"],
            [".bef", "befunge"],
            [".lol", "lolcode"],
            [".apl", "apl"],
            [".dyalog", "apl"],
            [".cpp", "cpp"],
            [".cc", "cpp"],
            [".hpp", "cpp"],
            [".s", "riscv"],
            [".asm", "riscv"],
            [".riscv", "riscv"],
            [".v", "verilog"],
            [".sol", "solidity"],
            [".vim", "vimscript"],
            [".go", "go"],
            [".logo", "logo"],
            [".lgo", "logo"],
            [".bas", "gwbasic"],
            [".sml", "sml"],
            [".sig", "sml"],
            [".6502", "m6502"],
            [".a65", "m6502"],
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
            [".duckdb.sql", "duckdb"],
            [".pglite.sql", "pglite"],
            [".awk", "awk"],
            [".jq", "jq"],
            [".sh", "bash"],
            [".sql", "sql"],
            [".scala", "scala"],
            [".fs", "fsharp"],
            [".fsx", "fsharp"],
            [".elm", "elm"],
            [".res", "rescript"],
            [".resi", "rescript"],
            [".purs", "purescript"],
            [".gleam", "gleam"],
            [".hx", "haxe"],
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
