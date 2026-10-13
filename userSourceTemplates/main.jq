def is_prime($n):
    $n >= 2 and all(range(2; $n); . as $divisor | ($divisor * $divisor > $n) or ($n % $divisor != 0));

def primes_below($limit):
    [range(2; $limit) | select(is_prime(.))];

def window_sums($values; $width):
    (range(0; ($values | length) - $width + 1)) as $start |
    ($values[$start:$start + $width] | add);

"WASMVerse jq showcase",
"Stage one: primes below 200",
(primes_below(200) | "prime count: \(length)"),
(primes_below(200) | max | "largest prime: \(.)"),
"Stage two: windowed sums over the first ten primes",
(primes_below(200)[0:10] | window_sums(.; 3) | "window sum: \(.)"),
"Stage three: grouping a ledger by category",
([
    {"entry": "ink", "amount": 12, "category": "supplies"},
    {"entry": "paper", "amount": 48, "category": "supplies"},
    {"entry": "lamp", "amount": 30, "category": "fixtures"},
    {"entry": "stamps", "amount": 9, "category": "postage"}
] | group_by(.category) | map({"category": .[0].category, "total": (map(.amount) | add)}) | .[] | "\(.category): total \(.total)"),
"Showcase complete."
