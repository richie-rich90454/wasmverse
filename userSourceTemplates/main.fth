\ WASMVerse Forth showcase
\ Supported words: DUP DROP SWAP OVER ROT DEPTH + - * / MOD NEGATE ABS 1+ 1- MIN MAX
\ AND OR XOR INVERT = <> < > <= >= 0= 0< 0> . EMIT CR SPACE TYPE KEY ACCEPT SOURCE
\ EVALUATE VARIABLE ! @ +! ? BL TRUE FALSE ARGC ARG I INCLUDE READ-FILE
\ Control words: IF ELSE THEN DO LOOP BEGIN UNTIL WHILE REPEAT : ; EXIT
\ Strings: S" ..." and ." ..."

VARIABLE LIMIT
VARIABLE COUNT
VARIABLE CURRENT

: ADD-PRIME ( n -- )
    COUNT @ 4096 + !
    1 COUNT +! ;

: PRIME? ( n -- flag )
    CURRENT !
    0
    BEGIN
        DUP COUNT @ <
    WHILE
        DUP 4096 + @
        CURRENT @
        SWAP MOD
        0=
        IF
            DROP
            0 EXIT
        THEN
        1+
    REPEAT
    DROP
    -1 ;

: SIEVE ( limit -- )
    LIMIT !
    2 4096 !
    1 COUNT !
    3
    BEGIN
        DUP LIMIT @ <=
    WHILE
        DUP PRIME? IF DUP ADD-PRIME THEN
        2 +
    REPEAT
    DROP ;

: SUM-SQUARES ( -- total )
    0 0
    BEGIN
        DUP COUNT @ <
    WHILE
        DUP 4096 + @
        DUP *
        ROT +
        SWAP
        1+
    REPEAT
    DROP ;

: COUNT-DIVISIBLE ( modulus -- n )
    0 0
    BEGIN
        DUP COUNT @ <
    WHILE
        DUP 4096 + @
        3 PICK MOD
        0=
        IF SWAP 1+ SWAP THEN
        1+
    REPEAT
    DROP
    SWAP DROP ;

VARIABLE HEAD-LIMIT

: .FIRST-PRIMES ( count -- )
    HEAD-LIMIT !
    0
    BEGIN
        DUP HEAD-LIMIT <
    WHILE
        DUP 4096 + @ .
        1+
    REPEAT
    DROP ;

." WASMVerse Forth showcase" CR
." Stage one: prime sieve up to 400" CR
400 SIEVE
." prime count: " COUNT @ . CR
." largest prime: " COUNT @ 1- 4096 + @ . CR
." prime heads: " 10 .FIRST-PRIMES CR
." Stage two: sum of prime squares" CR
." sum of squares: " SUM-SQUARES . CR
." Stage three: residue classes" CR
." residue zero under 7: " 7 COUNT-DIVISIBLE . CR
." residue zero under 5: " 5 COUNT-DIVISIBLE . CR
." Stage four: program arguments" CR
." argument count: " ARGC . CR
: REPORT-FIRST-ARG
    ARGC 0>
    IF
        ." first argument: " 0 ARG TYPE CR
    THEN ;
REPORT-FIRST-ARG
." Showcase complete." CR
