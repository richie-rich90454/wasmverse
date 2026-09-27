const REMOTE_ASSET_ORIGIN_PATTERNS: ReadonlyArray<RegExp> = [
    /https?:\/\/unpkg\.com\/[^\s`'")]+/g,
    /https?:\/\/cdn\.jsdelivr\.net\/[^\s`'")]+/g,
    /https?:\/\/cdnjs\.cloudflare\.com\/[^\s`'")]+/g,
    /https?:\/\/ajax\.googleapis\.com\/[^\s`'")]+/g,
    /https?:\/\/fonts\.googleapis\.com\/[^\s`'")]+/g,
    /https?:\/\/fonts\.gstatic\.com\/[^\s`'")]+/g,
    /https?:\/\/esm\.sh\/[^\s`'")]+/g,
    /https?:\/\/skypack\.dev\/[^\s`'")]+/g,
    /https?:\/\/raw\.githubusercontent\.com\/[^\s`'")]+/g,
];
const LOCAL_ASSET_REPLACEMENT = "./";
function findRemoteAssetOrigins(text: string): Array<string> {
    return REMOTE_ASSET_ORIGIN_PATTERNS.flatMap((pattern) => text.match(pattern) ?? []);
}
function scrubRemoteAssetOrigins(text: string): string {
    let scrubbedText = text;
    for (const pattern of REMOTE_ASSET_ORIGIN_PATTERNS) {
        scrubbedText = scrubbedText.replace(pattern, LOCAL_ASSET_REPLACEMENT);
    }
    return scrubbedText;
}
export { findRemoteAssetOrigins, scrubRemoteAssetOrigins };
