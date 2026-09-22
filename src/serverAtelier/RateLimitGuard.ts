type RateLimitWindow = {
    count: number;
    windowStartTimestamp: number;
};
class RateLimitGuard {
    private readonly maximumRequests: number;
    private readonly windowMilliseconds: number;
    private readonly windowsByKey: Map<string, RateLimitWindow>;
    private readonly clock: () => number;
    constructor(maximumRequests: number, windowMilliseconds: number, clock?: () => number) {
        this.maximumRequests = maximumRequests;
        this.windowMilliseconds = windowMilliseconds;
        this.windowsByKey = new Map();
        this.clock = clock ?? Date.now;
    }
    tryConsume(key: string): boolean {
        const currentTimestamp = this.clock();
        const existingWindow = this.windowsByKey.get(key);
        if (
            !existingWindow ||
            currentTimestamp - existingWindow.windowStartTimestamp >= this.windowMilliseconds
        ) {
            this.windowsByKey.set(key, { count: 1, windowStartTimestamp: currentTimestamp });
            return true;
        }
        if (existingWindow.count >= this.maximumRequests) {
            return false;
        }
        existingWindow.count += 1;
        return true;
    }
    reset(): void {
        this.windowsByKey.clear();
    }
}
export { RateLimitGuard };
