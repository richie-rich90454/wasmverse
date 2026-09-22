function sieve(limit: i32): Array<i32> {
    const flags = new Array<boolean>(limit + 1);
    for (let index = 0; index <= limit; index++) {
        flags[index] = true;
    }
    flags[0] = false;
    flags[1] = false;
    for (let number = 2; number * number <= limit; number++) {
        if (flags[number]) {
            for (let multiple = number * number; multiple <= limit; multiple += number) {
                flags[multiple] = false;
            }
        }
    }
    const primes = new Array<i32>();
    for (let index = 2; index <= limit; index++) {
        if (flags[index]) {
            primes.push(index);
        }
    }
    return primes;
}

export function main(): void {
    console.log("WASMVerse AssemblyScript showcase");
    console.log("Stage one: typed sieve over linear memory");
    const primes = sieve(300);
    const head = primes.slice(0, 6);
    console.log("prime count up to 300: " + primes.length.toString());
    console.log("largest prime: " + primes[primes.length - 1].toString());
    console.log("first primes: " + head.join(", "));
    console.log("Stage two: heap allocation and string building");
    const words = new Array<string>();
    words.push("parse");
    words.push("lower");
    words.push("render");
    const upper = words.map<string>((word: string): string => word.toUpperCase());
    console.log("labels: " + upper.join(" -> "));
    console.log("Stage three: integer arithmetic on typed arrays");
    const table = new Int32Array(8);
    for (let index = 0; index < 8; index++) {
        table[index] = (index + 1) * (index + 1);
    }
    let total = 0;
    for (let index = 0; index < table.length; index++) {
        total += table[index];
    }
    console.log("sum of squares: " + total.toString());
    console.log("Showcase complete.");
}
