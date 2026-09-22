const SECURITY_HEADERS: ReadonlyArray<readonly [string, string]> = [
    [
        "content-security-policy",
        [
            "default-src 'self'",
            "script-src 'self' 'wasm-unsafe-eval'",
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data: blob:",
            "font-src 'self' data:",
            "connect-src 'self'",
            "worker-src 'self' blob:",
            "manifest-src 'self'",
            "object-src 'none'",
            "base-uri 'self'",
            "frame-ancestors 'none'",
        ].join("; "),
    ],
    ["x-content-type-options", "nosniff"],
    ["referrer-policy", "no-referrer"],
    ["x-frame-options", "DENY"],
    ["permissions-policy", "camera=(), microphone=(), geolocation=()"],
] as const;
function applySecurityHeaders(response: Response): Response {
    const headers = new Headers(response.headers);
    for (const [headerName, headerValue] of SECURITY_HEADERS) {
        headers.set(headerName, headerValue);
    }
    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
    });
}
export { applySecurityHeaders };
