import scala.scalajs.js

case class Reading(label: String, amount: Int)

sealed trait Event
case class Recorded(reading: Reading) extends Event
case class Adjusted(reading: Reading, delta: Int) extends Event

def settle(events: List[Event]): List[Reading] =
    events.foldLeft(List.empty[Reading]) { (ledger, event) =>
        event match
            case Recorded(reading) => ledger :+ reading
            case Adjusted(reading, delta) =>
                ledger.map(existing =>
                    if existing.label == reading.label then
                        existing.copy(amount = existing.amount + delta)
                    else existing
                )
    }

def describe(readings: List[Reading]): String =
    readings.map(reading => s"${reading.label}=${reading.amount}").mkString(", ")

@main def main(): Unit =
    val events = List(
        Recorded(Reading("alpha", 7)),
        Recorded(Reading("beta", 12)),
        Adjusted(Reading("alpha", 0), 5),
        Recorded(Reading("gamma", 3))
    )
    val ledger = settle(events)
    js.Dynamic.global.wasmversePrint("WASMVerse Scala showcase")
    js.Dynamic.global.wasmversePrint(s"settled ledger: ${describe(ledger)}")
    val total = ledger.map(_.amount).sum
    js.Dynamic.global.wasmversePrint(s"total recorded: $total")
    val doubled = ledger.map(reading => reading.copy(amount = reading.amount * 2))
    js.Dynamic.global.wasmversePrint(s"doubled view: ${describe(doubled)}")
    js.Dynamic.global.wasmversePrint("Showcase complete.")
