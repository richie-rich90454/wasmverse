(* WASMVerse Standard ML showcase.
   Runs once the Standard ML toolchain is provisioned under ./.tools/sml/;
   see pnpm run setup. The runtime is invoked as app.js. *)

fun sieve limit =
    let
        val flags = Array.array (limit + 1, true)
        fun mark multiple =
            if multiple > limit then ()
            else (Array.update (flags, multiple, false); mark (multiple + 2))
        fun strike number =
            if number * number > limit then ()
            else if Array.sub (flags, number) then
                (mark (number + number); strike (number + 1))
            else strike (number + 1)
    in
        Array.update (flags, 0, false);
        Array.update (flags, 1, false);
        strike 2;
        List.tabulate (limit + 1, fn index => (index, Array.sub (flags, index)))
    end

fun collectPrimes limit =
    List.map #1 (List.filter #2 (sieve limit))

val () = print "WASMVerse Standard ML showcase\n"

val primes = collectPrimes 200
val () = print ("prime count up to 200: " ^ Int.toString (List.length primes) ^ "\n")
val () = print ("largest prime: " ^ Int.toString (List.last primes) ^ "\n")
val () = print
    ("first five: " ^ String.concatWith ", " (List.map Int.toString (List.take (primes, 5))) ^ "\n")

fun rollingSums values width =
    let
        fun sliceTotal (start, count, total) =
            if count = 0 then total
            else sliceTotal (start + 1, count - 1, total + List.nth (values, start))
        fun collect (start, totals) =
            if start + width > List.length values then List.rev totals
            else collect (start + 1, sliceTotal (start, width, 0) :: totals)
    in
        collect (0, [])
    end

val windowSums = rollingSums primes 10
val () = print
    ("window sums: " ^ String.concatWith ", " (List.map Int.toString windowSums) ^ "\n")

val () = print "Showcase complete.\n"
