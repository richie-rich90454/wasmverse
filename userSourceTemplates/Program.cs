using System;
using System.Collections.Generic;
using System.Linq;

record Movement(string Account, int Amount, bool IsDeposit);

class Program {
    static string Describe(Movement movement) => movement switch {
        { IsDeposit: true } => $"deposit {movement.Amount} to {movement.Account}",
        { IsDeposit: false } => $"withdraw {movement.Amount} from {movement.Account}",
    };

    static IEnumerable<int> Primes(int limit) {
        if (limit < 2) {
            yield break;
        }
        bool[] flags = new bool[limit + 1];
        for (int index = 2; index <= limit; index++) {
            flags[index] = true;
        }
        for (int number = 2; number * number <= limit; number++) {
            if (flags[number]) {
                for (int multiple = number * number; multiple <= limit; multiple += number) {
                    flags[multiple] = false;
                }
            }
        }
        for (int index = 2; index <= limit; index++) {
            if (flags[index]) {
                yield return index;
            }
        }
    }

    static void Main() {
        Console.WriteLine("WASMVerse C# showcase");
        Console.WriteLine("Stage one: records describe ledger movements");
        List<Movement> movements = new() {
            new Movement("alpha", 120, true),
            new Movement("beta", 75, true),
            new Movement("alpha", 40, false),
            new Movement("beta", 10, false),
        };
        foreach (Movement movement in movements) {
            Console.WriteLine(Describe(movement));
        }
        Console.WriteLine("Stage two: LINQ chains summarize balances");
        var totals = movements
            .GroupBy(movement => movement.Account)
            .Select(group => new {
                Account = group.Key,
                Total = group.Sum(movement => movement.IsDeposit ? movement.Amount : -movement.Amount),
            })
            .OrderByDescending(row => row.Total);
        foreach (var row in totals) {
            Console.WriteLine($"{row.Account} balance: {row.Total}");
        }
        Console.WriteLine("Stage three: prime stream and window sums");
        List<int> primes = Primes(900).ToList();
        var windows = primes.Take(12).Select((value, index) => new { value, index })
            .GroupBy(slot => slot.index / 6)
            .Select(group => group.Sum(slot => slot.value))
            .ToList();
        Console.WriteLine($"prime count up to 900: {primes.Count}");
        Console.WriteLine($"largest prime: {primes[^1]}");
        Console.WriteLine($"window sums: {string.Join(", ", windows)}");
        Console.WriteLine("Showcase complete.");
    }
}
