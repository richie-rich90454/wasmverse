@external("env", "write")
declare function write(pointer: usize, length: usize): void;

function emit(line: string): void {
    const encoded = String.UTF8.encode(line);
    const view = Uint8Array.wrap(encoded);
    write(view.dataStart, view.length);
}

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
    emit("WASMVerse AssemblyScript showcase\n");
    emit("Stage one: typed sieve over linear memory\n");
    const primes = sieve(300);
    const head = primes.slice(0, 6);
    emit("prime count up to 300: " + primes.length.toString() + "\n");
    emit("largest prime: " + primes[primes.length - 1].toString() + "\n");
    emit("first primes: " + head.join(", ") + "\n");
    emit("Stage two: heap allocation and string building\n");
    const words = new Array<string>();
    words.push("parse");
    words.push("lower");
    words.push("render");
    const upper = words.map<string>((word: string): string => word.toUpperCase());
    emit("labels: " + upper.join(" -> ") + "\n");
    emit("Stage three: integer arithmetic on typed arrays\n");
    const table = new Int32Array(8);
    for (let index = 0; index < 8; index++) {
        table[index] = (index + 1) * (index + 1);
    }
    let total = 0;
    for (let index = 0; index < table.length; index++) {
        total += table[index];
    }
    emit("sum of squares: " + total.toString() + "\n");
    emit("Showcase complete.\n");
}
