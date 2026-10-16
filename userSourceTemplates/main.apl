⍝ WASMVerse APL showcase
⎕←'WASMVerse APL showcase'
⎕←'stage one: reductions and factorials'
⎕←'sum of 1..100: ',∊⍕+/⍳100
⎕←'factorial of 8: ',∊⍕!8
⎕←'stage two: a prime sieve below 60'
primes←(2=+⌿0=(⍳60)∘.|⍳60)/⍳60
⎕←'prime count: ',∊⍕≢primes
⎕←'largest prime: ',∊⍕⌈/primes
⎕←'stage three: a defined function'
mean←{(+/⍵)÷≢⍵}
⎕←'mean of 2 4 6 8: ',∊⍕mean 2 4 6 8
⎕←'stage four: interactive input'
⎕←'type anything> '
name←⎕
⎕←'you typed: ',name
⎕←'Showcase complete.'
