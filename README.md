# WASMVerse

Seventeen languages. One terminal. Compiled to WebAssembly.

Upload a zip archive of source code in any of seventeen languages, name the entry file, and run the program in an in-browser terminal. The Language Index on the home page runs a one-click showcase program per language with no upload required.

## Quick Start

```bash
bun install
bun run dev
```

Open `http://localhost:5173`, press Run plate on the Python plate, and answer the sieve prompt in the terminal. To run your own code, drop a zip archive onto Plate Two, name the entry file, and press Build and Run.

## Scripts

1. `bun run dev` starts the server with watch mode on port 3000 plus Vite on port 5173.
2. `bun run build` produces the production build in `dist/client/` plus `dist/server/`.
3. `bun run start` serves the production build.
4. `bun run setup` provisions local toolchains into `./.tools/` plus `./.emsdk/`.
5. `bun run format` formats the repository with oxfmt.
6. `bun run format:check` verifies formatting without writing.
7. `bun run typecheck` runs `tsc --noEmit`.
8. `bun test` runs the unit test suite.

`bun install` runs `setup` automatically through `postinstall`. Missing toolchains never fail the install. Languages without a toolchain report a clear error at build time until the toolchain is provisioned.

## Supported Languages

Python, Ruby, Lua, PHP, Rust, C, C++, Go, Zig, Swift, Kotlin, Dart, Java, C#, AssemblyScript, OCaml, Haskell.

`userSourceTemplates/` holds one showcase program per language. Python and Ruby end with an interactive prompt. Every other showcase runs print-and-compute style from start to finish.

## Toolchains

Python, Ruby, Lua, and PHP run fully client side through Pyodide, ruby-wasm-wasi, wasmoon, and php-wasm, so those plates never need a server compiler. Go, AssemblyScript, and Dart compile with their standard toolchains. Dart falls back to a `dart` binary on PATH when `./.tools/dart-sdk/` is absent, and its bundled wasm support module ships with the session. Rust needs no user project files: the server scaffolds a Cargo crate with a wasm-bindgen dependency around a single uploaded `.rs` file, then builds with `wasm-pack` (PATH first, `bunx` fallback). Java needs no user project files either: the server scaffolds a Maven project with TeaVM 0.15.0 around a single uploaded `.java` file, compiled at release 11, so write TeaVM-compatible code (no records, no sealed types, no switch patterns). C and C++ compile with Emscripten from `./.emsdk/`. Zig, Swift, Kotlin, OCaml, and Haskell compile with SDKs under `./.tools/`. C# uses the dotnet SDK with the browser-wasm workload. A plate whose toolchain is absent fails fast with a readable terminal line that names the missing toolchain. First Rust and Java builds fetch their dependencies once, so they take longer than later builds.

## Interactive Input

Python and Ruby programs get full terminal input. Synchronous `input()` and `gets` calls are satisfied by replaying the program with the answers collected so far, and Python also supports `await async_input(prompt)`. Lua and PHP run print-and-compute style. Reads past end of input see end of file (`nil` in Lua, `false` in PHP), so guard reads accordingly. Every failure surfaces as a readable terminal line.

## Terminal Copy

Drag to select terminal text. Copy with right-click, Ctrl+C while text is selected, or Ctrl+Shift+C. Ctrl+C with no selection keeps its usual line-cancel meaning. Zoom the terminal font like a native console with Ctrl+Plus, Ctrl+Minus, Ctrl+0, or Ctrl+mouse wheel.

## Static Site Export

After a program finishes, the Download static site link fetches a self-contained bundle: `index.html`, one bundled `app.js`, the terminal stylesheet, `session.json`, and the session `runtime/` plus `user-code/` folders with all paths relative. Unzip it behind any static host (GitHub Pages, `npx serve`, plain Nginx) and the program runs with full WebAssembly abilities and no application server required. The host must serve `.wasm` as `application/wasm`. GitHub Pages does. Interactive Python and Ruby programs keep working because the bundle carries the same performers.

## Architecture

Composition only: no `extends`, no abstract classes. Contracts are interfaces. Behaviour is conferred by holding collaborators.

1. `src/sharedKernel/` holds plain interfaces and union aliases. No classes.
2. `src/serverAtelier/` holds the Bun HTTP server. `ServerApplication` wires every collaborator: seventeen language plugins (each composing a compiler strategy, a runtime assembler, a source file copier, and a manifest writer), a `BuildOrchestrator`, a `SessionRegistry`, and an `HttpRequestRouter`.
3. `src/clientTheatre/` holds the React presentation skin. All logic lives in OOP service classes (`ClientApplicationController`, `TerminalStageController`, and friends). Components only wire inputs to services and render outputs from them.
4. `scripts/` holds toolchain setup, the development launcher, and the production build.

## Adding a Language

1. Add the identifier to the `LanguageIdentifier` union.
2. Write a compiler strategy implementing `CompilerStrategyContract`.
3. Write a runtime assembler implementing `RuntimeAssetAssemblerContract`.
4. Write a language plugin composing the two plus the shared `UserSourceFileCopier` and `UserManifestWriter`.
5. Register the plugin in `ServerApplication` and map its extensions in `LanguageIdentifierResolver`.
6. Write a client performer and add it to `TerminalPerformerFactory`.
7. Add a showcase template in `userSourceTemplates/` and a plate in `SamplesCatalog.ts`.

## API

1. `POST /api/session` takes multipart `archive` (zip) plus `entry` (file name). It returns `{ sessionIdentifier, languageIdentifier, entryFileRelativePath, creationTimestamp }`.
2. `GET /api/health` returns `{ status, registeredLanguages }`.
3. `GET /session/<id>/dist/*` serves runtime and user-code assets for a session.
4. `GET /api/export/<id>` downloads the static site bundle for a session.

Uploads are rate limited per client. Security headers apply to every response. Asset paths that escape the session directory are rejected.

## Design

Flat drafting-table aesthetic: warm paper background, deep-blue actions, 1px rules, EB Garamond display type with Noto Sans body, platform monospace terminal. No shadows, no gradients, no animation beyond 100ms hover transitions, and no transitions at all under `prefers-reduced-motion`. Tokens live in `src/clientTheatre/styles/UniversalBlueprint.css`. Fonts ship locally through Fontsource with no CDN calls.
