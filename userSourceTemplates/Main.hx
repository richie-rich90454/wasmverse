class Main {
    static function print(text: String): Void {
        js.Syntax.code("wasmversePrint({0})", text);
    }

    static function describe(event: LedgerEvent): String {
        return switch (event) {
            case Deposit(account, amount): account + " +" + Std.string(amount);
            case Withdrawal(account, amount): account + " -" + Std.string(amount);
            case Note(text): "note: " + text;
        }
    }

    static function applyEvent(totals: Map<String, Int>, event: LedgerEvent): Void {
        switch (event) {
            case Deposit(account, amount):
                totals.set(account, (totals.exists(account) ? totals.get(account) : 0) + amount);
            case Withdrawal(account, amount):
                totals.set(account, (totals.exists(account) ? totals.get(account) : 0) - amount);
            case Note(_):
        }
    }

    static function sieve(limit: Int): Array<Int> {
        var flags = [for (index in 0...(limit + 1)) index > 1];
        var number = 2;
        while (number * number <= limit) {
            if (flags[number]) {
                var multiple = number * number;
                while (multiple <= limit) {
                    flags[multiple] = false;
                    multiple += number;
                }
            }
            number += 1;
        }
        return [for (index in 2...(limit + 1)) if (flags[index]) index];
    }

    static function main() {
        print("WASMVerse Haxe showcase");
        print("Stage one: enums model ledger events");
        var events = [
            Deposit("alpha", 120),
            Deposit("beta", 75),
            Withdrawal("alpha", 40),
            Note("midday reconciliation"),
            Deposit("beta", 25),
            Withdrawal("beta", 10)
        ];
        for (event in events) {
            print("event: " + describe(event));
        }
        print("Stage two: maps fold the ledger");
        var totals = new Map<String, Int>();
        for (event in events) {
            applyEvent(totals, event);
        }
        var accounts = [for (account in totals.keys()) account];
        accounts.sort((left, right) -> Reflect.compare(left, right));
        for (account in accounts) {
            print(account + " balance: " + totals.get(account));
        }
        print("Stage three: array comprehension drives a sieve");
        var primes = sieve(400);
        var oddSquareHeads = [];
        for (prime in primes) {
            if (prime % 2 == 1) {
                oddSquareHeads.push(prime * prime);
            }
            if (oddSquareHeads.length >= 6) {
                break;
            }
        }
        print("prime count up to 400: " + primes.length);
        print("largest prime: " + primes[primes.length - 1]);
        print("odd square heads: " + oddSquareHeads.join(", "));
        print("Showcase complete.");
    }
}

enum LedgerEvent {
    Deposit(account: String, amount: Int);
    Withdrawal(account: String, amount: Int);
    Note(text: String);
}
