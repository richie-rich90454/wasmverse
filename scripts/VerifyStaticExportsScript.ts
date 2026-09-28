import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { unzipSync, zipSync } from "fflate";
import { ScopedLogger } from "@serverAtelier/ScopedLogger.ts";
const scopedLogger = new ScopedLogger("VerifyStaticExports");
const languageFilter = process.argv[2] ?? "";
const APP_PORT = 3987;
const HOST_PORT = 3988;
const DEBUGGER_PORT = 9333;
const VERIFICATION_ROOT = join(tmpdir(), "wasmverse-export-verification");
const CHROME_CANDIDATES = [
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
const SHOWCASES: ReadonlyArray<ShowcaseUnderTest> = [
    {
        languageIdentifier: "python",
        entryFileName: "main.py",
        budgetMilliseconds: 150_000,
    },
    {
        languageIdentifier: "ruby",
        entryFileName: "main.rb",
        budgetMilliseconds: 150_000,
    },
    {
        languageIdentifier: "lua",
        entryFileName: "main.lua",
        budgetMilliseconds: 90_000,
    },
    {
        languageIdentifier: "php",
        entryFileName: "main.php",
        budgetMilliseconds: 120_000,
    },
    {
        languageIdentifier: "rust",
        entryFileName: "main.rs",
        budgetMilliseconds: 180_000,
    },
    {
        languageIdentifier: "go",
        entryFileName: "main.go",
        budgetMilliseconds: 90_000,
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
        languageIdentifier: "assemblyscript",
        entryFileName: "main.ts",
        budgetMilliseconds: 90_000,
    },
];
interface VerificationOutcome {
    languageIdentifier: string;
    zipBytes: number;
    finished: boolean;
    problems: Array<string>;
    terminalText: string;
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
        await Bun.sleep(500);
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
        await Bun.sleep(500);
    }
    throw new Error("The browser never opened its debugging port.");
}
async function buildSessionFor(showcase: ShowcaseUnderTest): Promise<string> {
    const templateBytes = await Bun.file(
        `./userSourceTemplates/${showcase.entryFileName}`,
    ).arrayBuffer();
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
async function stageExportArchive(
    showcase: ShowcaseUnderTest,
    archiveBytes: Uint8Array,
): Promise<void> {
    const languageDirectory = join(VERIFICATION_ROOT, showcase.languageIdentifier);
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
    await devTools.call(
        "Page.navigate",
        { url: `http://127.0.0.1:${HOST_PORT}/${showcase.languageIdentifier}/index.html` },
        sessionId,
    );
    const deadline = Date.now() + showcase.budgetMilliseconds;
    let terminalText = "";
    let enterPresses = 0;
    let lastTerminalText = "";
    let lastChangeAt = Date.now();
    while (Date.now() < deadline) {
        await Bun.sleep(400);
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
function startHostileStaticHost(): ReturnType<typeof Bun.serve<unknown>> {
    return Bun.serve({
        port: HOST_PORT,
        async fetch(request: Request): Promise<Response> {
            const requestUrl = new URL(request.url);
            const relativePath = decodeURIComponent(requestUrl.pathname).replace(/^\/+/, "");
            const resolvedPath = relativePath.length === 0 ? "index.html" : relativePath;
            const absolutePath = join(VERIFICATION_ROOT, resolvedPath);
            if (!absolutePath.startsWith(VERIFICATION_ROOT)) {
                return new Response("Forbidden", { status: 403 });
            }
            const assetFile = Bun.file(absolutePath);
            if (!(await assetFile.exists())) {
                return new Response("Not found", { status: 404 });
            }
            return new Response(assetFile, {
                headers: {
                    "content-type": contentTypeFor(resolvedPath),
                    "x-content-type-options": "nosniff",
                },
            });
        },
    });
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
async function drainProcessOutput(stream: ReadableStream<Uint8Array> | undefined): Promise<void> {
    if (!stream) {
        return;
    }
    drainIntoLog(await new Response(stream).text());
}
const applicationServer = Bun.spawn(["bun", "dist/server/ServerEntryPoint.js"], {
    env: { ...process.env, PORT: String(APP_PORT) } as Record<string, string>,
    stdout: "pipe",
    stderr: "pipe",
});
const serverLogPump = Promise.all([
    drainProcessOutput(applicationServer.stdout),
    drainProcessOutput(applicationServer.stderr),
]);
const staticHost = startHostileStaticHost();
const browser = Bun.spawn(
    [
        chromeBinary,
        "--headless=new",
        "--disable-gpu",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-extensions",
        "--user-data-dir=" + join(VERIFICATION_ROOT, "browser-profile"),
        `--remote-debugging-port=${DEBUGGER_PORT}`,
        "about:blank",
    ],
    { stdout: "pipe", stderr: "pipe" },
);
const outcomes: Array<VerificationOutcome> = [];
try {
    await waitForHealth();
    const devTools = await DevToolsSession.connect(await waitForDebugger());
    for (const showcase of SHOWCASES.filter((candidate) =>
        languageFilter.length === 0 ? true : candidate.languageIdentifier === languageFilter,
    )) {
        let activeStep = "upload";
        try {
            const sessionIdentifier = await buildSessionFor(showcase);
            activeStep = "export";
            const archiveBytes = await fetchExportArchive(sessionIdentifier);
            activeStep = "stage";
            await stageExportArchive(showcase, archiveBytes);
            activeStep = "browser";
            const outcome = await verifyShowcaseInBrowser(devTools, showcase);
            outcome.zipBytes = archiveBytes.byteLength;
            outcomes.push(outcome);
        } catch (verificationError) {
            outcomes.push({
                languageIdentifier: showcase.languageIdentifier,
                zipBytes: 0,
                finished: false,
                problems: [
                    `${activeStep} step failed: ${verificationError instanceof Error ? verificationError.message : String(verificationError)}`,
                ],
                terminalText: "",
            });
        }
    }
    devTools.close();
} finally {
    applicationServer.kill();
    browser.kill();
    staticHost.stop(true);
    await serverLogPump.catch(() => undefined);
}
let failureCount = 0;
for (const outcome of outcomes) {
    const sizeInKilobytes = Math.round(outcome.zipBytes / 1024);
    if (outcome.problems.length === 0) {
        scopedLogger.logSuccess(
            `${outcome.languageIdentifier}: clean run, export zip ${sizeInKilobytes} KB`,
        );
        continue;
    }
    failureCount += 1;
    scopedLogger.logError(
        `${outcome.languageIdentifier}: ${outcome.problems.length} problem(s), export zip ${sizeInKilobytes} KB`,
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
