module Main

open Fable.Core
open Fable.Core.JsInterop

[<Emit("globalThis.wasmversePrint($0)")>]
let emitPrint (text: string): unit = jsNative

type Entry =
    | Word of string
    | Number of int

let describe (entry: Entry): string =
    match entry with
    | Word word -> sprintf "word:%s" word
    | Number number -> sprintf "number:%d" number

let score (entry: Entry): int =
    match entry with
    | Word word -> word.Length * 3
    | Number number -> number % 10

let entries = [ Word "parse"; Number 42; Word "render"; Number 7; Word "tokenize" ]
let ranked = entries |> List.sortByDescending score
let joined = ranked |> List.map describe |> String.concat " > "

emitPrint "WASMVerse F# showcase"
emitPrint (sprintf "ranked entries: %s" joined)
let total = entries |> List.sumBy score
emitPrint (sprintf "aggregate score: %d" total)
let words = entries |> List.choose (function Word word -> Some word | _ -> None)
emitPrint (sprintf "word entries: %d of %d" words.Length entries.Length)
emitPrint "Showcase complete."
