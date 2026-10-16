function sieve(limit) {
    const flags = new Array(limit + 1).fill(true);
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
    return flags.reduce((primes, isPrime, value) => {
        if (isPrime) {
            primes.push(value);
        }
        return primes;
    }, []);
}

function rollingSums(values, width) {
    const sums = [];
    let total = 0;
    for (let index = 0; index < values.length; index += 1) {
        total += values[index];
        if (index >= width) {
            total -= values[index - width];
        }
        if (index >= width - 1) {
            sums.push(total);
        }
    }
    return sums;
}

class Ledger {
    constructor() {
        this.entries = new Map();
    }
    record(label, amount) {
        const current = this.entries.get(label) ?? 0;
        this.entries.set(label, current + amount);
        return current + amount;
    }
    report() {
        return [...this.entries.entries()]
            .sort(([left], [right]) => (left < right ? -1 : 1))
            .map(([label, amount]) => `${label}=${amount}`);
    }
}

print("WASMVerse JavaScript showcase");
print("Stage one: functional sieve over the prime stream");
const primes = sieve(200);
print(`prime count up to 200: ${primes.length}`);
print(`largest prime: ${primes[primes.length - 1]}`);
print("Stage two: rolling windows rebuilt per call");
const windows = rollingSums(primes, 10);
print(`window sums: ${windows.join(", ")}`);
print("Stage three: class state and Map aggregation");
const ledger = new Ledger();
ledger.record("compile", 12);
ledger.record("render", 7);
ledger.record("compile", 5);
print(`ledger: ${ledger.report().join(" | ")}`);
console.log("console bridge: console calls reach this terminal");
print("Showcase complete.");
