import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import { isAbsolute, join, relative, resolve } from "node:path";
import { tmpdir } from "node:os";
import type { Readable } from "node:stream";
import { unzipSync, zipSync } from "fflate";
import { ScopedLogger } from "@serverAtelier/ScopedLogger.ts";
import {
    FEATURE_PROBES,
    type FeatureName,
    type FeatureProbeDefinition,
} from "./FeatureProbeCatalog.ts";
const scopedLogger = new ScopedLogger("VerifyStaticExports");
const languageFilter = process.argv[2] ?? "";
const APP_PORT = Number(process.env.VERIFY_APP_PORT ?? 3987);
const HOST_PORT = Number(process.env.VERIFY_HOST_PORT ?? 3988);
const DEBUGGER_PORT = Number(process.env.VERIFY_DEBUGGER_PORT ?? 9333);
const VERIFICATION_ROOT = join(
    tmpdir(),
    process.env.VERIFY_ROOT_NAME ?? "wasmverse-export-verification",
);
const CHROME_CANDIDATES = [
    join(process.cwd(), ".tools/chrome-for-testing/chrome.exe"),
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
];
const HOSTILE_CONTENT_TYPES: Record<string, string> = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".zip": "application/zip",
    ".wasm": "application/octet-stream",
    ".mjs": "application/octet-stream",
    ".data": "application/octet-stream",
    ".mem": "application/octet-stream",
};
interface ShowcaseUnderTest {
    languageIdentifier: string;
    entryFileName: string;
    budgetMilliseconds: number;
}
const TOOLCHAIN_PENDING_PATTERNS: ReadonlyArray<RegExp> = [
    /Run pnpm run setup/,
    /browser-wasm workload is not installed/,
    /no local toolchain/,
];
const SHOWCASES: ReadonlyArray<ShowcaseUnderTest> = [
    {
        languageIdentifier: "python",
        entryFileName: "main.py",
        budgetMilliseconds: 150_000,
    },
    {
        languageIdentifier: "r",
        entryFileName: "main.r",
        budgetMilliseconds: 300_000,
    },
    {
        languageIdentifier: "clojurescript",
        entryFileName: "main.cljs",
        budgetMilliseconds: 150_000,
    },
    {
        languageIdentifier: "scheme",
        entryFileName: "main.scm",
        budgetMilliseconds: 120_000,
    },
    {
        languageIdentifier: "prolog",
        entryFileName: "main.pl",
        budgetMilliseconds: 120_000,
    },
    {
        languageIdentifier: "ruby",
        entryFileName: "main.rb",
        budgetMilliseconds: 150_000,
    },
    {
        languageIdentifier: "perl",
        entryFileName: "main.pl",
        budgetMilliseconds: 150_000,
    },
    {
        languageIdentifier: "pascal",
        entryFileName: "main.pas",
        budgetMilliseconds: 90_000,
    },
    {
        languageIdentifier: "cobol",
        entryFileName: "main.cob",
        budgetMilliseconds: 150_000,
    },
    {
        languageIdentifier: "fortran",
        entryFileName: "main.f90",
        budgetMilliseconds: 90_000,
    },
    {
        languageIdentifier: "lua",
        entryFileName: "main.lua",
        budgetMilliseconds: 90_000,
    },
    {
        languageIdentifier: "scala",
        entryFileName: "main.scala",
        budgetMilliseconds: 150_000,
    },
    {
        languageIdentifier: "fsharp",
        entryFileName: "Main.fs",
        budgetMilliseconds: 150_000,
    },
    {
        languageIdentifier: "elm",
        entryFileName: "Main.elm",
        budgetMilliseconds: 120_000,
    },
    {
        languageIdentifier: "php",
        entryFileName: "main.php",
        budgetMilliseconds: 120_000,
    },
    {
        languageIdentifier: "rescript",
        entryFileName: "Main.res",
        budgetMilliseconds: 150_000,
    },
    {
        languageIdentifier: "purescript",
        entryFileName: "Main.purs",
        budgetMilliseconds: 150_000,
    },
    {
        languageIdentifier: "gleam",
        entryFileName: "main.gleam",
        budgetMilliseconds: 120_000,
    },
    {
        languageIdentifier: "haxe",
        entryFileName: "Main.hx",
        budgetMilliseconds: 120_000,
    },
    {
        languageIdentifier: "rust",
        entryFileName: "main.rs",
        budgetMilliseconds: 180_000,
    },
    {
        languageIdentifier: "commonlisp",
        entryFileName: "main.lisp",
        budgetMilliseconds: 150_000,
    },
    {
        languageIdentifier: "tcl",
        entryFileName: "main.tcl",
        budgetMilliseconds: 150_000,
    },
    {
        languageIdentifier: "forth",
        entryFileName: "main.fth",
        budgetMilliseconds: 90_000,
    },
    {
        languageIdentifier: "smalltalk",
        entryFileName: "main.st",
        budgetMilliseconds: 90_000,
    },
    {
        languageIdentifier: "c",
        entryFileName: "main.c",
        budgetMilliseconds: 150_000,
    },
    {
        languageIdentifier: "brainfuck",
        entryFileName: "main.bf",
        budgetMilliseconds: 60_000,
    },
    {
        languageIdentifier: "befunge",
        entryFileName: "main.bef",
        budgetMilliseconds: 60_000,
    },
    {
        languageIdentifier: "lolcode",
        entryFileName: "main.lol",
        budgetMilliseconds: 60_000,
    },
    {
        languageIdentifier: "apl",
        entryFileName: "main.apl",
        budgetMilliseconds: 90_000,
    },
    {
        languageIdentifier: "cpp",
        entryFileName: "main.cpp",
        budgetMilliseconds: 150_000,
    },
    {
        languageIdentifier: "riscv",
        entryFileName: "main.s",
        budgetMilliseconds: 120_000,
    },
    {
        languageIdentifier: "verilog",
        entryFileName: "main.v",
        budgetMilliseconds: 120_000,
    },
    {
        languageIdentifier: "solidity",
        entryFileName: "main.sol",
        budgetMilliseconds: 180_000,
    },
    {
        languageIdentifier: "vimscript",
        entryFileName: "main.vim",
        budgetMilliseconds: 180_000,
    },
    {
        languageIdentifier: "go",
        entryFileName: "main.go",
        budgetMilliseconds: 90_000,
    },
    {
        languageIdentifier: "logo",
        entryFileName: "main.logo",
        budgetMilliseconds: 60_000,
    },
    {
        languageIdentifier: "gwbasic",
        entryFileName: "main.bas",
        budgetMilliseconds: 60_000,
    },
    {
        languageIdentifier: "sml",
        entryFileName: "main.sml",
        budgetMilliseconds: 120_000,
    },
    {
        languageIdentifier: "m6502",
        entryFileName: "main.6502",
        budgetMilliseconds: 60_000,
    },
    {
        languageIdentifier: "zig",
        entryFileName: "main.zig",
        budgetMilliseconds: 90_000,
    },
    {
        languageIdentifier: "swift",
        entryFileName: "main.swift",
        budgetMilliseconds: 120_000,
    },
    {
        languageIdentifier: "kotlin",
        entryFileName: "main.kt",
        budgetMilliseconds: 150_000,
    },
    {
        languageIdentifier: "dart",
        entryFileName: "main.dart",
        budgetMilliseconds: 120_000,
    },
    {
        languageIdentifier: "java",
        entryFileName: "Main.java",
        budgetMilliseconds: 180_000,
    },
    {
        languageIdentifier: "csharp",
        entryFileName: "Program.cs",
        budgetMilliseconds: 240_000,
    },
    {
        languageIdentifier: "assemblyscript",
        entryFileName: "main.as",
        budgetMilliseconds: 90_000,
    },
    {
        languageIdentifier: "ocaml",
        entryFileName: "main.ml",
        budgetMilliseconds: 150_000,
    },
    {
        languageIdentifier: "haskell",
        entryFileName: "main.hs",
        budgetMilliseconds: 150_000,
    },
    {
        languageIdentifier: "javascript",
        entryFileName: "main.js",
        budgetMilliseconds: 120_000,
    },
    {
        languageIdentifier: "typescript",
        entryFileName: "main.ts",
        budgetMilliseconds: 120_000,
    },
    {
        languageIdentifier: "sql",
        entryFileName: "main.sql",
        budgetMilliseconds: 120_000,
    },
    {
        languageIdentifier: "duckdb",
        entryFileName: "main.duckdb.sql",
        budgetMilliseconds: 300_000,
    },
    {
        languageIdentifier: "pglite",
        entryFileName: "main.pglite.sql",
        budgetMilliseconds: 300_000,
    },
    {
        languageIdentifier: "awk",
        entryFileName: "main.awk",
        budgetMilliseconds: 120_000,
    },
    {
        languageIdentifier: "jq",
        entryFileName: "main.jq",
        budgetMilliseconds: 120_000,
    },
    {
        languageIdentifier: "bash",
        entryFileName: "main.sh",
        budgetMilliseconds: 120_000,
    },
];
function isToolchainPendingMessage(message: string): boolean {
    return TOOLCHAIN_PENDING_PATTERNS.some((pattern) => pattern.test(message));
}
type FeatureStatus = "pass" | "fail" | "unsupported" | "pending";
interface CompatibilityMatrixRow {
    languageIdentifier: string;
    toolchain: "ready" | "pending";
    showcase: "pass" | "fail" | "pending";
    features: Record<string, FeatureStatus>;
    exportBytes: number;
    problems: Array<string>;
}
interface CompatibilityMatrixDocument {
    generatedAt: string;
    source: string;
    languages: ReadonlyArray<CompatibilityMatrixRow>;
}
function probeFeatureStatuses(
    probe: FeatureProbeDefinition,
    terminalText: string,
): Record<string, FeatureStatus> {
    const featureStatuses: Record<string, FeatureStatus> = {};
    const featureLineMarkers: ReadonlyArray<[FeatureName, string]> = [
        ["stdin", "greet:"],
        ["multiFile", "greet:"],
        ["arguments", "arg0:"],
        ["fileIo", "file:"],
    ];
    for (const [featureName, lineMarker] of featureLineMarkers) {
        if (probe.unsupportedFeatures.some((entry) => entry.feature === featureName)) {
            featureStatuses[featureName] = "unsupported";
            continue;
        }
        if (!probe.exercisedFeatures.includes(featureName)) {
            continue;
        }
        featureStatuses[featureName] = terminalText.includes(lineMarker) ? "pass" : "fail";
    }
    return featureStatuses;
}
interface VerificationOutcome {
    languageIdentifier: string;
    zipBytes: number;
    finished: boolean;
    problems: Array<string>;
    terminalText: string;
    artifactKind?: "zip" | "single-file";
}
function resolveChromeBinary(): string | undefined {
    return CHROME_CANDIDATES.find((candidate) => existsSync(candidate));
}
function contentTypeFor(relativePath: string): string {
    const finalDotIndex = relativePath.lastIndexOf(".");
    if (finalDotIndex < 0) {
        return "application/octet-stream";
    }
    return HOSTILE_CONTENT_TYPES[relativePath.slice(finalDotIndex)] ?? "application/octet-stream";
}
class DevToolsSession {
    private readonly socket: WebSocket;
    private readonly pendingCalls: Map<
        number,
        { resolve(value: unknown): void; reject(reason: Error): void }
    > = new Map();
    private readonly requestUrls: Map<string, string> = new Map();
    private nextCallId = 1;
    readonly browserProblems: Array<string> = [];
    readonly requestLog: Array<string> = [];
    private constructor(socket: WebSocket) {
        this.socket = socket;
    }
    static async connect(webSocketUrl: string): Promise<DevToolsSession> {
        const socket = new WebSocket(webSocketUrl);
        await new Promise<void>((resolveReady, rejectReady) => {
            socket.addEventListener("open", () => resolveReady(), { once: true });
            socket.addEventListener(
                "error",
                () => rejectReady(new Error("DevTools socket failed.")),
                {
                    once: true,
                },
            );
        });
        const session = new DevToolsSession(socket);
        socket.addEventListener("message", (messageEvent: MessageEvent) => {
            session.handleMessage(String(messageEvent.data));
        });
        return session;
    }
    call(
        method: string,
        params: Record<string, unknown> = {},
        sessionId?: string,
    ): Promise<unknown> {
        const callId = this.nextCallId++;
        const payload: Record<string, unknown> = { id: callId, method, params };
        if (sessionId) {
            payload["sessionId"] = sessionId;
        }
        return new Promise<unknown>((resolveCall, rejectCall) => {
            this.pendingCalls.set(callId, { resolve: resolveCall, reject: rejectCall });
            this.socket.send(JSON.stringify(payload));
        });
    }
    close(): void {
        this.socket.close();
    }
    private handleMessage(rawMessage: string): void {
        const message = JSON.parse(rawMessage) as {
            id?: number;
            method?: string;
            params?: Record<string, unknown>;
            result?: unknown;
            error?: { message: string };
        };
        if (typeof message.id === "number") {
            const pendingCall = this.pendingCalls.get(message.id);
            if (!pendingCall) {
                return;
            }
            this.pendingCalls.delete(message.id);
            if (message.error) {
                pendingCall.reject(new Error(message.error.message));
                return;
            }
            pendingCall.resolve(message.result);
            return;
        }
        this.recordProblem(message.method ?? "", message.params ?? {});
    }
    private recordProblem(method: string, params: Record<string, unknown>): void {
        if (method === "Runtime.exceptionThrown") {
            const details = params["exceptionDetails"] as {
                text?: string;
                exception?: { description?: string };
            };
            this.browserProblems.push(
                `uncaught exception: ${details?.exception?.description ?? details?.text ?? "unknown"}`,
            );
            return;
        }
        if (method === "Log.entryAdded") {
            const entry = params["entry"] as { level?: string; text?: string; source?: string };
            if (entry?.level === "error") {
                this.browserProblems.push(`console error: ${entry.text ?? "unknown"}`);
            }
            return;
        }
        if (method === "Runtime.consoleAPICalled" && params["type"] === "error") {
            const argumentList = params["args"] as Array<{ value?: unknown; description?: string }>;
            this.browserProblems.push(
                `console error: ${argumentList?.map((entry) => String(entry.value ?? entry.description)).join(" ") ?? "unknown"}`,
            );
            return;
        }
        if (method === "Network.requestWillBeSent") {
            const details = params as { requestId: string; request: { url: string } };
            this.requestUrls.set(details.requestId, details.request.url);
            this.requestLog.push(details.request.url);
            return;
        }
        if (method === "Network.loadingFailed") {
            const details = params as {
                requestId: string;
                type?: string;
                errorText?: string;
                blockedReason?: string;
            };
            if (details.type !== "Image") {
                const requestUrl = this.requestUrls.get(details.requestId) ?? "an unknown url";
                if (requestUrl.startsWith("data:") || requestUrl.startsWith("blob:")) {
                    return;
                }
                this.browserProblems.push(
                    `request failed (${details.type ?? "unknown"}): ${details.errorText ?? details.blockedReason ?? "unknown"} for ${requestUrl}`,
                );
            }
        }
    }
}
async function waitForHealth(): Promise<void> {
    for (let attempt = 0; attempt < 60; attempt += 1) {
        try {
            const response = await fetch(`http://127.0.0.1:${APP_PORT}/api/health`);
            if (response.ok) {
                return;
            }
        } catch {
            // The server is still binding its port.
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error("The application server never became healthy.");
}
async function waitForDebugger(): Promise<string> {
    for (let attempt = 0; attempt < 60; attempt += 1) {
        try {
            const response = await fetch(`http://127.0.0.1:${DEBUGGER_PORT}/json/version`);
            const payload = (await response.json()) as { webSocketDebuggerUrl?: string };
            if (payload.webSocketDebuggerUrl) {
                return payload.webSocketDebuggerUrl;
            }
        } catch {
            // The browser is still opening its debugging port.
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error("The browser never opened its debugging port.");
}
async function buildSessionFor(showcase: ShowcaseUnderTest): Promise<string> {
    const templateBytes = await readFile(`./userSourceTemplates/${showcase.entryFileName}`);
    const archiveBytes = zipSync({ [showcase.entryFileName]: new Uint8Array(templateBytes) });
    const formData = new FormData();
    formData.append(
        "archive",
        new File([archiveBytes], `${showcase.entryFileName}.zip`, { type: "application/zip" }),
    );
    formData.append("entry", showcase.entryFileName);
    const response = await fetch(`http://127.0.0.1:${APP_PORT}/api/session`, {
        method: "POST",
        body: formData,
        signal: AbortSignal.timeout(600_000),
    });
    const payload = (await response.json()) as {
        sessionIdentifier?: string;
        errorMessage?: string;
    };
    if (!payload.sessionIdentifier) {
        throw new Error(payload.errorMessage ?? "The session upload failed without an identifier.");
    }
    return payload.sessionIdentifier;
}
async function buildProbeSession(probe: FeatureProbeDefinition): Promise<string> {
    const archiveEntries: Record<string, Uint8Array> = {};
    const textEncoder = new TextEncoder();
    for (const [relativePath, fileContent] of Object.entries(probe.sourceFiles)) {
        archiveEntries[relativePath] = textEncoder.encode(fileContent);
    }
    const archiveBytes = zipSync(archiveEntries);
    const formData = new FormData();
    formData.append(
        "archive",
        new File([archiveBytes], `${probe.entryFileName}.zip`, { type: "application/zip" }),
    );
    formData.append("entry", probe.entryFileName);
    if (probe.programArguments.length > 0) {
        formData.append("args", probe.programArguments.join("\n"));
    }
    const response = await fetch(`http://127.0.0.1:${APP_PORT}/api/session`, {
        method: "POST",
        body: formData,
        signal: AbortSignal.timeout(600_000),
    });
    const payload = (await response.json()) as {
        sessionIdentifier?: string;
        errorMessage?: string;
    };
    if (!payload.sessionIdentifier) {
        throw new Error(payload.errorMessage ?? "The probe upload failed without an identifier.");
    }
    return payload.sessionIdentifier;
}
async function fetchExportArchive(sessionIdentifier: string): Promise<Uint8Array> {
    const response = await fetch(`http://127.0.0.1:${APP_PORT}/api/export/${sessionIdentifier}`, {
        signal: AbortSignal.timeout(600_000),
    });
    if (!response.ok) {
        const failure = (await response.json()) as { errorMessage?: string };
        throw new Error(failure.errorMessage ?? `Export request failed with ${response.status}.`);
    }
    return new Uint8Array(await response.arrayBuffer());
}
async function fetchSingleFileExport(sessionIdentifier: string): Promise<string> {
    const response = await fetch(
        `http://127.0.0.1:${APP_PORT}/api/export/${sessionIdentifier}?format=html`,
        { signal: AbortSignal.timeout(600_000) },
    );
    if (!response.ok) {
        const failure = (await response.json()) as { errorMessage?: string };
        throw new Error(
            failure.errorMessage ?? `Single-file export request failed with ${response.status}.`,
        );
    }
    const responseContentType = response.headers.get("content-type") ?? "";
    if (!responseContentType.startsWith("text/html")) {
        throw new Error(
            `Single-file export returned content-type ${responseContentType || "unknown"}.`,
        );
    }
    return await response.text();
}
async function stageSingleFileExport(directoryName: string, htmlText: string): Promise<void> {
    const languageDirectory = join(VERIFICATION_ROOT, directoryName);
    await rm(languageDirectory, { recursive: true, force: true });
    await mkdir(languageDirectory, { recursive: true });
    await writeFile(join(languageDirectory, "index.html"), htmlText);
}
async function stageExportArchive(directoryName: string, archiveBytes: Uint8Array): Promise<void> {
    const languageDirectory = join(VERIFICATION_ROOT, directoryName);
    await rm(languageDirectory, { recursive: true, force: true });
    await mkdir(languageDirectory, { recursive: true });
    const entries = unzipSync(archiveBytes);
    for (const [relativePath, contents] of Object.entries(entries)) {
        const targetPath = join(languageDirectory, relativePath);
        await mkdir(join(targetPath, ".."), { recursive: true });
        await writeFile(targetPath, contents);
    }
}
async function readTerminalText(devTools: DevToolsSession, sessionId: string): Promise<string> {
    const evaluation = (await devTools.call(
        "Runtime.evaluate",
        { expression: "document.body.innerText", returnByValue: true },
        sessionId,
    )) as { result?: { value?: string } };
    return evaluation.result?.value ?? "";
}
async function sendEnterKey(devTools: DevToolsSession, sessionId: string): Promise<void> {
    const keyEvent = {
        windowsVirtualKeyCode: 13,
        nativeVirtualKeyCode: 13,
        key: "Enter",
        code: "Enter",
        keyCode: 13,
    };
    await devTools.call("Input.dispatchKeyEvent", { type: "rawKeyDown", ...keyEvent }, sessionId);
    await devTools.call(
        "Input.dispatchKeyEvent",
        { type: "char", text: "\r", ...keyEvent },
        sessionId,
    );
    await devTools.call("Input.dispatchKeyEvent", { type: "keyUp", ...keyEvent }, sessionId);
}
async function verifyShowcaseInBrowser(
    devTools: DevToolsSession,
    showcase: ShowcaseUnderTest,
    pageUrl: string,
    trackNetworkRequests: boolean = false,
): Promise<VerificationOutcome> {
    const problems: Array<string> = [];
    const targetCreation = (await devTools.call("Target.createTarget", {
        url: "about:blank",
    })) as { targetId: string };
    const attachment = (await devTools.call("Target.attachToTarget", {
        targetId: targetCreation.targetId,
        flatten: true,
    })) as { sessionId: string };
    const sessionId = attachment.sessionId;
    await devTools.call("Page.enable", {}, sessionId);
    await devTools.call("Runtime.enable", {}, sessionId);
    await devTools.call("Log.enable", {}, sessionId);
    await devTools.call("Network.enable", {}, sessionId);
    const problemBaseline = devTools.browserProblems.length;
    const requestBaseline = devTools.requestLog.length;
    await devTools.call("Page.navigate", { url: pageUrl }, sessionId);
    const deadline = Date.now() + showcase.budgetMilliseconds;
    let terminalText = "";
    let enterPresses = 0;
    let lastTerminalText = "";
    let lastChangeAt = Date.now();
    while (Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 400));
        terminalText = await readTerminalText(devTools, sessionId);
        if (terminalText.includes("Showcase complete.")) {
            break;
        }
        if (terminalText !== lastTerminalText) {
            lastTerminalText = terminalText;
            lastChangeAt = Date.now();
        } else if (enterPresses < 4 && Date.now() - lastChangeAt > 1500) {
            enterPresses += 1;
            lastChangeAt = Date.now();
            await sendEnterKey(devTools, sessionId);
        }
    }
    const finished = terminalText.includes("Showcase complete.");
    if (!finished) {
        problems.push("the showcase never reached its final line");
    }
    if (terminalText.includes("Error:")) {
        problems.push(`the terminal reported an error: ${firstMeaningfulLine(terminalText)}`);
    }
    if (trackNetworkRequests) {
        for (const requestUrl of devTools.requestLog.slice(requestBaseline)) {
            if (!requestUrl.startsWith("http:") && !requestUrl.startsWith("https:")) {
                continue;
            }
            if (requestUrl === pageUrl) {
                continue;
            }
            problems.push(`the single-file export requested an external asset: ${requestUrl}`);
        }
    }
    for (const problem of devTools.browserProblems.slice(problemBaseline)) {
        problems.push(problem);
    }
    await devTools.call("Target.closeTarget", { targetId: targetCreation.targetId });
    return {
        languageIdentifier: showcase.languageIdentifier,
        zipBytes: 0,
        finished,
        problems,
        terminalText,
    };
}
function firstMeaningfulLine(terminalText: string): string {
    const errorLine = terminalText
        .split("\n")
        .map((line) => line.trim())
        .find((line) => line.startsWith("Error:"));
    return errorLine ?? "unknown error";
}
async function sendText(devTools: DevToolsSession, sessionId: string, text: string): Promise<void> {
    for (const character of text) {
        const virtualKeyCode = character.toUpperCase().charCodeAt(0);
        await devTools.call(
            "Input.dispatchKeyEvent",
            {
                type: "char",
                text: character,
                unmodifiedText: character,
                key: character,
                code: "",
                windowsVirtualKeyCode: virtualKeyCode,
                nativeVirtualKeyCode: virtualKeyCode,
                keyCode: virtualKeyCode,
            },
            sessionId,
        );
    }
}
async function verifyProbeInBrowser(
    devTools: DevToolsSession,
    probe: FeatureProbeDefinition,
    directoryName: string,
    budgetMilliseconds: number,
): Promise<{ terminalText: string; problems: Array<string> }> {
    const problems: Array<string> = [];
    const targetCreation = (await devTools.call("Target.createTarget", {
        url: "about:blank",
    })) as { targetId: string };
    const attachment = (await devTools.call("Target.attachToTarget", {
        targetId: targetCreation.targetId,
        flatten: true,
    })) as { sessionId: string };
    const sessionId = attachment.sessionId;
    await devTools.call("Page.enable", {}, sessionId);
    await devTools.call("Runtime.enable", {}, sessionId);
    await devTools.call("Log.enable", {}, sessionId);
    await devTools.call("Network.enable", {}, sessionId);
    const problemBaseline = devTools.browserProblems.length;
    await devTools.call(
        "Page.navigate",
        { url: `http://127.0.0.1:${HOST_PORT}/${directoryName}/index.html` },
        sessionId,
    );
    const deadline = Date.now() + budgetMilliseconds;
    let terminalText = "";
    let lastTerminalText = "";
    let lastChangeAt = Date.now();
    let answersSent = 0;
    while (Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 400));
        terminalText = await readTerminalText(devTools, sessionId);
        if (terminalText.includes("PROBE-DONE")) {
            break;
        }
        if (terminalText !== lastTerminalText) {
            lastTerminalText = terminalText;
            lastChangeAt = Date.now();
            continue;
        }
        if (Date.now() - lastChangeAt > 1500) {
            if (answersSent < probe.terminalAnswers.length) {
                const answerText = probe.terminalAnswers[answersSent] as string;
                answersSent += 1;
                let answerEchoed = false;
                for (let typingAttempt = 0; typingAttempt < 3 && !answerEchoed; typingAttempt++) {
                    await sendText(devTools, sessionId, answerText);
                    await new Promise((resolve) => setTimeout(resolve, 350));
                    const echoCheckText = await readTerminalText(devTools, sessionId);
                    answerEchoed = echoCheckText.includes(answerText);
                }
                await sendEnterKey(devTools, sessionId);
            } else if (answersSent < probe.terminalAnswers.length + 2) {
                answersSent += 1;
                await sendEnterKey(devTools, sessionId);
            } else {
                break;
            }
            lastChangeAt = Date.now();
        }
    }
    if (!terminalText.includes("PROBE-DONE")) {
        problems.push("the probe never reached its final line");
    }
    if (terminalText.includes("Error:")) {
        problems.push(`the terminal reported an error: ${firstMeaningfulLine(terminalText)}`);
    }
    for (const expectedLine of probe.expectedLines) {
        if (!terminalText.includes(expectedLine)) {
            problems.push(`missing expected line: ${expectedLine}`);
        }
    }
    for (const problem of devTools.browserProblems.slice(problemBaseline)) {
        problems.push(problem);
    }
    await devTools.call("Target.closeTarget", { targetId: targetCreation.targetId });
    return { terminalText, problems };
}
class HostileStaticHost {
    private readonly server: Server;
    private constructor(server: Server) {
        this.server = server;
    }
    static async start(port: number): Promise<HostileStaticHost> {
        const staticHost = new HostileStaticHost(createServer());
        staticHost.server.on("request", (request, response) => {
            void staticHost.respond(request, response);
        });
        await new Promise<void>((resolveListening, rejectListening) => {
            staticHost.server.once("listening", () => resolveListening());
            staticHost.server.once("error", (listenError: Error) => rejectListening(listenError));
            staticHost.server.listen(port);
        });
        return staticHost;
    }
    stop(): void {
        this.server.close();
        this.server.closeAllConnections();
    }
    private async respond(request: IncomingMessage, response: ServerResponse): Promise<void> {
        const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
        const relativePath = decodeURIComponent(requestUrl.pathname).replace(/^\/+/, "");
        const resolvedPath = relativePath.length === 0 ? "index.html" : relativePath;
        const absolutePath = resolve(VERIFICATION_ROOT, resolvedPath);
        const pathFromRoot = relative(VERIFICATION_ROOT, absolutePath);
        if (pathFromRoot.startsWith("..") || isAbsolute(pathFromRoot)) {
            response.writeHead(403).end("Forbidden");
            return;
        }
        const assetBytes = await readFile(absolutePath).catch(() => undefined);
        if (!assetBytes) {
            response.writeHead(404).end("Not found");
            return;
        }
        response.writeHead(200, {
            "content-type": contentTypeFor(resolvedPath),
            "x-content-type-options": "nosniff",
        });
        response.end(assetBytes);
    }
}
const chromeBinary = resolveChromeBinary();
if (!chromeBinary) {
    scopedLogger.logSuccess(
        "No Chrome or Edge binary was found, so the browser verification was skipped.",
    );
    process.exit(0);
}
await rm(VERIFICATION_ROOT, { recursive: true, force: true });
await mkdir(VERIFICATION_ROOT, { recursive: true });
const serverLogLines: Array<string> = [];
function drainIntoLog(text: string): void {
    for (const line of text.split("\n")) {
        if (line.trim().length === 0) {
            continue;
        }
        serverLogLines.push(line);
        if (serverLogLines.length > 200) {
            serverLogLines.shift();
        }
    }
}
async function drainProcessOutput(stream: Readable | null): Promise<void> {
    if (!stream) {
        return;
    }
    const collectedChunks: Array<Buffer> = [];
    for await (const chunk of stream) {
        collectedChunks.push(chunk as Buffer);
    }
    drainIntoLog(Buffer.concat(collectedChunks).toString("utf8"));
}
const applicationServerEntry = process.env.VERIFY_SERVER_ENTRY ?? "dist/server/ServerEntryPoint.js";
const applicationServer = spawn(
    process.execPath,
    applicationServerEntry.endsWith(".ts")
        ? ["node_modules/tsx/dist/cli.mjs", applicationServerEntry]
        : [applicationServerEntry],
    {
        env: {
            ...process.env,
            PORT: String(APP_PORT),
            SESSION_UPLOADS_PER_MINUTE: "1000",
        } as Record<string, string>,
        stdio: ["ignore", "pipe", "pipe"],
    },
);
const serverLogPump = Promise.all([
    drainProcessOutput(applicationServer.stdout),
    drainProcessOutput(applicationServer.stderr),
]);
const staticHost = await HostileStaticHost.start(HOST_PORT);
const browser = spawn(
    chromeBinary,
    [
        "--headless=new",
        "--disable-gpu",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-extensions",
        "--user-data-dir=" + join(VERIFICATION_ROOT, "browser-profile"),
        `--remote-debugging-port=${DEBUGGER_PORT}`,
        "about:blank",
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
);
const outcomes: Array<VerificationOutcome> = [];
const matrixRows: Array<CompatibilityMatrixRow> = [];
try {
    await waitForHealth();
    const devTools = await DevToolsSession.connect(await waitForDebugger());
    for (const showcase of SHOWCASES.filter((candidate) =>
        languageFilter.length === 0 ? true : candidate.languageIdentifier === languageFilter,
    )) {
        const probe = FEATURE_PROBES.find(
            (candidate) => candidate.languageIdentifier === showcase.languageIdentifier,
        );
        const matrixRow: CompatibilityMatrixRow = {
            languageIdentifier: showcase.languageIdentifier,
            toolchain: "ready",
            showcase: "fail",
            features: {},
            exportBytes: 0,
            problems: [],
        };
        if (probe) {
            for (const featureName of ["stdin", "arguments", "fileIo", "multiFile"] as const) {
                matrixRow.features[featureName] = "pending";
            }
        }
        let activeStep = "upload";
        try {
            const sessionIdentifier = await buildSessionFor(showcase);
            activeStep = "export";
            const archiveBytes = await fetchExportArchive(sessionIdentifier);
            matrixRow.exportBytes = archiveBytes.byteLength;
            activeStep = "stage";
            await stageExportArchive(showcase.languageIdentifier, archiveBytes);
            activeStep = "browser";
            const outcome = await verifyShowcaseInBrowser(
                devTools,
                showcase,
                `http://127.0.0.1:${HOST_PORT}/${showcase.languageIdentifier}/index.html`,
            );
            outcome.zipBytes = archiveBytes.byteLength;
            outcomes.push(outcome);
            matrixRow.showcase = outcome.problems.length === 0 ? "pass" : "fail";
            matrixRow.problems = [...outcome.problems];
            activeStep = "single-file export";
            const singleFileHtmlText = await fetchSingleFileExport(sessionIdentifier);
            activeStep = "single-file stage";
            const singleFileDirectoryName = `${showcase.languageIdentifier}-singlefile`;
            await stageSingleFileExport(singleFileDirectoryName, singleFileHtmlText);
            activeStep = "single-file browser";
            const singleFileOutcome = await verifyShowcaseInBrowser(
                devTools,
                showcase,
                `http://127.0.0.1:${HOST_PORT}/${singleFileDirectoryName}/index.html`,
                true,
            );
            singleFileOutcome.zipBytes = Buffer.byteLength(singleFileHtmlText, "utf8");
            singleFileOutcome.artifactKind = "single-file";
            outcomes.push(singleFileOutcome);
            for (const problem of singleFileOutcome.problems) {
                matrixRow.problems.push(`single-file: ${problem}`);
            }
            if (probe) {
                const probeDirectoryName = `${showcase.languageIdentifier}-probe`;
                activeStep = "probe upload";
                const probeSessionIdentifier = await buildProbeSession(probe);
                activeStep = "probe export";
                const probeArchiveBytes = await fetchExportArchive(probeSessionIdentifier);
                activeStep = "probe stage";
                await stageExportArchive(probeDirectoryName, probeArchiveBytes);
                activeStep = "probe browser";
                const probeResult = await verifyProbeInBrowser(
                    devTools,
                    probe,
                    probeDirectoryName,
                    showcase.budgetMilliseconds,
                );
                matrixRow.features = probeFeatureStatuses(probe, probeResult.terminalText);
                for (const problem of probeResult.problems) {
                    matrixRow.problems.push(`probe: ${problem}`);
                }
                if (probeResult.problems.length > 0) {
                    outcomes.push({
                        languageIdentifier: `${showcase.languageIdentifier} probe`,
                        zipBytes: probeArchiveBytes.byteLength,
                        finished: probeResult.terminalText.includes("PROBE-DONE"),
                        problems: probeResult.problems,
                        terminalText: probeResult.terminalText,
                    });
                }
            }
        } catch (verificationError) {
            const errorMessage =
                verificationError instanceof Error
                    ? verificationError.message
                    : String(verificationError);
            if (isToolchainPendingMessage(errorMessage)) {
                matrixRow.toolchain = "pending";
                matrixRow.showcase = "pending";
                matrixRow.features = {
                    stdin: "pending",
                    arguments: "pending",
                    fileIo: "pending",
                    multiFile: "pending",
                };
                scopedLogger.logSuccess(
                    `${showcase.languageIdentifier}: toolchain pending, skipped (${errorMessage.slice(0, 140)}).`,
                );
            } else {
                matrixRow.problems.push(`${activeStep} step failed: ${errorMessage}`);
                outcomes.push({
                    languageIdentifier: showcase.languageIdentifier,
                    zipBytes: 0,
                    finished: false,
                    problems: [...matrixRow.problems],
                    terminalText: "",
                });
            }
        }
        matrixRows.push(matrixRow);
    }
    devTools.close();
} finally {
    applicationServer.kill();
    browser.kill();
    staticHost.stop();
    await serverLogPump.catch(() => undefined);
}
const matrixDocument: CompatibilityMatrixDocument = {
    generatedAt: new Date().toISOString(),
    source: "verify:export",
    languages: matrixRows,
};
const matrixPath = join(process.cwd(), "compatibility-matrix.json");
let mergedMatrixDocument = matrixDocument;
try {
    const existingMatrix = JSON.parse(await readFile(matrixPath, "utf8")) as {
        languages?: ReadonlyArray<CompatibilityMatrixRow>;
    };
    if (existingMatrix.languages && languageFilter.length > 0) {
        const verifiedIdentifiers = new Set(
            matrixRows.map((matrixRow) => matrixRow.languageIdentifier),
        );
        mergedMatrixDocument = {
            ...matrixDocument,
            languages: [
                ...matrixRows,
                ...existingMatrix.languages.filter(
                    (existingRow) => !verifiedIdentifiers.has(existingRow.languageIdentifier),
                ),
            ],
        };
    }
} catch {}
await writeFile(matrixPath, JSON.stringify(mergedMatrixDocument, null, 4) + "\n");
await new Promise<void>((resolveFormat) => {
    const formatterProcess = spawn(
        process.execPath,
        ["node_modules/oxfmt/bin/oxfmt", matrixPath],
        { stdio: "ignore" },
    );
    formatterProcess.once("close", () => resolveFormat());
    formatterProcess.once("error", () => resolveFormat());
});
let failureCount = 0;
for (const outcome of outcomes) {
    const sizeInKilobytes = Math.round(outcome.zipBytes / 1024);
    const artifactLabel = outcome.artifactKind === "single-file" ? "single file" : "export zip";
    if (outcome.problems.length === 0) {
        scopedLogger.logSuccess(
            `${outcome.languageIdentifier}: clean run, ${artifactLabel} ${sizeInKilobytes} KB`,
        );
        continue;
    }
    failureCount += 1;
    scopedLogger.logError(
        `${outcome.languageIdentifier}: ${outcome.problems.length} problem(s), ${artifactLabel} ${sizeInKilobytes} KB`,
    );
    for (const problem of outcome.problems) {
        scopedLogger.logError(`  ${problem}`);
    }
    const terminalPreview = outcome.terminalText.split("\n").slice(-14).join(" | ");
    if (terminalPreview.length > 0) {
        scopedLogger.logError(`  terminal tail: ${terminalPreview}`);
    }
    const relevantServerLogs = serverLogLines.filter((line) =>
        line.includes(outcome.languageIdentifier),
    );
    for (const serverLogLine of relevantServerLogs.slice(-6)) {
        scopedLogger.logError(`  server log: ${serverLogLine.slice(0, 300)}`);
    }
}
if (failureCount > 0) {
    scopedLogger.logError(`${failureCount} showcase(s) failed on the hostile static host.`);
    process.exit(1);
}
scopedLogger.logSuccess("Every verified export ran clean on a hostile static host.");
for (const matrixRow of matrixRows) {
    const featureSummary = Object.entries(matrixRow.features)
        .map(([featureName, featureStatus]) => `${featureName}:${featureStatus}`)
        .join(" ");
    scopedLogger.logInformation(
        `${matrixRow.languageIdentifier}: showcase ${matrixRow.showcase} (${Math.round(matrixRow.exportBytes / 1024)} KB) ${featureSummary}`,
    );
}
scopedLogger.logSuccess("Compatibility matrix written to compatibility-matrix.json.");
