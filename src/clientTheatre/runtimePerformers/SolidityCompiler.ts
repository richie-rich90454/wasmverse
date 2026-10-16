interface SolidityWorkerLoadedReply {
    requestIdentifier: number;
    kind: "loaded";
    version: string;
}
interface SolidityWorkerCompiledReply {
    requestIdentifier: number;
    kind: "compiled";
    outputJson: string;
}
interface SolidityWorkerFailedReply {
    requestIdentifier: number;
    kind: "failed";
    message: string;
}
type SolidityWorkerReply =
    | SolidityWorkerLoadedReply
    | SolidityWorkerCompiledReply
    | SolidityWorkerFailedReply;
type SolidityWorkerSuccessReply = SolidityWorkerLoadedReply | SolidityWorkerCompiledReply;
type SolidityWorkerRequest =
    | { kind: "load"; soljsonScriptUrl: string }
    | { kind: "compile"; inputJson: string; entryRelativePath: string };
interface SolidityCompilerInstance {
    version: string;
    compileStandardJson(inputJson: string, entryRelativePath: string): Promise<string>;
}
interface SolidityPendingReply {
    resolve: (reply: SolidityWorkerSuccessReply) => void;
    reject: (failureReason: Error) => void;
}
async function loadSolidityCompiler(
    workerScriptUrl: string,
    soljsonScriptUrl: string,
): Promise<SolidityCompilerInstance> {
    const worker = new Worker(workerScriptUrl);
    const pendingReplies = new Map<number, SolidityPendingReply>();
    let nextRequestIdentifier = 1;
    worker.addEventListener("message", (messageEvent: MessageEvent<SolidityWorkerReply>) => {
        const reply = messageEvent.data;
        const pendingReply = pendingReplies.get(reply.requestIdentifier);
        if (!pendingReply) {
            return;
        }
        pendingReplies.delete(reply.requestIdentifier);
        if (reply.kind === "failed") {
            pendingReply.reject(new Error(reply.message));
            return;
        }
        pendingReply.resolve(reply);
    });
    worker.addEventListener("error", (workerErrorEvent: ErrorEvent) => {
        const failureReason = new Error(
            workerErrorEvent.message || "the Solidity compiler worker failed",
        );
        for (const pendingReply of pendingReplies.values()) {
            pendingReply.reject(failureReason);
        }
        pendingReplies.clear();
    });
    const sendRequest = <Reply extends SolidityWorkerSuccessReply>(
        request: SolidityWorkerRequest,
    ): Promise<Reply> => {
        const requestIdentifier = nextRequestIdentifier;
        nextRequestIdentifier += 1;
        return new Promise<Reply>((resolveReply, rejectReply) => {
            pendingReplies.set(requestIdentifier, {
                resolve: (reply) => resolveReply(reply as Reply),
                reject: rejectReply,
            });
            worker.postMessage({ ...request, requestIdentifier });
        });
    };
    const loadedReply = await sendRequest<SolidityWorkerLoadedReply>({
        kind: "load",
        soljsonScriptUrl,
    });
    return {
        version: loadedReply.version,
        async compileStandardJson(inputJson: string, entryRelativePath: string): Promise<string> {
            const compiledReply = await sendRequest<SolidityWorkerCompiledReply>({
                kind: "compile",
                inputJson,
                entryRelativePath,
            });
            return compiledReply.outputJson;
        },
    };
}
export { loadSolidityCompiler };
export type { SolidityCompilerInstance };
