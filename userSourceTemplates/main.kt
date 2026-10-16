external fun wasmversePrint(text: String)

sealed class LedgerEvent {
    data class Deposit(val account: String, val amount: Int) : LedgerEvent()
    data class Withdrawal(val account: String, val amount: Int) : LedgerEvent()
    data class Note(val text: String) : LedgerEvent()
}

fun balances(events: List<LedgerEvent>): Map<String, Int> {
    val totals = mutableMapOf<String, Int>()
    for (event in events) {
        when (event) {
            is LedgerEvent.Deposit -> totals[event.account] = (totals[event.account] ?: 0) + event.amount
            is LedgerEvent.Withdrawal -> totals[event.account] = (totals[event.account] ?: 0) - event.amount
            is LedgerEvent.Note -> {}
        }
    }
    return totals
}

fun sieve(limit: Int): List<Int> {
    if (limit < 2) {
        return emptyList()
    }
    val flags = BooleanArray(limit + 1) { true }
    flags[0] = false
    flags[1] = false
    var number = 2
    while (number * number <= limit) {
        if (flags[number]) {
            var multiple = number * number
            while (multiple <= limit) {
                flags[multiple] = false
                multiple += number
            }
        }
        number += 1
    }
    return (2..limit).filter { flags[it] }
}

fun main() {
    wasmversePrint("WASMVerse Kotlin/JS showcase")
    wasmversePrint("Stage one: sealed hierarchies model ledger events")
    val events = listOf(
        LedgerEvent.Deposit("alpha", 120),
        LedgerEvent.Deposit("beta", 75),
        LedgerEvent.Withdrawal("alpha", 40),
        LedgerEvent.Note("midday reconciliation"),
        LedgerEvent.Deposit("beta", 25),
        LedgerEvent.Withdrawal("beta", 10)
    )
    val totals = balances(events)
    for (account in totals.keys.sorted()) {
        wasmversePrint("$account balance: ${totals[account]}")
    }
    wasmversePrint("Stage two: sequence pipelines over a prime stream")
    val pipeline = sieve(400).asSequence()
        .filter { it % 2 == 1 }
        .map { it * it }
        .take(8)
        .toList()
    wasmversePrint("odd square heads: ${pipeline.joinToString(", ")}")
    wasmversePrint("Stage three: ordered windows and grouped residues")
    val primes = sieve(900)
    val windows = primes.windowed(6, 3).take(4).map { it.sum() }
    wasmversePrint("prime count up to 900: ${primes.size}")
    wasmversePrint("largest prime: ${primes.last()}")
    wasmversePrint("window sums: ${windows.joinToString(", ")}")
    wasmversePrint("Showcase complete.")
}
