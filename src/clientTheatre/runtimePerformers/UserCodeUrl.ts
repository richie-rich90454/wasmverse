function encodeUserCodePath(relativePath: string): string {
    return relativePath
        .split("/")
        .map((segment) => encodeURIComponent(segment))
        .join("/");
}
export { encodeUserCodePath };
