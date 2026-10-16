@val external wasmversePrint: string => unit = "wasmversePrint"

type ledgerEvent =
    | Deposit({account: string, amount: int})
    | Withdrawal({account: string, amount: int})
    | Note(string)

let describe = event =>
    switch event {
    | Deposit({account, amount}) => account ++ " +" ++ Int.toString(amount)
    | Withdrawal({account, amount}) => account ++ " -" ++ Int.toString(amount)
    | Note(text) => "note: " ++ text
    }

let applyEvent = (totals, event) =>
    switch event {
    | Deposit({account, amount}) => {
        let current = totals->Map.get(account)->Option.getOr(0)
        totals->Map.set(account, current + amount)
    }
    | Withdrawal({account, amount}) => {
        let current = totals->Map.get(account)->Option.getOr(0)
        totals->Map.set(account, current - amount)
    }
    | Note(_) => ()
    }

let sieve = limit => {
    let flags = Array.make(~length=limit + 1, true)
    for index in 0 to 1 {
        flags[index] = false
    }
    let number = ref(2)
    while number.contents * number.contents <= limit {
        if flags[number.contents]->Option.getOr(false) {
            let multiple = ref(number.contents * number.contents)
            while multiple.contents <= limit {
                flags[multiple.contents] = false
                multiple := multiple.contents + number.contents
            }
        }
        number := number.contents + 1
    }
    let primes = []
    for index in 2 to limit {
        if flags[index]->Option.getOr(false) {
            primes->Array.push(index)
        }
    }
    primes
}

let events = [
    Deposit({account: "alpha", amount: 120}),
    Deposit({account: "beta", amount: 75}),
    Withdrawal({account: "alpha", amount: 40}),
    Note("midday reconciliation"),
    Deposit({account: "beta", amount: 25}),
    Withdrawal({account: "beta", amount: 10}),
]

wasmversePrint("WASMVerse ReScript showcase")
wasmversePrint("Stage one: variants model ledger events")
events->Belt.Array.forEach(event => wasmversePrint("event: " ++ describe(event)))
wasmversePrint("Stage two: mutable maps fold the ledger")
let totals = Map.make()
events->Belt.Array.forEach(event => applyEvent(totals, event))
totals->Map.keys->Iterator.toArray->Belt.Array.forEach(account =>
    wasmversePrint(
        account ++ " balance: " ++ Int.toString(totals->Map.get(account)->Option.getOr(0)),
    )
)
wasmversePrint("Stage three: a mutable sieve feeds a pipe-first pipeline")
let primes = sieve(400)
let oddSquareHeads =
    primes
    ->Belt.Array.keep(value => value % 2 == 1)
    ->Belt.Array.map(value => value * value)
    ->Belt.Array.slice(~offset=0, ~len=6)
wasmversePrint("prime count up to 400: " ++ Int.toString(Array.length(primes)))
wasmversePrint("largest prime: " ++ Int.toString(primes[Array.length(primes) - 1]->Option.getOr(0)))
wasmversePrint(
    "odd square heads: " ++
    Belt.Array.joinWith(oddSquareHeads, ", ", value => Int.toString(value)),
)
wasmversePrint("Showcase complete.")
