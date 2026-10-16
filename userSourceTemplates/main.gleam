@external(javascript, "./wasmverse_host.mjs", "wasmversePrint")
fn wasmverse_print(text: String) -> Nil

@external(javascript, "./wasmverse_host.mjs", "wasmverseIntText")
fn int_text(value: Int) -> String

type LedgerEvent {
  Deposit(account: String, amount: Int)
  Withdrawal(account: String, amount: Int)
  Note(text: String)
}

fn describe(event: LedgerEvent) -> String {
  case event {
    Deposit(account, amount) -> account <> " +" <> int_text(amount)
    Withdrawal(account, amount) -> account <> " -" <> int_text(amount)
    Note(text) -> "note: " <> text
  }
}

fn describe_all(events: List(LedgerEvent)) -> Nil {
  case events {
    [] -> Nil
    [event, ..rest] -> {
      wasmverse_print("event: " <> describe(event))
      describe_all(rest)
    }
  }
}

fn net_total(events: List(LedgerEvent)) -> Int {
  case events {
    [] -> 0
    [Deposit(_, amount), ..rest] -> amount + net_total(rest)
    [Withdrawal(_, amount), ..rest] -> net_total(rest) - amount
    [Note(_), ..rest] -> net_total(rest)
  }
}

fn classify(value: Int) -> Result(Int, String) {
  case value % 2 == 0 {
    True -> Ok(value)
    False -> Error("odd: " <> int_text(value))
  }
}

fn sum_evens(values: List(Int)) -> Int {
  case values {
    [] -> 0
    [value, ..rest] ->
      case classify(value) {
        Ok(even) -> even + sum_evens(rest)
        Error(_) -> sum_evens(rest)
      }
  }
}

pub fn main() {
  let events = [
    Deposit("alpha", 120),
    Deposit("beta", 75),
    Withdrawal("alpha", 40),
    Note("midday reconciliation"),
    Deposit("beta", 25),
    Withdrawal("beta", 10),
  ]
  wasmverse_print("WASMVerse Gleam showcase")
  wasmverse_print("Stage one: custom types describe ledger events")
  describe_all(events)
  wasmverse_print("Stage two: list recursion folds the ledger")
  wasmverse_print("net total: " <> int_text(net_total(events)))
  wasmverse_print("Stage three: results filter a typed pipeline")
  wasmverse_print("even sum: " <> int_text(sum_evens([1, 2, 3, 4, 5, 6, 7, 8])))
  wasmverse_print("Showcase complete.")
}
