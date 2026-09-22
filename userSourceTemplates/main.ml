type expr =
  | Number of int
  | Add of expr * expr
  | Mul of expr * expr

let rec evaluate = function
  | Number value -> value
  | Add (left, right) -> evaluate left + evaluate right
  | Mul (left, right) -> evaluate left * evaluate right

let sieve limit =
  let flags = Array.make (limit + 1) true in
  flags.(0) <- false;
  flags.(1) <- false;
  let number = ref 2 in
  while !number * !number <= limit do
    if flags.(!number) then begin
      let multiple = ref (!number * !number) in
      while !multiple <= limit do
        flags.(!multiple) <- false;
        multiple := !multiple + !number
      done
    end;
    number := !number + 1
  done;
  let primes = ref [] in
  for index = limit downto 2 do
    if flags.(index) then primes := index :: !primes
  done;
  !primes

let () =
  print_endline "WASMVerse OCaml showcase";
  print_endline "Stage one: variants model an expression tree";
  let tree = Mul (Add (Number 40, Number 1), Number 2) in
  Printf.printf "(40 + 1) * 2 = %d\n" (evaluate tree);
  print_endline "Stage two: folds summarize a prime stream";
  let primes = sieve 900 in
  let count = List.length primes in
  let largest = List.hd (List.rev primes) in
  let window_sum = List.fold_left ( + ) 0 [40; 1; 2; 7; 11; 13] in
  Printf.printf "prime count up to 900: %d\n" count;
  Printf.printf "largest prime: %d\n" largest;
  Printf.printf "sample window sum: %d\n" window_sum;
  print_endline "Stage three: pattern matching over residues";
  let residues = List.map (fun prime -> prime mod 10) primes in
  let even_count = List.fold_left (fun total residue -> if residue mod 2 = 0 then total + 1 else total) 0 residues in
  Printf.printf "even residues: %d of %d\n" even_count count;
  print_endline "Showcase complete."
