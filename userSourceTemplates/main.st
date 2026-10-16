"WASMVerse Smalltalk showcase. Supported: numbers, strings, symbols, characters,
arrays, blocks with value/whileTrue:/ifTrue:, collection pipelines, Transcript,
StandardInput, FileStream, Compiler evaluate:, and Smalltalk at:at:put:."

limit := 400.
primes := (2 to: limit) select: [ :candidate |
    (2 to: candidate - 1) inject: true into: [ :flag :divisor |
        flag and: [ candidate \\ divisor ~= 0 ] ] ].

Transcript showCr: 'WASMVerse Smalltalk showcase'.
Transcript showCr: 'Stage one: functional prime sieve'.
Transcript showCr: 'prime count up to 400: ', primes size printString.
Transcript showCr: 'largest prime: ', primes last printString.

Transcript showCr: 'Stage two: collection pipelines'.
headSquares := (primes copyFrom: 1 to: 10) collect: [ :prime | prime * prime ].
Transcript showCr: 'square heads: ', headSquares printString.
Transcript showCr: 'sum of square heads: ', (headSquares inject: 0 into: [ :sum :value | sum + value ]) printString.

Transcript showCr: 'Stage three: residue classes'.
Transcript showCr: 'residue zero under 7: ', (primes select: [ :prime | prime \\ 7 = 0 ]) size printString.
Transcript showCr: 'residue zero under 5: ', (primes select: [ :prime | prime \\ 5 = 0 ]) size printString.

Transcript showCr: 'Stage four: cascades and streams'.
(FileStream fileNamed: 'report.txt') nextPutAll: 'primes counted'; close.
Transcript showCr: 'report: ', ((FileStream readOnlyFileNamed: 'report.txt') contentsOfEntireFile).

Transcript showCr: 'Showcase complete.'.
