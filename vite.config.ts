/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const projectRoot = dirname(fileURLToPath(import.meta.url));
export default defineConfig({
    base: "./",
    plugins: [react()],
    build: {
        outDir: "dist/client",
        emptyOutDir: true,
        target: "es2020",
    },
    resolve: {
        alias: {
            "@sharedKernel": resolve(projectRoot, "src/sharedKernel"),
            "@serverAtelier": resolve(projectRoot, "src/serverAtelier"),
            "@clientTheatre": resolve(projectRoot, "src/clientTheatre"),
        },
    },
    server: {
        port: 5173,
        proxy: {
            "/api": "http://localhost:3000",
            "/session": "http://localhost:3000",
        },
    },
    test: {
        include: ["src/**/*.test.ts"],
        environment: "node",
        testTimeout: 60_000,
    },
});
