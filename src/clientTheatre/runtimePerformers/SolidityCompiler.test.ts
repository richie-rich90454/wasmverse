import { afterEach, describe, expect, test } from "vitest";
import { loadSolidityCompiler } from "@clientTheatre/runtimePerformers/SolidityCompiler.ts";
interface FakeWorkerRequestRecord {
    kind: string;
    requestIdentifier: number;
    soljsonScriptUrl?: string;
    inputJson?: string;
    entryRelativePath?: string;
}
class FakeWorker {
    static instances: Array<FakeWorker> = [];
    static responder: ((worker: FakeWorker, request: FakeWorkerRequestRecord) => void) | undefined;
    readonly scriptUrl: string;
    readonly recordedRequests: Array<FakeWorkerRequestRecord> = [];
    private readonly listeners = new Map<string, Array<(event: unknown) => void>>();
    constructor(scriptUrl: string) {
        this.scriptUrl = scriptUrl;
        FakeWorker.instances.push(this);
    }
    addEventListener(type: string, listener: (event: unknown) => void): void {
        const listeners = this.listeners.get(type) ?? [];
        listeners.push(listener);
        this.listeners.set(type, listeners);
    }
    postMessage(request: FakeWorkerRequestRecord): void {
        this.recordedRequests.push(request);
        FakeWorker.responder?.(this, request);
    }
    emitMessage(reply: unknown): void {
        for (const listener of this.listeners.get("message") ?? []) {
            listener({ data: reply });
        }
    }
    emitError(message: string): void {
        for (const listener of this.listeners.get("error") ?? []) {
            listener({ message });
        }
    }
    static reset(): void {
        FakeWorker.instances = [];
        FakeWorker.responder = undefined;
    }
}
function installFakeWorker(): void {
    (globalThis as Record<string, unknown>).Worker = FakeWorker;
}
function respondToLoad(worker: FakeWorker, request: FakeWorkerRequestRecord): boolean {
    if (request.kind !== "load") {
        return false;
    }
    worker.emitMessage({
        requestIdentifier: request.requestIdentifier,
        kind: "loaded",
        version: "0.8.37+fake",
    });
    return true;
}
afterEach(() => {
    FakeWorker.reset();
    delete (globalThis as Record<string, unknown>).Worker;
});
describe("loadSolidityCompiler", () => {
    test("loads the worker and resolves the compiler version", async () => {
        installFakeWorker();
        FakeWorker.responder = (worker, request) => {
            respondToLoad(worker, request);
        };
        const compiler = await loadSolidityCompiler(
            "https://example.test/solc-worker.js",
            "https://example.test/soljson.js",
        );
        expect(compiler.version).toBe("0.8.37+fake");
        const worker = FakeWorker.instances[0] as FakeWorker;
        expect(worker.scriptUrl).toBe("https://example.test/solc-worker.js");
        expect(worker.recordedRequests[0]?.soljsonScriptUrl).toBe(
            "https://example.test/soljson.js",
        );
    });
    test("sends compile requests and resolves the standard json output", async () => {
        installFakeWorker();
        FakeWorker.responder = (worker, request) => {
            if (respondToLoad(worker, request)) {
                return;
            }
            worker.emitMessage({
                requestIdentifier: request.requestIdentifier,
                kind: "compiled",
                outputJson: '{"compiled":true}',
            });
        };
        const compiler = await loadSolidityCompiler("worker.js", "soljson.js");
        const outputJson = await compiler.compileStandardJson(
            '{"language":"Solidity"}',
            "main.sol",
        );
        expect(outputJson).toBe('{"compiled":true}');
        const worker = FakeWorker.instances[0] as FakeWorker;
        const compileRequest = worker.recordedRequests.find(
            (request) => request.kind === "compile",
        );
        expect(compileRequest?.inputJson).toBe('{"language":"Solidity"}');
        expect(compileRequest?.entryRelativePath).toBe("main.sol");
    });
    test("rejects when the worker reports a failure", async () => {
        installFakeWorker();
        FakeWorker.responder = (worker, request) => {
            worker.emitMessage({
                requestIdentifier: request.requestIdentifier,
                kind: "failed",
                message: "solidity compilation failed",
            });
        };
        await expect(loadSolidityCompiler("worker.js", "soljson.js")).rejects.toThrow(
            "solidity compilation failed",
        );
    });
    test("rejects pending requests when the worker crashes", async () => {
        installFakeWorker();
        FakeWorker.responder = (worker, request) => {
            respondToLoad(worker, request);
        };
        const compiler = await loadSolidityCompiler("worker.js", "soljson.js");
        const worker = FakeWorker.instances[0] as FakeWorker;
        const compilePromise = compiler.compileStandardJson("{}", "main.sol");
        worker.emitError("worker crashed");
        await expect(compilePromise).rejects.toThrow("worker crashed");
    });
});
