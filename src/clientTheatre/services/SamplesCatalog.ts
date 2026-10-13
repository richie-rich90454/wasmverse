import { strToU8, zipSync } from "fflate";
import type { LanguageIdentifier } from "@sharedKernel/LanguageIdentifier.ts";
type SamplePlate = {
    languageIdentifier: LanguageIdentifier;
    languageLabel: string;
    entryFileName: string;
    programTitle: string;
    description: string;
    sourceText: string;
};
const templateSources = import.meta.glob("/userSourceTemplates/*", {
    query: "?raw",
    import: "default",
    eager: true,
}) as Record<string, string>;
function sourceTextFor(entryFileName: string): string {
    const matchedPath = Object.keys(templateSources).find((templatePath) =>
        templatePath.endsWith(`/${entryFileName}`),
    );
    if (!matchedPath) {
        return "";
    }
    return templateSources[matchedPath] as string;
}
const SAMPLE_PLATES: ReadonlyArray<SamplePlate> = [
    {
        languageIdentifier: "python",
        languageLabel: "Python",
        entryFileName: "main.py",
        programTitle: "Async pipeline and data modeling",
        description:
            "Dataclasses, an async worker pool, and a deterministic sieve run in one program.",
        sourceText: sourceTextFor("main.py"),
    },
    {
        languageIdentifier: "ruby",
        languageLabel: "Ruby",
        entryFileName: "main.rb",
        programTitle: "Enumerable theater and fibers",
        description:
            "Lazy enumerators, a fiber chain, and a small interpreter for arithmetic expressions.",
        sourceText: sourceTextFor("main.rb"),
    },
    {
        languageIdentifier: "lua",
        languageLabel: "Lua",
        entryFileName: "main.lua",
        programTitle: "Metatables and coroutine scheduler",
        description: "A metatable-based entity system driven by a cooperative coroutine scheduler.",
        sourceText: sourceTextFor("main.lua"),
    },
    {
        languageIdentifier: "php",
        languageLabel: "PHP",
        entryFileName: "main.php",
        programTitle: "Fibers, generators, and typed state",
        description:
            "Generators stream prime windows while fibers coordinate a typed state machine.",
        sourceText: sourceTextFor("main.php"),
    },
    {
        languageIdentifier: "rust",
        languageLabel: "Rust",
        entryFileName: "main.rs",
        programTitle: "Iterators and ownership",
        description:
            "Iterator pipelines and ownership transfer across a compute graph, returned as one string.",
        sourceText: sourceTextFor("main.rs"),
    },
    {
        languageIdentifier: "c",
        languageLabel: "C",
        entryFileName: "main.c",
        programTitle: "Arena allocator and state machine",
        description:
            "A bump arena, tagged unions, and a hand-written state machine drive the output.",
        sourceText: sourceTextFor("main.c"),
    },
    {
        languageIdentifier: "cpp",
        languageLabel: "C++",
        entryFileName: "main.cpp",
        programTitle: "Variants and constexpr evaluation",
        description:
            "Shared ownership, std::variant visitors, and constexpr math computed at compile time.",
        sourceText: sourceTextFor("main.cpp"),
    },
    {
        languageIdentifier: "go",
        languageLabel: "Go",
        entryFileName: "main.go",
        programTitle: "Goroutine fan-out with channels",
        description:
            "A worker pool fans out prime scans across channels and collects ordered results.",
        sourceText: sourceTextFor("main.go"),
    },
    {
        languageIdentifier: "zig",
        languageLabel: "Zig",
        entryFileName: "main.zig",
        programTitle: "Comptime and error unions",
        description: "Compile-time tables meet runtime error unions in a compact parsing pipeline.",
        sourceText: sourceTextFor("main.zig"),
    },
    {
        languageIdentifier: "swift",
        languageLabel: "Swift",
        entryFileName: "main.swift",
        programTitle: "Protocol-oriented result pipeline",
        description:
            "Protocols, generics, and result types compose a readable transformation chain.",
        sourceText: sourceTextFor("main.swift"),
    },
    {
        languageIdentifier: "kotlin",
        languageLabel: "Kotlin",
        entryFileName: "main.kt",
        programTitle: "Sealed classes and flows",
        description:
            "Sealed hierarchies model events while sequence pipelines process them in order.",
        sourceText: sourceTextFor("main.kt"),
    },
    {
        languageIdentifier: "dart",
        languageLabel: "Dart",
        entryFileName: "main.dart",
        programTitle: "Streams and isolate-style tasks",
        description: "Async streams, pattern matching, and scheduled tasks produce a live report.",
        sourceText: sourceTextFor("main.dart"),
    },
    {
        languageIdentifier: "java",
        languageLabel: "Java",
        entryFileName: "Main.java",
        programTitle: "Streams and collectors",
        description: "Lambdas, streams, and collectors summarize a small ledger for TeaVM.",
        sourceText: sourceTextFor("Main.java"),
    },
    {
        languageIdentifier: "csharp",
        languageLabel: "C#",
        entryFileName: "Program.cs",
        programTitle: "LINQ and pattern matching",
        description:
            "Records, LINQ chains, and exhaustive pattern matching summarize a sample ledger.",
        sourceText: sourceTextFor("Program.cs"),
    },
    {
        languageIdentifier: "assemblyscript",
        languageLabel: "AssemblyScript",
        entryFileName: "main.as",
        programTitle: "Typed WebAssembly memory",
        description: "Static types, heap allocation, and arithmetic run directly on linear memory.",
        sourceText: sourceTextFor("main.as"),
    },
    {
        languageIdentifier: "ocaml",
        languageLabel: "OCaml",
        entryFileName: "main.ml",
        programTitle: "Algebraic data types and folds",
        description: "Variant types, pattern matching, and folds evaluate an expression tree.",
        sourceText: sourceTextFor("main.ml"),
    },
    {
        languageIdentifier: "haskell",
        languageLabel: "Haskell",
        entryFileName: "main.hs",
        programTitle: "Laziness and type classes",
        description:
            "Infinite lazy lists meet type-class polymorphism in a short proof by computation.",
        sourceText: sourceTextFor("main.hs"),
    },
    {
        languageIdentifier: "javascript",
        languageLabel: "JavaScript",
        entryFileName: "main.js",
        programTitle: "Closures, classes, and Map pipelines",
        description:
            "Reduce chains, rolling windows, and a Map-backed ledger run in the browser tab.",
        sourceText: sourceTextFor("main.js"),
    },
    {
        languageIdentifier: "typescript",
        languageLabel: "TypeScript",
        entryFileName: "main.ts",
        programTitle: "Typed pipelines and generics",
        description:
            "Typed interfaces, a generic ranking function, and class accessors bundle for the browser.",
        sourceText: sourceTextFor("main.ts"),
    },
    {
        languageIdentifier: "sql",
        languageLabel: "SQL",
        entryFileName: "main.sql",
        programTitle: "SQLite windows and aggregates",
        description:
            "A SQLite ledger is aggregated, ranked, and totaled with window functions in memory.",
        sourceText: sourceTextFor("main.sql"),
    },
    {
        languageIdentifier: "duckdb",
        languageLabel: "DuckDB",
        entryFileName: "main.duckdb.sql",
        programTitle: "OLAP windows over an analytics ledger",
        description:
            "A DuckDB column store is grouped, ranked, and trended with CTEs and window functions.",
        sourceText: sourceTextFor("main.duckdb.sql"),
    },
    {
        languageIdentifier: "pglite",
        languageLabel: "PGlite",
        entryFileName: "main.pglite.sql",
        programTitle: "Postgres analytics in WebAssembly",
        description:
            "A full Postgres engine aggregates a ledger with generate_series, CTEs, and windows.",
        sourceText: sourceTextFor("main.pglite.sql"),
    },
    {
        languageIdentifier: "awk",
        languageLabel: "AWK",
        entryFileName: "main.awk",
        programTitle: "Records, arrays, and number crunching",
        description:
            "Associative arrays, computed fields, and formatted reports run through busybox awk.",
        sourceText: sourceTextFor("main.awk"),
    },
    {
        languageIdentifier: "jq",
        languageLabel: "jq",
        entryFileName: "main.jq",
        programTitle: "A JSON transformation pipeline",
        description:
            "Definitions, reductions, and group_by shape a computed JSON document into a report.",
        sourceText: sourceTextFor("main.jq"),
    },
    {
        languageIdentifier: "bash",
        languageLabel: "Bash",
        entryFileName: "main.sh",
        programTitle: "Functions and arithmetic in a real shell",
        description:
            "Shell functions, loops, command substitution, and pipelines run on busybox ash.",
        sourceText: sourceTextFor("main.sh"),
    },
];
async function buildSampleArchive(plate: SamplePlate): Promise<File> {
    const archiveBytes = zipSync({ [plate.entryFileName]: strToU8(plate.sourceText) });
    return new File([archiveBytes], `${plate.languageIdentifier}-sample.zip`, {
        type: "application/zip",
    });
}
export { SAMPLE_PLATES, buildSampleArchive };
export type { SamplePlate };
