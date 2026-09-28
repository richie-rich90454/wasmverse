<?php

declare(strict_types=1);

function primeSieve(int $limit): array
{
    $flags = array_fill(2, $limit - 1, true);
    $number = 2;
    while ($number * $number <= $limit) {
        if ($flags[$number]) {
            for ($multiple = $number * $number; $multiple <= $limit; $multiple += $number) {
                $flags[$multiple] = false;
            }
        }
        $number++;
    }
    $primes = [];
    foreach ($flags as $value => $keep) {
        if ($keep) {
            $primes[] = $value;
        }
    }
    return $primes;
}

function windowSums(array $values, int $width): array
{
    $sums = [];
    $total = 0;
    foreach ($values as $index => $value) {
        $total += $value;
        if ($index >= $width) {
            $total -= $values[$index - $width];
        }
        if ($index + 1 >= $width) {
            $sums[] = $total;
        }
    }
    return $sums;
}

function labelFor(int $state): string
{
    return match ($state) {
        0 => "queued",
        1 => "running",
        2 => "finished",
        default => "unknown",
    };
}

echo "WASMVerse PHP showcase\n";
echo "Stage one: prime windows and match labels\n";
$primes = primeSieve(300);
$sums = windowSums($primes, 8);
echo "prime count up to 300: " . count($primes) . "\n";
echo "window sums: " . implode(", ", array_slice($sums, 0, 8)) . "\n";
foreach ([0, 1, 2] as $state) {
    echo "state {$state}: " . labelFor($state) . "\n";
}
echo "Stage two: generator pipeline\n";
$generator = (function () {
    $value = 1;
    while ($value <= 40) {
        if ($value % 3 === 0 && $value % 2 === 1) {
            yield $value;
        }
        $value += 2;
    }
})();
$collected = [];
foreach ($generator as $entry) {
    $collected[] = $entry;
}
echo "odd multiples of three up to 40: " . implode(", ", $collected) . "\n";
echo "Stage three: generators drive the typed state machine\n";
$stateMachine = (function () {
    $states = [0, 1, 2];
    foreach ($states as $state) {
        yield labelFor($state);
    }
})();
foreach ($stateMachine as $stateLabel) {
    echo "state machine: {$stateLabel}\n";
}
echo "Stage four: typed accumulator ledger\n";
$ledger = ["alpha" => 0, "beta" => 0, "gamma" => 0];
foreach ($primes as $index => $prime) {
    $key = ["alpha", "beta", "gamma"][$index % 3];
    $ledger[$key] += $prime;
}
foreach ($ledger as $name => $total) {
    echo "{$name} total: {$total}\n";
}
echo "Showcase complete.\n";
