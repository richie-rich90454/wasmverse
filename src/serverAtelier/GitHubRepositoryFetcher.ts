import { ServerConfiguration } from "@serverAtelier/ServerConfiguration.ts";
interface RepositoryReference {
    owner: string;
    repository: string;
    ref: string | undefined;
}
const GITHUB_HOST = "github.com";
const GITHUB_API_HOST = "api.github.com";
const GITHUB_CODELOAD_HOST = "codeload.github.com";
const SCHEME_PATTERN = /^([A-Za-z][A-Za-z0-9+.-]*):\/\//;
const HOSTLESS_REFERENCE_PATTERN = /^github\.com(?:\/|$)/i;
const PATH_SEGMENT_PATTERN = /^[A-Za-z0-9._-]+$/;
const EDGE_CHARACTER_PATTERN = /^[.-]|[.-]$/;
const INVALID_REF_PATTERN = /[\s?#\\]/;
const REQUEST_TIMEOUT_MILLISECONDS = 60_000;
const FALLBACK_REF = "HEAD";
function isAbortError(error: unknown): boolean {
    return (
        typeof error === "object" &&
        error !== null &&
        (error as { name?: unknown }).name === "AbortError"
    );
}
class GitHubRepositoryFetcher {
    private readonly fetchImplementation: typeof globalThis.fetch;
    private readonly maximumByteSize: number;
    constructor(
        fetchImplementation: typeof globalThis.fetch = globalThis.fetch,
        maximumByteSize: number = new ServerConfiguration().maximumUploadSizeInBytes,
    ) {
        this.fetchImplementation = fetchImplementation;
        this.maximumByteSize = maximumByteSize;
    }
    parseRepositoryReference(reference: string): RepositoryReference {
        const trimmedReference = reference.trim();
        if (trimmedReference.length === 0) {
            throw new Error(
                "Repository reference is empty. Provide owner/repository or a https://github.com URL.",
            );
        }
        const schemeMatch = SCHEME_PATTERN.exec(trimmedReference);
        const isHostReference =
            schemeMatch !== null || HOSTLESS_REFERENCE_PATTERN.test(trimmedReference);
        let referencePath: string;
        if (schemeMatch !== null) {
            if (schemeMatch[1]?.toLowerCase() !== "https") {
                throw new Error(
                    `Repository reference "${trimmedReference}" uses the unsupported scheme "${schemeMatch[1]}". Only https is supported.`,
                );
            }
            let parsedUrl: URL;
            try {
                parsedUrl = new URL(trimmedReference);
            } catch {
                throw new Error(`Repository reference "${trimmedReference}" is not a valid URL.`);
            }
            if (parsedUrl.hostname.toLowerCase() !== GITHUB_HOST) {
                throw new Error(
                    `Repository reference "${trimmedReference}" points at host "${parsedUrl.hostname}". Only github.com is supported.`,
                );
            }
            referencePath = parsedUrl.pathname;
        } else if (isHostReference) {
            referencePath = trimmedReference.slice(GITHUB_HOST.length);
        } else {
            referencePath = `/${trimmedReference}`;
        }
        const pathSegments = referencePath.split("/").filter((segment) => segment.length > 0);
        if (!isHostReference) {
            if (pathSegments.length !== 2) {
                throw new Error(
                    `Repository reference "${trimmedReference}" is malformed. Expected owner/repository, for example "rust-lang/rust".`,
                );
            }
            const shorthandOwner = pathSegments[0];
            const shorthandRepository = pathSegments[1];
            this.assertValidPathSegment(shorthandOwner, "owner", trimmedReference);
            this.assertValidPathSegment(shorthandRepository, "repository", trimmedReference);
            return { owner: shorthandOwner, repository: shorthandRepository, ref: undefined };
        }
        if (pathSegments.length < 2) {
            const missingDescription =
                pathSegments.length === 0 ? "owner and repository" : "repository";
            throw new Error(
                `Repository reference "${trimmedReference}" is missing the ${missingDescription}. Expected https://github.com/owner/repository.`,
            );
        }
        const owner = pathSegments[0];
        const repository = pathSegments[1];
        this.assertValidPathSegment(owner, "owner", trimmedReference);
        this.assertValidPathSegment(repository, "repository", trimmedReference);
        if (pathSegments.length === 2) {
            return { owner, repository, ref: undefined };
        }
        if (pathSegments[2] !== "tree") {
            throw new Error(
                `Repository reference "${trimmedReference}" uses the unsupported GitHub path "${pathSegments[2]}". Only repository links and tree links are supported.`,
            );
        }
        if (pathSegments.length === 3) {
            throw new Error(
                `Repository reference "${trimmedReference}" is missing the ref after "tree/".`,
            );
        }
        const ref = pathSegments.slice(3).join("/");
        if (INVALID_REF_PATTERN.test(ref)) {
            throw new Error(
                `The ref "${ref}" in repository reference "${trimmedReference}" contains unsupported characters.`,
            );
        }
        return { owner, repository, ref };
    }
    async fetchArchive(reference: string): Promise<Uint8Array> {
        const parsedReference = this.parseRepositoryReference(reference);
        const resolvedRef =
            parsedReference.ref ??
            (await this.resolveDefaultBranch(parsedReference.owner, parsedReference.repository));
        return this.downloadArchive(parsedReference.owner, parsedReference.repository, resolvedRef);
    }
    private assertValidPathSegment(segment: string, label: string, reference: string): void {
        if (!PATH_SEGMENT_PATTERN.test(segment)) {
            throw new Error(
                `The ${label} "${segment}" in repository reference "${reference}" contains unsupported characters. Use only letters, digits, ".", "_", and "-".`,
            );
        }
        if (EDGE_CHARACTER_PATTERN.test(segment)) {
            throw new Error(
                `The ${label} "${segment}" in repository reference "${reference}" must not start or end with "." or "-".`,
            );
        }
    }
    private async resolveDefaultBranch(owner: string, repository: string): Promise<string> {
        try {
            return await this.withRequestTimeout(
                `Resolving the default branch for ${owner}/${repository}`,
                async (abortSignal) => {
                    const response = await this.fetchImplementation(
                        `https://${GITHUB_API_HOST}/repos/${owner}/${repository}`,
                        {
                            headers: {
                                accept: "application/vnd.github+json",
                                "user-agent": "wasmverse",
                            },
                            signal: abortSignal,
                        },
                    );
                    if (!response.ok) {
                        return FALLBACK_REF;
                    }
                    const payload = (await response.json()) as { default_branch?: unknown };
                    return typeof payload.default_branch === "string" &&
                        payload.default_branch.length > 0
                        ? payload.default_branch
                        : FALLBACK_REF;
                },
            );
        } catch {
            return FALLBACK_REF;
        }
    }
    private async downloadArchive(
        owner: string,
        repository: string,
        ref: string,
    ): Promise<Uint8Array> {
        const archiveUrl = `https://${GITHUB_CODELOAD_HOST}/${owner}/${repository}/zip/${ref}`;
        return this.withRequestTimeout(
            `Downloading the archive for ${owner}/${repository} at ref "${ref}"`,
            async (abortSignal) => {
                const response = await this.fetchImplementation(archiveUrl, {
                    signal: abortSignal,
                });
                if (!response.ok) {
                    throw new Error(
                        `Downloading the archive for ${owner}/${repository} at ref "${ref}" failed with HTTP status ${response.status}.`,
                    );
                }
                const declaredByteLength = Number(response.headers.get("content-length") ?? "0");
                if (
                    Number.isFinite(declaredByteLength) &&
                    declaredByteLength > this.maximumByteSize
                ) {
                    throw new Error(
                        `The archive for ${owner}/${repository} declares ${declaredByteLength} bytes, above the ${this.maximumByteSize} byte maximum.`,
                    );
                }
                return this.readArchiveBodyWithByteCap(response, owner, repository);
            },
        );
    }
    private async readArchiveBodyWithByteCap(
        response: Response,
        owner: string,
        repository: string,
    ): Promise<Uint8Array> {
        const bodyStream = response.body;
        if (bodyStream === null) {
            throw new Error(`GitHub returned no archive body for ${owner}/${repository}.`);
        }
        const bodyReader = bodyStream.getReader();
        const collectedChunks: Array<Uint8Array> = [];
        let collectedByteCount = 0;
        while (true) {
            const { done, value } = await bodyReader.read();
            if (done) {
                break;
            }
            collectedByteCount += value.byteLength;
            if (collectedByteCount > this.maximumByteSize) {
                await bodyReader.cancel();
                throw new Error(
                    `The archive for ${owner}/${repository} exceeds the ${this.maximumByteSize} byte maximum.`,
                );
            }
            collectedChunks.push(value);
        }
        const archiveBytes = new Uint8Array(collectedByteCount);
        let writeOffset = 0;
        for (const chunk of collectedChunks) {
            archiveBytes.set(chunk, writeOffset);
            writeOffset += chunk.byteLength;
        }
        return archiveBytes;
    }
    private async withRequestTimeout<TResult>(
        description: string,
        operation: (abortSignal: AbortSignal) => Promise<TResult>,
    ): Promise<TResult> {
        const abortController = new AbortController();
        const timeoutHandle = setTimeout(
            () => abortController.abort(),
            REQUEST_TIMEOUT_MILLISECONDS,
        );
        try {
            return await operation(abortController.signal);
        } catch (operationError) {
            if (isAbortError(operationError)) {
                throw new Error(
                    `${description} timed out after ${REQUEST_TIMEOUT_MILLISECONDS / 1000} seconds.`,
                );
            }
            throw operationError;
        } finally {
            clearTimeout(timeoutHandle);
        }
    }
}
export { GitHubRepositoryFetcher };
export type { RepositoryReference };
