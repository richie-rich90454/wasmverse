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
        languageIdentifier: "r",
        languageLabel: "R",
        entryFileName: "main.r",
        programTitle: "Vectorized statistics in WebAssembly",
        description:
            "A vectorized sieve, rolling windows, closures, and data frame aggregation in webR.",
        sourceText: sourceTextFor("main.r"),
    },
    {
        languageIdentifier: "clojurescript",
        languageLabel: "ClojureScript",
        entryFileName: "main.cljs",
        programTitle: "Immutable pipelines through Cherry",
        description:
            "Loop/recur, persistent vectors, and higher-order pipelines compile in the browser.",
        sourceText: sourceTextFor("main.cljs"),
    },
    {
        languageIdentifier: "scheme",
        languageLabel: "Scheme",
        entryFileName: "main.scm",
        programTitle: "Recursive lists and tail-call loops",
        description:
            "A recursive sieve, named-let folds, and higher-order mapping run on BiwaScheme.",
        sourceText: sourceTextFor("main.scm"),
    },
    {
        languageIdentifier: "prolog",
        languageLabel: "Prolog",
        entryFileName: "main.pro",
        programTitle: "Logical inference over generated facts",
        description: "Recursive rules, negation, and findall build and query a generated ledger.",
        sourceText: sourceTextFor("main.pro"),
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
        languageIdentifier: "perl",
        languageLabel: "Perl",
        entryFileName: "main.pl",
        programTitle: "RPN stacks and hash reporting",
        description:
            "A stack machine, word frequencies, running totals, and an interactive session.",
        sourceText: sourceTextFor("main.pl"),
    },
    {
        languageIdentifier: "pascal",
        languageLabel: "Pascal",
        entryFileName: "main.pas",
        programTitle: "Records and counted loops",
        description:
            "Records, dynamic arrays, and classic loops compile straight to WebAssembly through FPC.",
        sourceText: sourceTextFor("main.pas"),
    },
    {
        languageIdentifier: "cobol",
        languageLabel: "COBOL",
        entryFileName: "main.cob",
        programTitle: "Tables and computed sequences",
        description:
            "COBOL tables, PERFORM loops, and interactive ACCEPT input on the GnuCOBOL pipeline.",
        sourceText: sourceTextFor("main.cob"),
    },
    {
        languageIdentifier: "fortran",
        languageLabel: "Fortran",
        entryFileName: "main.f90",
        programTitle: "Array intrinsics and sequence math",
        description:
            "Whole-array idioms, intrinsic reductions, and interactive scaling through LFortran.",
        sourceText: sourceTextFor("main.f90"),
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
        languageIdentifier: "commonlisp",
        languageLabel: "Common Lisp",
        entryFileName: "main.lisp",
        programTitle: "Recursive lists and formatted reports",
        description:
            "A recursive sieve, higher-order mapping, and formatted reporting run on JSCL.",
        sourceText: sourceTextFor("main.lisp"),
    },
    {
        languageIdentifier: "tcl",
        languageLabel: "Tcl",
        entryFileName: "main.tcl",
        programTitle: "Procedures, lists, and string maps",
        description:
            "Tcl procedures, list processing, and dict-driven reports run on the wacl WebAssembly Tcl.",
        sourceText: sourceTextFor("main.tcl"),
    },
    {
        languageIdentifier: "forth",
        languageLabel: "Forth",
        entryFileName: "main.fth",
        programTitle: "A stack machine in the browser",
        description:
            "Colon definitions, counted loops, and stack arithmetic run on a built-in Forth interpreter.",
        sourceText: sourceTextFor("main.fth"),
    },
    {
        languageIdentifier: "smalltalk",
        languageLabel: "Smalltalk",
        entryFileName: "main.st",
        programTitle: "Blocks, collections, and message sends",
        description:
            "Blocks, collection pipelines, and cascades evaluate in a Smalltalk-80 interpreter.",
        sourceText: sourceTextFor("main.st"),
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
        languageIdentifier: "brainfuck",
        languageLabel: "Brainfuck",
        entryFileName: "main.bf",
        programTitle: "Tape loops and byte echo",
        description:
            "A generated tape program prints a banner twice from a loop, then echoes a typed byte.",
        sourceText: sourceTextFor("main.bf"),
    },
    {
        languageIdentifier: "befunge",
        languageLabel: "Befunge",
        entryFileName: "main.bef",
        programTitle: "A two-dimensional program counter",
        description:
            "Direction control, stack arithmetic, and stdin reads drive an 80x25 playfield.",
        sourceText: sourceTextFor("main.bef"),
    },
    {
        languageIdentifier: "lolcode",
        languageLabel: "LOLCODE",
        entryFileName: "main.lol",
        programTitle: "Arithmetic with LOLCODE grammar",
        description: "Variables, loops, comparisons, and SMOOSH string building run step by step.",
        sourceText: sourceTextFor("main.lol"),
    },
    {
        languageIdentifier: "apl",
        languageLabel: "APL",
        entryFileName: "main.apl",
        programTitle: "Array programming on ngn/apl",
        description:
            "Iota, reductions, a prime sieve, and quad input run on the vendored APL interpreter.",
        sourceText: sourceTextFor("main.apl"),
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
        languageIdentifier: "riscv",
        languageLabel: "RISC-V assembly",
        entryFileName: "main.s",
        programTitle: "RV32I assembly with a sieve",
        description:
            "Hand-written RV32I runs on an in-tab emulator: syscalls, argv, and a prime sieve.",
        sourceText: sourceTextFor("main.s"),
    },
    {
        languageIdentifier: "verilog",
        languageLabel: "Verilog",
        entryFileName: "main.v",
        programTitle: "Ripple adder and LFSR testbench",
        description:
            "Icarus Verilog compiles to WebAssembly and simulated modules stream $display output.",
        sourceText: sourceTextFor("main.v"),
    },
    {
        languageIdentifier: "solidity",
        languageLabel: "Solidity",
        entryFileName: "main.sol",
        programTitle: "Contracts deployed to an in-tab EVM",
        description:
            "solc compiles in the browser, the contract deploys to an in-memory EVM, and main() runs.",
        sourceText: sourceTextFor("main.sol"),
    },
    {
        languageIdentifier: "vimscript",
        languageLabel: "Vim script",
        entryFileName: "main.vim",
        programTitle: "Headless Vim automation",
        description:
            "A real Vim runs in silent Ex mode: buffers, substitutions, and scripted reporting.",
        sourceText: sourceTextFor("main.vim"),
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
        languageIdentifier: "logo",
        languageLabel: "Logo",
        entryFileName: "main.logo",
        programTitle: "Procedures, lists, and a text turtle",
        description:
            "Recursive procedures, list operations, and an ASCII turtle spiral run in the browser.",
        sourceText: sourceTextFor("main.logo"),
    },
    {
        languageIdentifier: "gwbasic",
        languageLabel: "GW-BASIC",
        entryFileName: "main.bas",
        programTitle: "Line numbers, arrays, and GOSUB",
        description: "Classic GW-BASIC programs with FOR/NEXT, DATA, seeded RND, and subroutines.",
        sourceText: sourceTextFor("main.bas"),
    },
    {
        languageIdentifier: "sml",
        languageLabel: "Standard ML",
        entryFileName: "main.sml",
        programTitle: "Typed modules and list pipelines",
        description:
            "Standard ML compilation arrives once ./.tools/sml/ is provisioned; see pnpm run setup.",
        sourceText: sourceTextFor("main.sml"),
    },
    {
        languageIdentifier: "m6502",
        languageLabel: "6502 Assembly",
        entryFileName: "main.6502",
        programTitle: "NMOS opcodes on a built-in emulator",
        description:
            "A two-pass assembler and a 6502 emulator print Fibonacci over memory-mapped IO.",
        sourceText: sourceTextFor("main.6502"),
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
    {
        languageIdentifier: "scala",
        languageLabel: "Scala",
        entryFileName: "main.scala",
        programTitle: "Case classes and collection pipelines",
        description:
            "Sealed traits, case classes, and collection pipelines compile through Scala.js.",
        sourceText: sourceTextFor("main.scala"),
    },
    {
        languageIdentifier: "fsharp",
        languageLabel: "F#",
        entryFileName: "Main.fs",
        programTitle: "Discriminated unions and list pipelines",
        description:
            "Pattern matching, records, and list folds compile to JavaScript through Fable.",
        sourceText: sourceTextFor("Main.fs"),
    },
    {
        languageIdentifier: "elm",
        languageLabel: "Elm",
        entryFileName: "Main.elm",
        programTitle: "A typed Model-Update-View worker",
        description: "A headless Elm worker drives a typed update loop and streams through a port.",
        sourceText: sourceTextFor("Main.elm"),
    },
    {
        languageIdentifier: "rescript",
        languageLabel: "ReScript",
        entryFileName: "Main.res",
        programTitle: "Variants and pipe-first pipelines",
        description: "ReScript variants and pipe-first chaining compile straight to readable ESM.",
        sourceText: sourceTextFor("Main.res"),
    },
    {
        languageIdentifier: "purescript",
        languageLabel: "PureScript",
        entryFileName: "Main.purs",
        programTitle: "Algebraic effects with a foreign interface",
        description:
            "PureScript effects run through a small foreign module that bridges to the host.",
        sourceText: sourceTextFor("Main.purs"),
    },
    {
        languageIdentifier: "gleam",
        languageLabel: "Gleam",
        entryFileName: "main.gleam",
        programTitle: "Friendly types on the JavaScript target",
        description: "Gleam's typed pipelines and results compile to clean JavaScript modules.",
        sourceText: sourceTextFor("main.gleam"),
    },
    {
        languageIdentifier: "haxe",
        languageLabel: "Haxe",
        entryFileName: "Main.hx",
        programTitle: "Static classes across targets",
        description: "Haxe classes and typed collections compile to an ES module for the browser.",
        sourceText: sourceTextFor("Main.hx"),
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
