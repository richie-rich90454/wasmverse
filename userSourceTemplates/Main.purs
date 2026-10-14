module Main where

import Prelude

import Effect (Effect)
import WasmverseHost (wasmversePrint)

data LedgerEvent
    = Deposit String Int
    | Withdrawal String Int
    | Note String

derive instance eqLedgerEvent :: Eq LedgerEvent

instance showLedgerEvent :: Show LedgerEvent where
    show (Deposit account amount) = "(Deposit " <> show account <> " " <> show amount <> ")"
    show (Withdrawal account amount) = "(Withdrawal " <> show account <> " " <> show amount <> ")"
    show (Note text) = "(Note " <> show text <> ")"

data Chain a = Done | Link a (Chain a)

data Ledger = Ledger Int Int

instance showLedger :: Show Ledger where
    show (Ledger alpha beta) =
        "(Ledger " <> show alpha <> " " <> show beta <> ")"

events :: Chain LedgerEvent
events =
    Link
        (Deposit "alpha" 120)
        ( Link
            (Deposit "beta" 75)
            ( Link
                (Withdrawal "alpha" 40)
                ( Link
                    (Note "midday reconciliation")
                    ( Link
                        (Deposit "beta" 25)
                        (Link (Withdrawal "beta" 10) Done)
                    )
                )
            )
        )

chainLength :: forall a. Chain a -> Int
chainLength Done = 0
chainLength (Link _ rest) = 1 + chainLength rest

foldChain :: forall a b. (b -> a -> b) -> b -> Chain a -> b
foldChain _ accumulator Done = accumulator
foldChain step accumulator (Link value rest) = foldChain step (step accumulator value) rest

applyEvent :: Ledger -> LedgerEvent -> Ledger
applyEvent (Ledger alpha beta) event = case event of
    Deposit account amount
        | account == "alpha" -> Ledger (alpha + amount) beta
        | otherwise -> Ledger alpha (beta + amount)
    Withdrawal account amount
        | account == "alpha" -> Ledger (alpha - amount) beta
        | otherwise -> Ledger alpha (beta - amount)
    Note _ -> Ledger alpha beta

countNotes :: Chain LedgerEvent -> Int
countNotes = foldChain countOne 0
  where
  countOne total event = case event of
      Note _ -> total + 1
      _ -> total

isPrime :: Int -> Boolean
isPrime candidate = candidate > 1 && noDivisor 2
  where
  noDivisor divisor
    | divisor * divisor > candidate = true
    | mod candidate divisor == 0 = false
    | otherwise = noDivisor (divisor + 1)

countPrimesUpTo :: Int -> Int
countPrimesUpTo limit = go 2 0
  where
  go current found
    | current > limit = found
    | isPrime current = go (current + 1) (found + 1)
    | otherwise = go (current + 1) found

main :: Effect Unit
main = do
    wasmversePrint "WASMVerse PureScript showcase"
    wasmversePrint "Stage one: algebraic data types and recursive folds"
    wasmversePrint ("event count: " <> show (chainLength events))
    wasmversePrint ("ledger totals: " <> show (foldChain applyEvent (Ledger 0 0) events))
    wasmversePrint "Stage two: guarded pattern matches inside a fold"
    wasmversePrint ("note count: " <> show (countNotes events))
    wasmversePrint "Stage three: recursion under an effect"
    wasmversePrint ("prime count up to 200: " <> show (countPrimesUpTo 200))
    wasmversePrint "Showcase complete."
