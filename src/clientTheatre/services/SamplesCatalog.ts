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
        programTitle: "Traits, iterators, and ownership",
        description:
            "Trait objects, zero-copy iterators, and ownership transfer across a compute graph.",
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
        programTitle: "Templates and constexpr evaluation",
        description:
            "Variadic templates, std::variant visitors, and constexpr math computed at compile time.",
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
        programTitle: "Records and sealed interfaces",
        description:
            "Immutable records, sealed interfaces, and switch patterns model a small ledger.",
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
        entryFileName: "main.ts",
        programTitle: "Typed WebAssembly memory",
        description: "Static types, heap allocation, and arithmetic run directly on linear memory.",
        sourceText: sourceTextFor("main.ts"),
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
];
async function buildSampleArchive(plate: SamplePlate): Promise<File> {
    const archiveBytes = zipSync({ [plate.entryFileName]: strToU8(plate.sourceText) });
    return new File([archiveBytes], `${plate.languageIdentifier}-sample.zip`, {
        type: "application/zip",
    });
}
export { SAMPLE_PLATES, buildSampleArchive };
export type { SamplePlate };
