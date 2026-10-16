import { describe, expect, test } from "vitest";
import { GitHubRepositoryFetcher } from "@serverAtelier/GitHubRepositoryFetcher.ts";
import type { RepositoryReference } from "@serverAtelier/GitHubRepositoryFetcher.ts";
const SAMPLE_ARCHIVE_BYTES = new Uint8Array([80, 75, 3, 4, 1, 2, 3]);
const SAMPLE_MAXIMUM_BYTE_SIZE = 1024;
function createForbiddenFetch(): typeof globalThis.fetch {
    return (async () => {
        throw new Error("This fetch implementation must not be called.");
    }) as unknown as typeof globalThis.fetch;
}
function createRecordingFetch(respond: (requestUrl: string) => Response): {
    fetchImplementation: typeof globalThis.fetch;
    recordedRequestUrls: Array<string>;
} {
    const recordedRequestUrls: Array<string> = [];
    const fetchImplementation = (async (input: RequestInfo | URL) => {
        const requestUrl = String(input);
        recordedRequestUrls.push(requestUrl);
        return respond(requestUrl);
    }) as unknown as typeof globalThis.fetch;
    return { fetchImplementation, recordedRequestUrls };
}
describe("GitHubRepositoryFetcher", () => {
    describe("parseRepositoryReference", () => {
        test("accepts shorthand, host, and tree references", () => {
            const fetcher = new GitHubRepositoryFetcher(createForbiddenFetch());
            const acceptedCases: Array<[string, RepositoryReference]> = [
                ["owner/repository", { owner: "owner", repository: "repository", ref: undefined }],
                ["rust-lang/rust", { owner: "rust-lang", repository: "rust", ref: undefined }],
                [
                    "https://github.com/owner/repository",
                    { owner: "owner", repository: "repository", ref: undefined },
                ],
                [
                    "github.com/owner/repository",
                    { owner: "owner", repository: "repository", ref: undefined },
                ],
                [
                    "https://github.com/owner/repository/",
                    { owner: "owner", repository: "repository", ref: undefined },
                ],
                [
                    "https://github.com/owner/repository/tree/main",
                    { owner: "owner", repository: "repository", ref: "main" },
                ],
                [
                    "https://github.com/owner/repository/tree/v1.2.3",
                    { owner: "owner", repository: "repository", ref: "v1.2.3" },
                ],
                [
                    "https://github.com/owner/repository/tree/feature/nested-branch",
                    { owner: "owner", repository: "repository", ref: "feature/nested-branch" },
                ],
                [
                    "https://github.com/owner/repository/tree/main?tab=readme",
                    { owner: "owner", repository: "repository", ref: "main" },
                ],
                [
                    "github.com/Owner_1/re-po.2",
                    { owner: "Owner_1", repository: "re-po.2", ref: undefined },
                ],
            ];
            for (const [reference, expectedReference] of acceptedCases) {
                expect(fetcher.parseRepositoryReference(reference)).toEqual(expectedReference);
            }
        });
        test("rejects unsupported hosts, schemes, and malformed segments", () => {
            const fetcher = new GitHubRepositoryFetcher(createForbiddenFetch());
            const rejectedCases: Array<string> = [
                "",
                "   ",
                "owner",
                "owner/repository/extra",
                "owner/repository/tree/main",
                "https://gitlab.com/owner/repository",
                "gitlab.com/owner/repository",
                "https://github.com/owner",
                "https://github.com/owner/repository/issues",
                "https://github.com/owner/repository/tree/",
                "https://github.com/owner/repository/blob/main/main.py",
                "https://raw.githubusercontent.com/owner/repository/main/file.py",
                "http://github.com/owner/repository",
                "-owner/repository",
                "owner/repository-",
                ".owner/repository",
                "owner/repository.",
                "owner/re po",
                "owner/re@pository",
            ];
            for (const reference of rejectedCases) {
                expect(() => fetcher.parseRepositoryReference(reference)).toThrow();
            }
        });
        test("names the problem in rejection errors", () => {
            const fetcher = new GitHubRepositoryFetcher(createForbiddenFetch());
            expect(() =>
                fetcher.parseRepositoryReference("https://gitlab.com/owner/repository"),
            ).toThrow("gitlab.com");
            expect(() => fetcher.parseRepositoryReference("owner/repository/extra")).toThrow(
                "owner/repository",
            );
            expect(() =>
                fetcher.parseRepositoryReference(
                    "https://github.com/owner/repository/blob/main/main.py",
                ),
            ).toThrow("blob");
            expect(() => fetcher.parseRepositoryReference("owner/repository-")).toThrow(
                "must not start or end",
            );
        });
    });
    describe("fetchArchive", () => {
        test("resolves the default branch through the API then downloads from codeload", async () => {
            const { fetchImplementation, recordedRequestUrls } = createRecordingFetch(
                (requestUrl) => {
                    if (requestUrl === "https://api.github.com/repos/owner/repository") {
                        return Response.json({ default_branch: "trunk" });
                    }
                    return new Response(SAMPLE_ARCHIVE_BYTES);
                },
            );
            const fetcher = new GitHubRepositoryFetcher(
                fetchImplementation,
                SAMPLE_MAXIMUM_BYTE_SIZE,
            );
            const archiveBytes = await fetcher.fetchArchive("owner/repository");
            expect(archiveBytes).toEqual(SAMPLE_ARCHIVE_BYTES);
            expect(recordedRequestUrls).toEqual([
                "https://api.github.com/repos/owner/repository",
                "https://codeload.github.com/owner/repository/zip/trunk",
            ]);
        });
        test("falls back to HEAD when the API call fails", async () => {
            const failingApiResponders: Array<() => Response> = [
                () => new Response("Not Found", { status: 404 }),
                () => {
                    throw new Error("network down");
                },
                () => Response.json({ message: "no default branch here" }),
            ];
            for (const apiResponder of failingApiResponders) {
                const { fetchImplementation, recordedRequestUrls } = createRecordingFetch(
                    (requestUrl) =>
                        requestUrl.startsWith("https://api.github.com/")
                            ? apiResponder()
                            : new Response(SAMPLE_ARCHIVE_BYTES),
                );
                const fetcher = new GitHubRepositoryFetcher(
                    fetchImplementation,
                    SAMPLE_MAXIMUM_BYTE_SIZE,
                );
                const archiveBytes = await fetcher.fetchArchive("owner/repository");
                expect(archiveBytes).toEqual(SAMPLE_ARCHIVE_BYTES);
                expect(recordedRequestUrls).toEqual([
                    "https://api.github.com/repos/owner/repository",
                    "https://codeload.github.com/owner/repository/zip/HEAD",
                ]);
            }
        });
        test("uses an explicit ref without calling the API", async () => {
            const { fetchImplementation, recordedRequestUrls } = createRecordingFetch(
                () => new Response(SAMPLE_ARCHIVE_BYTES),
            );
            const fetcher = new GitHubRepositoryFetcher(
                fetchImplementation,
                SAMPLE_MAXIMUM_BYTE_SIZE,
            );
            const archiveBytes = await fetcher.fetchArchive(
                "https://github.com/owner/repository/tree/feature/nested-branch",
            );
            expect(archiveBytes).toEqual(SAMPLE_ARCHIVE_BYTES);
            expect(recordedRequestUrls).toEqual([
                "https://codeload.github.com/owner/repository/zip/feature/nested-branch",
            ]);
        });
        test("reports the HTTP status when the archive download fails", async () => {
            const { fetchImplementation } = createRecordingFetch(
                () => new Response("Not Found", { status: 404 }),
            );
            const fetcher = new GitHubRepositoryFetcher(
                fetchImplementation,
                SAMPLE_MAXIMUM_BYTE_SIZE,
            );
            await expect(
                fetcher.fetchArchive("https://github.com/owner/repository/tree/main"),
            ).rejects.toThrow('at ref "main" failed with HTTP status 404');
        });
        test("rejects an archive whose declared content-length exceeds the maximum", async () => {
            const { fetchImplementation, recordedRequestUrls } = createRecordingFetch(
                () =>
                    new Response(SAMPLE_ARCHIVE_BYTES, {
                        headers: { "content-length": "2048" },
                    }),
            );
            const fetcher = new GitHubRepositoryFetcher(
                fetchImplementation,
                SAMPLE_MAXIMUM_BYTE_SIZE,
            );
            await expect(
                fetcher.fetchArchive("https://github.com/owner/repository/tree/main"),
            ).rejects.toThrow("2048 bytes, above the 1024 byte maximum");
            expect(recordedRequestUrls).toEqual([
                "https://codeload.github.com/owner/repository/zip/main",
            ]);
        });
        test("aborts streaming when the body exceeds the maximum", async () => {
            let streamWasCancelled = false;
            const oversizedBodyStream = new ReadableStream<Uint8Array>({
                start(streamController) {
                    streamController.enqueue(new Uint8Array(2048));
                },
                cancel() {
                    streamWasCancelled = true;
                },
            });
            const { fetchImplementation } = createRecordingFetch(
                () => new Response(oversizedBodyStream),
            );
            const fetcher = new GitHubRepositoryFetcher(
                fetchImplementation,
                SAMPLE_MAXIMUM_BYTE_SIZE,
            );
            await expect(
                fetcher.fetchArchive("https://github.com/owner/repository/tree/main"),
            ).rejects.toThrow("exceeds the 1024 byte maximum");
            expect(streamWasCancelled).toBe(true);
        });
        test("only ever requests api.github.com and codeload.github.com", async () => {
            const hostileLocation = "https://evil.example/archive.zip";
            const { fetchImplementation, recordedRequestUrls } = createRecordingFetch(
                (requestUrl) => {
                    if (requestUrl.startsWith("https://api.github.com/")) {
                        return Response.json(
                            { default_branch: "main" },
                            { headers: { location: hostileLocation } },
                        );
                    }
                    return new Response(SAMPLE_ARCHIVE_BYTES, {
                        headers: { location: hostileLocation },
                    });
                },
            );
            const fetcher = new GitHubRepositoryFetcher(
                fetchImplementation,
                SAMPLE_MAXIMUM_BYTE_SIZE,
            );
            await fetcher.fetchArchive("owner/repository");
            await fetcher.fetchArchive("https://github.com/owner/repository/tree/main");
            const allowedHosts = new Set(["api.github.com", "codeload.github.com"]);
            expect(recordedRequestUrls.length).toBe(3);
            for (const requestUrl of recordedRequestUrls) {
                expect(allowedHosts.has(new URL(requestUrl).hostname)).toBe(true);
                expect(requestUrl.startsWith("https://")).toBe(true);
            }
        });
    });
});
