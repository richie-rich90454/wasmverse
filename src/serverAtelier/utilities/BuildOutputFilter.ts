const BUILD_OUTPUT_PATH_PATTERNS: ReadonlyArray<RegExp> = [
    /(^|\/)(target|node_modules|zig-out|zig-cache|\.zig-cache|\.scala-build|elm-stuff|\.dart_tool|\.gradle|__pycache__|\.pytest_cache|\.mypy_cache|\.ruff_cache|\.venv|venv|\.git|\.idea|bin|obj|Pods)(\/|$)/,
    /(^|\/)lib\/(bs|ocaml)(\/|$)/,
];
function isBuildOutputPath(relativePath: string): boolean {
    return BUILD_OUTPUT_PATH_PATTERNS.some((pattern) => pattern.test(relativePath));
}
export { isBuildOutputPath };
