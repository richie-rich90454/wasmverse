# Universal WASM Platform

Zip in, terminal out. Upload a zip archive of source code in any of seventeen languages, name the entry file, and run the program in an in-browser terminal.

## Quick Start

```bash
bun install
bun run dev
```

Open `http://localhost:5173`, drop a zip containing `main.py`, type `main.py` as the entry file, and press **Build and Run**.

## Scripts

| Command                | Purpose                                               |
| ---------------------- | ----------------------------------------------------- |
| `bun run dev`          | Server (`--watch`) on :3000 plus Vite on :5173        |
| `bun run build`        | Production build into `dist/client/` + `dist/server/` |
| `bun run start`        | Serve the production build                            |
| `bun run setup`        | Provision local toolchains into `./.tools/`           |
| `bun run format`       | Format the repo with oxfmt                            |
| `bun run format:check` | Verify formatting without writing                     |

`bun install` runs `setup` automatically via `postinstall`. Missing optional toolchains never fail the install; those languages simply report a clear error at build time until their toolchain is provisioned.

## Supported Languages

Python, Ruby, Lua, PHP, Rust, C, C++, Go, Zig, Swift, Kotlin, Dart, Java, C#, AssemblyScript, OCaml, Haskell.

`userSourceTemplates/` holds one small greeting program per language. Zip one up to confirm the whole pipeline in ten seconds.

## Interactive Input

Python and Ruby programs get full terminal input: synchronous `input()` / `gets` calls are satisfied by replaying the program with the answers collected so far, and Python also supports `await async_input(prompt)`. Lua and PHP run print-and-compute style; reads past end-of-input see EOF (`nil` / `false`), so guard reads accordingly. Every failure surfaces as a readable terminal line; nothing escapes as an unhandled exception.

## Terminal Copy

Drag to select terminal text. Copy with right-click, Ctrl+C while text is selected, or Ctrl+Shift+C. Ctrl+C with no selection keeps its usual line-cancel meaning.

## Static Site Export

After a program finishes, the **Download static site (.zip)** link fetches a self-contained bundle: `index.html`, one bundled `app.js`, the terminal stylesheet, `session.json`, and the session `runtime/` and `user-code/` folders with all paths relative. Unzip it behind any static host (GitHub Pages, `npx serve`, plain Nginx) and the program runs with full WASM abilities, no application server needed. The host must serve `.wasm` as `application/wasm`; GitHub Pages does. Interactive Python and Ruby programs keep working because the bundle carries the same performers.

## Architecture

Composition only: no `extends`, no abstract classes. Contracts are interfaces; behaviour is conferred by holding collaborators.

- `src/sharedKernel/` — plain interfaces and union aliases. No classes.
- `src/serverAtelier/` — Bun HTTP server. `ServerApplication` wires every collaborator: seventeen language plugins (each composing a compiler strategy, a runtime assembler, a source file copier, and a manifest writer), a `BuildOrchestrator`, a `SessionRegistry`, and an `HttpRequestRouter`.
- `src/clientTheatre/` — React is a presentation skin. All logic lives in OOP service classes (`ClientApplicationController`, `TerminalStageController`, and friends). Components only wire inputs to services and render outputs from them.
- `scripts/` — toolchain setup, development launcher, production build.

## Adding a Language

1. Add the identifier to the `LanguageIdentifier` union.
2. Write a compiler strategy implementing `CompilerStrategyContract`.
3. Write a runtime assembler implementing `RuntimeAssetAssemblerContract`.
4. Write a language plugin composing the two plus the shared `UserSourceFileCopier` and `UserManifestWriter`.
5. Register the plugin in `ServerApplication` and map its extensions in `LanguageIdentifierResolver`.
6. Write a client performer and add it to `TerminalPerformerFactory`.

## API

- `POST /api/session` — multipart `archive` (zip) + `entry` (file name). Returns `{ sessionIdentifier, languageIdentifier, entryFileRelativePath, creationTimestamp }`.
- `GET /api/health` — `{ status, registeredLanguages }`.
- `GET /session/<id>/dist/*` — runtime and user-code assets for a session.

## Design

Flat drafting-table aesthetic: warm paper background, deep-blue actions, 1px rules, Georgia display type, Helvetica body, Menlo terminal. No shadows, no gradients, no animation beyond an 80ms button hover. Tokens live in `src/clientTheatre/styles/UniversalBlueprint.css`.
