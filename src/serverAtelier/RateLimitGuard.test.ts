import { describe, expect, test } from "vitest";
import { RateLimitGuard } from "@serverAtelier/RateLimitGuard.ts";
describe("RateLimitGuard", () => {
    test("allows requests up to the maximum then denies", () => {
        const guard = new RateLimitGuard(3, 60_000);
        expect(guard.tryConsume("client")).toBe(true);
        expect(guard.tryConsume("client")).toBe(true);
        expect(guard.tryConsume("client")).toBe(true);
        expect(guard.tryConsume("client")).toBe(false);
    });
    test("opens a fresh window after the interval passes", () => {
        let now = 1_000;
        const guard = new RateLimitGuard(2, 60_000, () => now);
        expect(guard.tryConsume("client")).toBe(true);
        expect(guard.tryConsume("client")).toBe(true);
        expect(guard.tryConsume("client")).toBe(false);
        now += 60_000;
        expect(guard.tryConsume("client")).toBe(true);
    });
    test("tracks each key independently", () => {
        const guard = new RateLimitGuard(1, 60_000);
        expect(guard.tryConsume("first")).toBe(true);
        expect(guard.tryConsume("first")).toBe(false);
        expect(guard.tryConsume("second")).toBe(true);
    });
    test("reset clears every window", () => {
        const guard = new RateLimitGuard(1, 60_000);
        expect(guard.tryConsume("client")).toBe(true);
        expect(guard.tryConsume("client")).toBe(false);
        guard.reset();
        expect(guard.tryConsume("client")).toBe(true);
    });
});
