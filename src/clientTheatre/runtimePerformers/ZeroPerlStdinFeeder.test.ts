import { describe, expect, test } from "vitest";
import { ZeroPerlStdinFeeder } from "@clientTheatre/runtimePerformers/ZeroPerlPerformer.ts";
import { isTerminalInputNeeded } from "@clientTheatre/runtimePerformers/ReplayableStdinFile.ts";
describe("ZeroPerlStdinFeeder", () => {
    test("delivers fed lines one at a time, then stops the read, then reports missing input", () => {
        const stdinFeeder = new ZeroPerlStdinFeeder(["Ada", "Grace"]);
        expect(stdinFeeder.nextChunk()).toBe("Ada\n");
        expect(stdinFeeder.nextChunk()).toBe("");
        expect(stdinFeeder.nextChunk()).toBe("Grace\n");
        expect(stdinFeeder.nextChunk()).toBe("");
        let missingInputDetected = false;
        try {
            stdinFeeder.nextChunk();
        } catch (missingInputError) {
            missingInputDetected = isTerminalInputNeeded(missingInputError);
        }
        expect(missingInputDetected).toBe(true);
    });
    test("reports missing input immediately when nothing was fed", () => {
        const stdinFeeder = new ZeroPerlStdinFeeder([]);
        let missingInputDetected = false;
        try {
            stdinFeeder.nextChunk();
        } catch (missingInputError) {
            missingInputDetected = isTerminalInputNeeded(missingInputError);
        }
        expect(missingInputDetected).toBe(true);
    });
});
