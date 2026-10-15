---
name: wasmverse
description: Compile source code in any of the 56 supported languages (Python, Rust, C, C++, Go, Zig, Swift, Kotlin, Dart, Java, C#, OCaml, Haskell, Ruby, Lua, PHP, SQL, and more) into a runnable WebAssembly / static-site bundle using WASMVerse, via the wasmverse MCP server or the wasmverse CLI. Use when asked to build, compile, run, or export code for any supported language without provisioning a local toolchain.
---

# WASMVerse

WASMVerse compiles a source project into a self-contained static site (`index.html` + bundled runtime + `user-code/`) that runs in any browser from any static host. Two ways to drive it:

- MCP server (preferred for agents): `scripts/WasmverseMcpServer.ts`, launched through `bin/wasmverse-mcp.mjs`.
- CLI: `pnpm cli build <directory> --entry <fileName>` (also available as the `wasmverse` bin, `node bin/wasmverse.mjs ...`).

Both run from the repository root; keep the working directory at the repo root so `node_modules/` runtime assets resolve (the MCP launcher pins its own cwd for you).

## MCP server for opencode

Add to `opencode.json`:

```json
{
    "mcp": {
        "wasmverse": {
            "type": "local",
            "command": ["node", "bin/wasmverse-mcp.mjs"],
            "enabled": true
        }
    }
}
```

Direct invocation without the bin: `pnpm exec tsx scripts/WasmverseMcpServer.ts` (stdio JSON-RPC).

## Tools

| Tool | Input | Returns |
| --- | --- | --- |
| `list_languages` | none | Every registered language: identifier, display name, entry-file extensions |
| `build_session` | `{ files: { "main.py": "..." }, entry }` or `{ directoryPath, entry }`, optional `programArguments: []` | Session descriptor JSON; session lives under `sessions/<id>` |
| `export_artifact` | `{ sessionIdentifier, format: "zip" (default), outputPath?, keepSession? }` | `{ artifactPath, byteSize, format, sessionIdentifier }`; `artifactPath` is absolute |
| `export_project` | `{ directoryPath, entry, programArguments?, format?, outputPath?, keepSession? }` | `{ artifactPath, byteSize, languageIdentifier, entryFileRelativePath }` |

Behaviour notes:

- `export_project` = `build_session` + `export_artifact` in one call; prefer it for one-shot requests.
- Artifacts default to a temp path (`%TEMP%/wasmverse-mcp-artifacts/<session>.zip`); pass `outputPath` to choose a location.
- Sessions are released after export unless `keepSession: true`; they also expire after the session TTL (default 30 minutes).
- `format: "html"` (single-file HTML) is reserved but not implemented; use `"zip"`.
- Errors come back as MCP `isError` results with readable messages, e.g. entry file not found, unknown session, unsupported language.

Examples:

```json
{
    "name": "export_project",
    "arguments": { "directoryPath": "userSourceTemplates", "entry": "main.py" }
}
```

```json
{
    "name": "build_session",
    "arguments": { "files": { "main.py": "print('hello')" }, "entry": "main.py" }
}
```

```json
{
    "name": "export_artifact",
    "arguments": { "sessionIdentifier": "<id>", "format": "zip", "outputPath": "out/app.zip" }
}
```

## CLI

```bash
pnpm cli build ./my-project --entry main.py --out exports/app.zip
pnpm cli build ./my-project --entry main.py --args "one\n two"
pnpm cli --list-languages
pnpm cli --help
```

Equivalent through the bin: `node bin/wasmverse.mjs build ./my-project --entry main.py`. Output defaults to `<entry-stem>.zip` in the working directory; only `.zip` output is supported.

## Supported languages

The canonical list is `list_languages` / `pnpm cli --list-languages` (56 languages). Entry extensions accepted per language:

| Identifier     | Language        | Entry extensions |
| -------------- | --------------- | ---------------- |
| python         | Python          | .py              |
| r              | R               | .r               |
| clojurescript  | ClojureScript   | .cljs            |
| scheme         | Scheme          | .scm             |
| prolog         | Prolog          | .pl              |
| ruby           | Ruby            | .rb              |
| perl           | Perl            | .pl .pm          |
| pascal         | Pascal          | .pas             |
| cobol          | COBOL           | .cob             |
| fortran        | Fortran         | .f90             |
| lua            | Lua             | .lua             |
| php            | PHP             | .php             |
| rust           | Rust            | .rs              |
| commonlisp     | Common Lisp     | .lisp .lsp .cl   |
| tcl            | Tcl             | .tcl             |
| forth          | Forth           | .fth .forth      |
| smalltalk      | Smalltalk       | .st              |
| c              | C               | .c .h            |
| brainfuck      | Brainfuck       | .bf              |
| befunge        | Befunge         | .bef             |
| lolcode        | LOLCODE         | .lol             |
| apl            | APL             | .apl .dyalog     |
| cpp            | C++             | .cpp .cc .hpp .h |
| riscv          | RISC-V assembly | .s .asm .riscv   |
| verilog        | Verilog         | .v               |
| solidity       | Solidity        | .sol             |
| vimscript      | Vim script      | .vim             |
| go             | Go              | .go              |
| logo           | Logo            | .logo .lgo       |
| gwbasic        | GW-BASIC        | .bas             |
| sml            | Standard ML     | .sml .sig        |
| m6502          | 6502 Assembly   | .6502 .a65       |
| zig            | Zig             | .zig             |
| swift          | Swift           | .swift           |
| kotlin         | Kotlin          | .kt .kts         |
| dart           | Dart            | .dart            |
| java           | Java            | .java            |
| csharp         | C#              | .cs              |
| assemblyscript | AssemblyScript  | .as              |
| ocaml          | OCaml           | .ml .mli         |
| haskell        | Haskell         | .hs              |
| javascript     | JavaScript      | .js .mjs         |
| typescript     | TypeScript      | .ts .mts         |
| sql            | SQL             | .sql             |
| duckdb         | DuckDB          | .duckdb.sql      |
| pglite         | PGlite          | .pglite.sql      |
| awk            | AWK             | .awk             |
| jq             | jq              | .jq              |
| bash           | Bash            | .sh              |
| scala          | Scala.js        | .scala           |
| fsharp         | F# (Fable)      | .fs              |
| elm            | Elm             | .elm             |
| rescript       | ReScript        | .res .resi       |
| purescript     | PureScript      | .purs            |
| gleam          | Gleam           | .gleam           |
| haxe           | Haxe            | .hx              |

Some languages need a locally provisioned toolchain (run `pnpm run setup`); the rest (Python, Ruby, Lua, PHP, JavaScript, SQL, and more) run fully client side through bundled runtimes.
