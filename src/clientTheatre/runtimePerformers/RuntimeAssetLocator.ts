import { gunzipSync } from "fflate";
interface RuntimeAssetLocator {
    resolveAssetUrl(relativePath: string): string;
}
type EmbeddedAssetMap = Record<string, string>;
const EMBEDDED_ASSETS_GLOBAL_NAME = "__WASMVERSE_EMBEDDED_ASSETS__";
const EMBEDDED_RESOLVER_GLOBAL_NAME = "__WASMVERSE_RESOLVE_EMBEDDED_ASSET__";
const EMBEDDED_FETCH_BRIDGE_GLOBAL_NAME = "__WASMVERSE_EMBEDDED_FETCH_BRIDGE__";
// ponytail: textual specifier rewrite, switch to a parser if glue assets ever ship non-ESM relative imports
const RELATIVE_MODULE_SPECIFIER_PATTERN =
    /((?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)["'])(\.{1,2}\/[^"']+)(["'])/g;
function readEmbeddedAssetMap(): EmbeddedAssetMap | undefined {
    const candidateAssetMap = (globalThis as Record<string, unknown>)[EMBEDDED_ASSETS_GLOBAL_NAME];
    if (!candidateAssetMap || typeof candidateAssetMap !== "object") {
        return undefined;
    }
    return candidateAssetMap as EmbeddedAssetMap;
}
function decodeEmbeddedAsset(encodedAsset: string): Uint8Array {
    const binaryText = atob(encodedAsset);
    const compressedBytes = new Uint8Array(binaryText.length);
    for (let index = 0; index < binaryText.length; index++) {
        compressedBytes[index] = binaryText.charCodeAt(index);
    }
    return gunzipSync(compressedBytes);
}
function isScriptAsset(relativePath: string): boolean {
    return relativePath.endsWith(".js") || relativePath.endsWith(".mjs");
}
function mimeTypeForAsset(relativePath: string): string {
    if (isScriptAsset(relativePath)) {
        return "text/javascript";
    }
    if (relativePath.endsWith(".wasm")) {
        return "application/wasm";
    }
    if (relativePath.endsWith(".json")) {
        return "application/json";
    }
    if (relativePath.endsWith(".css")) {
        return "text/css";
    }
    if (relativePath.endsWith(".zip")) {
        return "application/zip";
    }
    return "application/octet-stream";
}
class EmbeddedAssetSource implements RuntimeAssetLocator {
    private readonly sessionBaseUrl: string;
    private readonly sessionDirectoryPath: string;
    private readonly assetMap: EmbeddedAssetMap;
    private readonly blobByAssetPath: Map<string, Blob> = new Map();
    private readonly blobUrlByAssetPath: Map<string, string> = new Map();
    private readonly blobUrlByComposedUrl: Map<string, string> = new Map();
    private readonly assetPathsBeingPrepared: Set<string> = new Set();
    constructor(sessionBaseUrl: string, assetMap: EmbeddedAssetMap) {
        this.sessionBaseUrl = sessionBaseUrl;
        this.assetMap = assetMap;
        this.sessionDirectoryPath = new URL(sessionBaseUrl).pathname.replace(/\/+$/, "");
    }
    resolveAssetUrl(relativePath: string): string {
        const blobUrl = this.blobUrlForAsset(relativePath);
        if (blobUrl !== undefined) {
            return blobUrl;
        }
        return `${this.sessionBaseUrl}/${relativePath}`;
    }
    resolveComposedAssetUrl(composedUrl: string): string {
        const relativePath = this.relativePathForComposedUrl(composedUrl);
        if (relativePath === undefined) {
            return composedUrl;
        }
        if (isScriptAsset(relativePath)) {
            const cachedComposedUrl = this.blobUrlByComposedUrl.get(composedUrl);
            if (cachedComposedUrl !== undefined) {
                return cachedComposedUrl;
            }
            const scriptBlob = this.blobForAsset(relativePath);
            if (scriptBlob === undefined) {
                return composedUrl;
            }
            const scriptBlobUrl = URL.createObjectURL(scriptBlob);
            this.blobUrlByComposedUrl.set(composedUrl, scriptBlobUrl);
            return scriptBlobUrl;
        }
        return this.blobUrlForAsset(relativePath) ?? composedUrl;
    }
    private relativePathForComposedUrl(composedUrl: string): string | undefined {
        let parsedUrl: URL;
        try {
            parsedUrl = new URL(composedUrl, this.sessionBaseUrl);
        } catch {
            return undefined;
        }
        if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
            return undefined;
        }
        const normalizedPath = parsedUrl.pathname.replace(/\/{2,}/g, "/");
        if (!normalizedPath.startsWith(`${this.sessionDirectoryPath}/`)) {
            return undefined;
        }
        const relativePath = normalizedPath.slice(this.sessionDirectoryPath.length + 1);
        if (!Object.prototype.hasOwnProperty.call(this.assetMap, relativePath)) {
            return undefined;
        }
        return relativePath;
    }
    private blobUrlForAsset(relativePath: string): string | undefined {
        const cachedBlobUrl = this.blobUrlByAssetPath.get(relativePath);
        if (cachedBlobUrl !== undefined) {
            return cachedBlobUrl;
        }
        const assetBlob = this.blobForAsset(relativePath);
        if (assetBlob === undefined) {
            return undefined;
        }
        const blobUrl = URL.createObjectURL(assetBlob);
        this.blobUrlByAssetPath.set(relativePath, blobUrl);
        return blobUrl;
    }
    private blobForAsset(relativePath: string): Blob | undefined {
        const cachedBlob = this.blobByAssetPath.get(relativePath);
        if (cachedBlob !== undefined) {
            return cachedBlob;
        }
        const encodedAsset = this.assetMap[relativePath];
        if (typeof encodedAsset !== "string") {
            return undefined;
        }
        const assetBytes = decodeEmbeddedAsset(encodedAsset);
        const assetBlob = new Blob(
            [new Uint8Array(this.preparedAssetBytes(relativePath, assetBytes))],
            {
                type: mimeTypeForAsset(relativePath),
            },
        );
        this.blobByAssetPath.set(relativePath, assetBlob);
        return assetBlob;
    }
    private preparedAssetBytes(relativePath: string, assetBytes: Uint8Array): Uint8Array {
        if (!isScriptAsset(relativePath) || this.assetPathsBeingPrepared.has(relativePath)) {
            return assetBytes;
        }
        this.assetPathsBeingPrepared.add(relativePath);
        try {
            const sourceText = new TextDecoder().decode(assetBytes);
            const rewrittenText = sourceText.replace(
                RELATIVE_MODULE_SPECIFIER_PATTERN,
                (match, prefix: string, specifier: string, suffix: string) => {
                    const resolvedSpecifier = this.resolveRelativeSpecifier(
                        relativePath,
                        specifier,
                    );
                    if (resolvedSpecifier === undefined) {
                        return match;
                    }
                    return `${prefix}${resolvedSpecifier}${suffix}`;
                },
            );
            return new TextEncoder().encode(rewrittenText);
        } finally {
            this.assetPathsBeingPrepared.delete(relativePath);
        }
    }
    private resolveRelativeSpecifier(
        fromRelativePath: string,
        specifier: string,
    ): string | undefined {
        const resolvedSegments = fromRelativePath.split("/").slice(0, -1);
        for (const pathSegment of specifier.split("/")) {
            if (pathSegment === "" || pathSegment === ".") {
                continue;
            }
            if (pathSegment === "..") {
                resolvedSegments.pop();
                continue;
            }
            resolvedSegments.push(pathSegment);
        }
        return this.blobUrlForAsset(resolvedSegments.join("/"));
    }
}
let cachedEmbeddedAssetSource: EmbeddedAssetSource | undefined;
let cachedEmbeddedAssetSourceBaseUrl: string | undefined;
function embeddedAssetSourceFor(sessionBaseUrl: string): EmbeddedAssetSource | undefined {
    const assetMap = readEmbeddedAssetMap();
    if (!assetMap) {
        return undefined;
    }
    if (!cachedEmbeddedAssetSource || cachedEmbeddedAssetSourceBaseUrl !== sessionBaseUrl) {
        cachedEmbeddedAssetSource = new EmbeddedAssetSource(sessionBaseUrl, assetMap);
        cachedEmbeddedAssetSourceBaseUrl = sessionBaseUrl;
    }
    return cachedEmbeddedAssetSource;
}
function createRuntimeAssetLocator(sessionBaseUrl: string): RuntimeAssetLocator {
    const embeddedAssetSource = embeddedAssetSourceFor(sessionBaseUrl);
    if (embeddedAssetSource) {
        return embeddedAssetSource;
    }
    return {
        resolveAssetUrl: (relativePath: string) => `${sessionBaseUrl}/${relativePath}`,
    };
}
function installEmbeddedAssetRuntime(sessionBaseUrl: string): void {
    const embeddedAssetSource = embeddedAssetSourceFor(sessionBaseUrl);
    if (!embeddedAssetSource) {
        return;
    }
    const globalRecord = globalThis as Record<string, unknown>;
    if (typeof globalRecord[EMBEDDED_RESOLVER_GLOBAL_NAME] !== "function") {
        globalRecord[EMBEDDED_RESOLVER_GLOBAL_NAME] = (composedUrl: unknown) =>
            embeddedAssetSource.resolveComposedAssetUrl(String(composedUrl));
    }
    if (typeof globalRecord[EMBEDDED_FETCH_BRIDGE_GLOBAL_NAME] !== "function") {
        const originalFetch = globalThis.fetch.bind(globalThis);
        const bridgingFetch = (input: RequestInfo | URL, init?: RequestInit) => {
            const rawUrl =
                typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
            const resolvedUrl = embeddedAssetSource.resolveComposedAssetUrl(rawUrl);
            if (resolvedUrl !== rawUrl) {
                return originalFetch(resolvedUrl, init);
            }
            return originalFetch(input, init);
        };
        globalRecord[EMBEDDED_FETCH_BRIDGE_GLOBAL_NAME] = bridgingFetch;
        globalThis.fetch = bridgingFetch as typeof fetch;
    }
}
export { createRuntimeAssetLocator, installEmbeddedAssetRuntime };
export type { RuntimeAssetLocator };
