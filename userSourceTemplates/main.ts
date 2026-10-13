declare function print(...values: Array<unknown>): void;

interface WindowSummary {
    label: string;
    count: number;
    largest: number;
}

function sieve(limit: number): Array<number> {
    const flags: Array<boolean> = new Array(limit + 1).fill(true);
    flags[0] = false;
    flags[1] = false;
    for (let number = 2; number * number <= limit; number += 1) {
        if (!flags[number]) {
            continue;
        }
        for (let multiple = number * number; multiple <= limit; multiple += number) {
            flags[multiple] = false;
        }
    }
    const primes: Array<number> = [];
    for (let index = 2; index <= limit; index += 1) {
        if (flags[index]) {
            primes.push(index);
        }
    }
    return primes;
}

function summarize(label: string, values: Array<number>): WindowSummary {
    return {
        label,
        count: values.length,
        largest: values[values.length - 1] ?? 0,
    };
}

function rank<T>(values: Array<T>, score: (value: T) => number): Array<T> {
    return [...values].sort((left, right) => score(right) - score(left));
}

class Counter {
    private total: number = 0;
    add(amount: number): number {
        this.total += amount;
        return this.total;
    }
    get value(): number {
        return this.total;
    }
}

print("WASMVerse TypeScript showcase");
print("Stage one: typed sieve over prime windows");
const shards: Array<WindowSummary> = [250, 500, 750].map((limit, index) =>
    summarize(`shard-${index + 1}`, sieve(limit)),
);
for (const shard of shards) {
    print(`${shard.label}: ${shard.count} primes, largest ${shard.largest}`);
}
print("Stage two: generics ranked by a score function");
const words = ["parse", "lower", "render", "tokenize"].map((word) => ({
    word,
    weight: word.length * 3 - (word.charCodeAt(0) % 7),
}));
const ranked = rank(words, (entry) => entry.weight).map(
    (entry) => `${entry.word}(${entry.weight})`,
);
print(`ranking: ${ranked.join(" > ")}`);
print("Stage three: class state with accessors");
const counter = new Counter();
for (const shard of shards) {
    counter.add(shard.count);
}
print(`total primes counted: ${counter.value}`);
print("Showcase complete.");
