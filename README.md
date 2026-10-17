# WASMVerse

### 56 programming languages. One terminal. Zero runtime dependencies after export.

**Run Python, Rust, C++, Go, Java, COBOL, Solidity, Brainfuck, and 48 other languages in your browser. Then export the result as a standalone website or a single HTML file.**

WASMVerse is an open-source, multi-language development environment that brings 56 programming languages into one interface.

Write code directly in the browser, upload a project, or import a GitHub repository. WASMVerse handles language detection, compilation, runtime preparation, terminal execution, and static export.

**The result is a program you can run, share, and host without keeping the WASMVerse server running.**

[Get Started](#quick-start) · [Explore 56 Languages](#56-languages-one-playground) · [How It Works](#how-it-works) · [CLI](#command-line-interface) · [MCP](#ai-agent-integration-mcp)

---

## Your code. Any language. Anywhere.

Most online code playgrounds support a few languages and require their own infrastructure to keep programs running.

WASMVerse takes a different approach.

**One interface for 56 languages. One build pipeline. Portable outputs that work independently of the platform.**

| | WASMVerse |
|---|---|
| **Languages** | 56 registered language environments |
| **Source input** | Editor, pasted code, ZIP, folder, GitHub repository |
| **Execution** | Browser-based WebAssembly, JavaScript runtimes, and interpreters |
| **Interaction** | Terminal input, output, arguments, and supported file I/O |
| **Export** | Static-site ZIP or self-contained HTML |
| **Deployment** | GitHub Pages, Cloudflare Pages, Netlify, S3, and other static hosts |
| **Automation** | CLI and Model Context Protocol server |
| **Verification** | Real Chrome execution against restrictive static hosting conditions |

No language-specific IDE to install for visitors. No persistent application backend for exported programs. No CDN dependencies in generated artifacts.

### See it in action

WASMVerse's home page includes a Language Index with runnable examples for every registered language.

Pick a language. Click **Run plate**. Watch it execute.

Want to run something else? Open the editor, paste code, upload an archive, drop a folder, or import a public GitHub repository.

When you're done, download the program as a website.

> **A showcase screenshot or 15–25 second demo GIF belongs here.** Show the Language Index, running a Python program, switching to Rust or COBOL, and exporting a single HTML file. A real demonstration will communicate more than several paragraphs of feature descriptions.

---

## Why this exists

A programming language is more than its syntax. It's also a compiler, a runtime, an execution model, and an ecosystem of assumptions about the machine it runs on.

That makes building a universal programming playground surprisingly difficult.

Python needs an interpreter. Rust needs compilation. SQL needs a database engine. Solidity needs an EVM. Verilog needs a simulator. Brainfuck needs an interpreter that understands eight instructions.

WASMVerse provides a shared interface without requiring those languages to share an implementation.

Underneath the interface, each language has its own compilation strategy, runtime assembler, and browser performer.

**The goal isn't to make 56 languages identical. It's to make them equally approachable.**

And once a program is built, WASMVerse packages its execution environment into an artifact that can leave the platform entirely.

---

## Quick Start

Clone the repository:

```bash
git clone https://github.com/richie-rich90454/wasmverse.git
cd wasmverse
```

Install dependencies and provision the toolchains:

```bash
pnpm install
pnpm setup
pnpm dev
```

Open **http://localhost:5173**.

That's it. The application is ready to explore.

The frontend runs on port `5173`, while the Node.js backend runs on port `3000`.

### Your first 30 seconds

1. Open the Language Index.
2. Select Python.
3. Click **Run plate**.
4. Answer the interactive sieve prompt.
5. Try another language.
6. Export a completed program as a ZIP or single HTML file.

You can explore the built-in examples without creating a project.

**A note about setup:** `pnpm setup` provisions compilers and SDKs into `.tools/` and `.emsdk/`. It does not install them system-wide. Some toolchains are platform-dependent or unavailable on certain hosts; missing optional toolchains are reported clearly rather than silently failing.

---

## 56 languages. One playground.

From languages used to build operating systems to languages invented as programming jokes, WASMVerse supports a deliberately broad catalog.

### Modern development

| | | | |
|---|---|---|---|
| Python | JavaScript | TypeScript | Rust |
| C | C++ | Go | Zig |
| Java | C# | Kotlin | Swift |
| Dart | PHP | Ruby | Lua |

### Functional, compiled, and transpiled

| | | | |
|---|---|---|---|
| Haskell | OCaml | F# | Scala |
| Elm | ReScript | PureScript | Gleam |
| Haxe | ClojureScript | Standard ML | AssemblyScript |

### Databases, scripting, and specialized languages

| | | | |
|---|---|---|---|
| SQL | DuckDB | PGlite | Solidity |
| Verilog | R | Perl | Bash |
| AWK | jq | Tcl | Vimscript |
| Prolog | Scheme | Common Lisp | APL |

### Retro, low-level, and esoteric

| | | | |
|---|---|---|---|
| COBOL | Fortran | Pascal | GW-BASIC |
| Forth | Smalltalk | Logo | Brainfuck |
| Befunge | LOLCODE | RISC-V assembly | 6502 assembly |

Every language has a dedicated showcase in `userSourceTemplates/`.

Some examples are interactive. Others demonstrate computation and output. All are accessible from the home page without requiring you to upload source code.

**Important:** Registration does not mean every compiler or runtime feature is available on every operating system. WASMVerse tracks actual feature support and toolchain coverage in `compatibility-matrix.json`.

---

## Not just a playground. A way to distribute programs.

Running code in a browser is useful.

**Exporting the entire execution environment is what makes WASMVerse different.**

Once your program has been built, you can download it in two formats.

### Static-site ZIP

A portable website containing the terminal, your program, its runtime, and the assets required to execute it.

```text
my-program/
├── index.html
├── app.js
├── terminal.css
├── session.json
├── .nojekyll
├── runtime/
└── user-code/
```

Upload the directory to a static host and run the program directly in the browser.

Supported deployment targets include:

- GitHub Pages
- Cloudflare Pages
- Netlify
- Vercel
- Firebase Hosting
- Amazon S3
- Nginx and Apache

No WASMVerse server is required after export.

### Single-file HTML

The same application, packaged into **one `.html` file**.

Runtime assets are compressed with gzip, encoded as base64, embedded into the document, and reconstructed using blob URLs.

The page requires no external runtime asset requests.

This is useful for sharing interactive demos, preserving runnable examples, distributing educational programs, and archiving experiments.

### How portable is portable?

WASMVerse exports are designed to survive hosting environments that break many WebAssembly applications.

They do not rely on:

- A CDN or remotely hosted runtime.
- A persistent WASMVerse backend.
- Import maps or remote asset origins.
- `application/wasm` MIME configuration.
- Absolute asset paths tied to a domain root.

WebAssembly modules are compiled from `ArrayBuffer` data rather than streamed responses. JavaScript assets use conventional `.js` extensions, and all asset references are relative.

That allows exports to work under restrictive MIME handling and subdirectory hosting.

The production build also rejects remote asset origins that survive into the generated distribution.

### How large are exports?

Actual sizes depend on the language and runtime.

| Language | Approximate export size |
|---|---:|
| AssemblyScript | 105 KB |
| Rust | 113 KB |
| Dart | 120 KB |
| Java | 124 KB |
| Lua | 248 KB |
| Go | 897 KB |
| PHP | 3.8 MB |
| Python | 6.4 MB |
| Ruby | 9.1 MB |

These are representative measurements, not guaranteed artifact sizes.

For interpreted languages, much of the bundle is the runtime itself. WASMVerse excludes unnecessary compiler outputs, source maps, type declarations, and build directories from exported artifacts.

---

## How it works

WASMVerse separates compilation from execution.

**Source code enters a language-specific build pipeline. The resulting artifact executes in the browser.**

```text
                     SOURCE CODE
                          |
          +---------------+---------------+
          |               |               |
       Editor           ZIP /          GitHub
                       Folder
          |               |               |
          +---------------+---------------+
                          |
                   Language Resolver
                          |
                    Language Plugin
                          |
             +------------+------------+
             |                         |
       Compiler Strategy        Runtime Assembler
             |                         |
             +------------+------------+
                          |
                     Build Session
                          |
                   Browser Performer
                          |
                  Interactive Terminal
                          |
             +------------+------------+
             |                         |
         ZIP Export              HTML Export
```

Different languages use different execution strategies.

| Execution model | Examples |
|---|---|
| Browser-side runtimes | Python through Pyodide, Ruby through ruby-wasm-wasi, Lua through wasmoon |
| WebAssembly compilation | C/C++ through Emscripten, Rust through wasm-pack, Go, Zig |
| JavaScript compilation | TypeScript, Scala.js, Elm, ReScript, Gleam |
| Dedicated engines | Solidity with an in-memory EVM, SQL through SQLite WASM, Verilog through Icarus WASM |
| Custom interpreters | Brainfuck, Befunge, Forth, GW-BASIC, RISC-V, 6502 |

The same build pipeline powers the browser application, command-line interface, and MCP server.

**Compilation may require the server. Running the exported program does not.**

---

## A real interactive terminal

WASMVerse is not limited to programs that print a fixed result.

The terminal supports interactive input through a replay-based execution model.

When a program requests input, the runtime can re-execute it using the answers already collected. Previously displayed output is deduplicated, so the user experiences a continuous conversation with the program.

The terminal also captures JavaScript `console` output from runtimes, making diagnostics visible without opening developer tools.

### Terminal shortcuts

| Action | Shortcut |
|---|---|
| Copy selection | Ctrl+C |
| Alternative copy | Ctrl+Shift+C |
| Cancel current line | Ctrl+C with nothing selected |
| Increase font size | Ctrl+Plus |
| Decrease font size | Ctrl+Minus |
| Reset font size | Ctrl+0 |
| Adjust font size | Ctrl+mouse wheel |

Interactive replay has limits: it is not the same as preserving a continuously running native process, and some languages cannot support stdin under their browser runtime constraints.

WASMVerse documents those limitations in the compatibility matrix rather than claiming universal support.

---

## We test the exported website, not just the build

A compiler reporting success does not guarantee that a website will run.

An export can fail because of an incorrect MIME type, a broken relative path, a missing runtime asset, an uncaught browser exception, or an unexpected network request.

WASMVerse includes a verification system built specifically to catch those failures.

```bash
pnpm verify:export
```

For every covered showcase, the verifier:

1. Builds the program.
2. Exports it as a ZIP.
3. Exports it as a single HTML file.
4. Serves the artifacts from a deliberately restrictive static host.
5. Opens them in real headless Chrome through the DevTools protocol.
6. Checks for console errors, uncaught exceptions, failed requests, and missing expected output.
7. Regenerates `compatibility-matrix.json`.

### Deliberately hostile hosting

The test environment includes conditions such as:

```text
.wasm -> application/octet-stream
X-Content-Type-Options: nosniff
Deployment under a subdirectory
```

These conditions expose portability bugs that ordinary development servers can hide.

You can also verify an individual language:

```bash
pnpm verify:export python
```

Verification runs use independent ports and staging directories, so multiple runs can execute concurrently.

If a compiler is unavailable on the current host, the language is reported as **not covered**, with an explanation. It is not incorrectly counted as a successful test.

The result is a compatibility matrix based on observed browser behavior rather than assumptions about language support.

---

## Command-line interface

The browser isn't required to use WASMVerse's build pipeline.

Compile a local project:

```bash
pnpm cli build ./my-project --entry main.py
```

Export a static-site ZIP:

```bash
pnpm cli build ./my-project \
  --entry main.py \
  --out exports/my-app.zip
```

Export a single HTML file:

```bash
pnpm cli build ./my-project \
  --entry main.py \
  --out exports/my-app.html
```

Pass newline-separated program arguments:

```bash
pnpm cli build ./my-project \
  --entry main.py \
  --args "first\nsecond"
```

List registered languages:

```bash
pnpm cli --list-languages
```

To make the `wasmverse` binary available through a global pnpm link:

```bash
pnpm link --global
```

The CLI uses the same compiler strategies, runtime assemblers, and export pipeline as the web application.

---

## AI agent integration (MCP)

WASMVerse exposes its capabilities through a stdio Model Context Protocol server.

This allows compatible coding agents to build and export programs through structured tool calls instead of manually controlling the browser.

Start the server:

```bash
pnpm exec tsx scripts/WasmverseMcpServer.ts
```

Or use the provided launcher:

```bash
node bin/wasmverse-mcp.mjs
```

### Available tools

| Tool | What it does |
|---|---|
| `list_languages` | Discover registered languages and entry extensions |
| `build_session` | Compile inline source files or a project directory |
| `export_artifact` | Export a session as ZIP or HTML |
| `export_project` | Build and export in a single call |

For example, an agent can call `export_project` with:

```json
{
  "directoryPath": "userSourceTemplates",
  "entry": "main.py"
}
```

The response includes the generated artifact's absolute path, byte size, language identifier, and entry file.

By default, build sessions are released after export. Set `keepSession` to retain them.

### opencode configuration

```json
{
  "mcp": {
    "wasmverse": {
      "type": "local",
      "command": [
        "node",
        "bin/wasmverse-mcp.mjs"
      ],
      "enabled": true
    }
  }
}
```

Run the command from the repository root or configure an absolute launcher path.

The MCP server uses the official `@modelcontextprotocol/sdk` and shares the existing `ServerComposition` and `BuildOrchestrator` implementation.

An accompanying agent skill is available at:

```text
.opencode/skills/wasmverse/SKILL.md
```

It documents tool usage, CLI equivalents, and the supported language catalog.

---

## Built for extension, not special cases

Supporting 56 languages requires more than a large switch statement.

WASMVerse uses a composition-first architecture with interfaces for language-specific behavior.

No inheritance hierarchies. No abstract base classes. Language integrations are assembled from collaborators.

### Repository layout

```text
wasmverse/
├── src/
│   ├── sharedKernel/       Shared contracts and types
│   ├── serverAtelier/      Builds, sessions, language plugins, API
│   └── clientTheatre/      React UI, controllers, performers
├── scripts/                Setup, CLI, MCP, verification
├── userSourceTemplates/    One showcase per language
├── bin/                    MCP launcher
├── .opencode/skills/       Agent integration skill
└── compatibility-matrix.json
```

The main components include:

| Component | Responsibility |
|---|---|
| `ServerComposition` | Assembles the server's collaborators and language plugins |
| `BuildOrchestrator` | Coordinates source compilation and runtime preparation |
| `SessionRegistry` | Manages build sessions |
| `HttpRequestRouter` | Routes API and asset requests |
| `TerminalPerformerFactory` | Creates language-specific browser performers |
| `StaticSiteExporter` | Generates portable export artifacts |
| `ClientApplicationController` | Coordinates client application behavior |
| `TerminalStageController` | Manages terminal behavior |

React components primarily render state and connect interactions to controller services.

### Adding another language

A new language requires:

1. A `LanguageIdentifier` entry.
2. A compiler strategy implementing `CompilerStrategyContract`.
3. A runtime assembler implementing `RuntimeAssetAssemblerContract`.
4. A language plugin composing the strategy, assembler, source copier, and manifest writer.
5. Registration in `ServerComposition` and `LanguageIdentifierResolver`.
6. A browser performer registered in `TerminalPerformerFactory`.
7. A showcase under `userSourceTemplates/` and an entry in `SamplesCatalog.ts`.
8. Export registration in `StaticSiteExporter.ts`.
9. Verification registration in `VerifyStaticExportsScript.ts`.

The shared build system handles the rest of the workflow.

A good integration includes a meaningful showcase, readable errors, explicit feature limitations, and export verification coverage.

---

## HTTP API

WASMVerse provides an HTTP API for creating sessions, retrieving assets, and downloading exports.

| Endpoint | Purpose |
|---|---|
| `POST /api/session` | Build a ZIP archive using an `entry` file |
| `GET /api/health` | Retrieve server status and registered languages |
| `GET /session/<id>/dist/*` | Serve assets belonging to a build session |
| `GET /api/export/<id>` | Download a static-site ZIP |
| `GET /api/export/<id>?format=html` | Download a single-file HTML export |

Create a session using multipart form data with the fields `archive` and `entry`.

The response contains:

```json
{
  "sessionIdentifier": "<session-id>",
  "languageIdentifier": "python",
  "entryFileRelativePath": "main.py",
  "creationTimestamp": "<timestamp>"
}
```

The server applies upload rate limits, response security headers, and checks that asset paths cannot escape their session directories.

---

## Configuration

| Environment variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | Backend port |
| `HOST` | `0.0.0.0` | Bind address |
| `SESSIONS_DIRECTORY` | `./sessions` | Session storage |
| `CLIENT_BUILD_DIRECTORY` | `./dist/client` | Production frontend assets |
| `SESSION_TTL_MILLISECONDS` | `1800000` | Idle session lifetime |
| `MAX_UPLOAD_BYTES` | `26214400` | Maximum archive size (25 MiB) |
| `REQUEST_IDLE_TIMEOUT_SECONDS` | `255` | Request idle timeout |
| `UPLOADS_PER_MINUTE_PER_CLIENT` | `10` | Per-client upload limit |

Public deployments should review resource limits and isolation before accepting untrusted projects.

---

## Development

| Command | Purpose |
|---|---|
| `pnpm install` | Install project dependencies |
| `pnpm setup` | Provision local language toolchains |
| `pnpm dev` | Start the development environment |
| `pnpm build` | Build frontend and backend distributions |
| `pnpm start` | Serve the production application |
| `pnpm format` | Format with oxfmt |
| `pnpm format:check` | Check formatting |
| `pnpm typecheck` | Run TypeScript type checking |
| `pnpm test` | Run Vitest |
| `pnpm verify:export` | Verify exported showcases in Chrome |

Before submitting a change:

```bash
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
```

For runtime, language, or export changes, also run:

```bash
pnpm verify:export
```

### Platform compatibility

Toolchain availability depends on the host operating system.

Swift, OCaml, Haskell, Fortran, Pascal, and COBOL do not currently have fully working prebuilt Windows toolchains in the repository's provisioning process.

When a required compiler is unavailable, WASMVerse displays a readable toolchain-pending message rather than silently failing.

Some runtimes also have browser-specific constraints:

- PHP requires HTTPS for Web Locks-based file-write serialization.
- PHP's runtime lacks fiber support and removes a leading `declare(strict_types=1)` before execution.
- Some language environments require cross-origin isolation for interactive input.
- Replay-based stdin cannot perfectly reproduce every native-process behavior.

These limitations are tracked explicitly instead of hidden behind a generic claim of universal compatibility.

---

## Contributing

WASMVerse sits at the intersection of compilers, interpreters, WebAssembly, browser runtimes, developer tooling, and static-site infrastructure.

There are several useful ways to contribute:

- Add a new language or improve an existing integration.
- Improve compatibility with additional operating systems.
- Fix browser-runtime or terminal edge cases.
- Reduce exported artifact sizes.
- Expand end-to-end verification coverage.
- Improve the editor, language discovery, or documentation.

If you're interested in how programming languages work under the hood, this project provides a practical place to explore that question.

See the [language integration guide](#adding-another-language) to understand the extension process.

[Open an issue](https://github.com/richie-rich90454/wasmverse/issues) · [View the source](https://github.com/richie-rich90454/wasmverse) · [Contribute a pull request](https://github.com/richie-rich90454/wasmverse/pulls)

---

## One more thing

WASMVerse started from a simple idea:

**What if you could run almost any kind of programming language in the same place, then take the resulting program with you?**

Not just mainstream languages.

Not just languages that already have a convenient browser compiler.

And not just programs that work while a particular server stays online.

Fifty-six languages later, WASMVerse brings modern compilers, classic languages, virtual machines, interpreters, and esoteric experiments into a shared environment.

The source can be different. The runtime can be different. The compiler can be different.

The experience stays familiar.

**Write it. Run it. Export it.**

If you find WASMVerse useful or interesting, consider [starring the repository](https://github.com/richie-rich90454/wasmverse). It helps other developers discover the project.

---

**WASMVerse** — 56 languages. One terminal. Programs that travel.
