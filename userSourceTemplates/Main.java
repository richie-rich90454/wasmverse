import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class Main {
    public sealed interface LedgerEntry permits Deposit, Withdrawal, Note {}
    public record Deposit(String account, int amount) implements LedgerEntry {}
    public record Withdrawal(String account, int amount) implements LedgerEntry {}
    public record Note(String text) implements LedgerEntry {}

    static String describe(LedgerEntry entry) {
        return switch (entry) {
            case Deposit deposit -> "deposit " + deposit.amount() + " to " + deposit.account();
            case Withdrawal withdrawal -> "withdraw " + withdrawal.amount() + " from " + withdrawal.account();
            case Note note -> "note: " + note.text();
        };
    }

    static List<Integer> sieve(int limit) {
        boolean[] flags = new boolean[limit + 1];
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
        List<Integer> primes = new ArrayList<>();
        for (int index = 2; index <= limit; index++) {
            if (flags[index]) {
                primes.add(index);
            }
        }
        return primes;
    }

    public static void main(String[] args) {
        System.out.println("WASMVerse Java showcase");
        System.out.println("Stage one: records model ledger entries");
        List<LedgerEntry> entries = List.of(
            new Deposit("alpha", 120),
            new Deposit("beta", 75),
            new Withdrawal("alpha", 40),
            new Note("midday reconciliation")
        );
        for (LedgerEntry entry : entries) {
            System.out.println(describe(entry));
        }
        System.out.println("Stage two: switch patterns summarize balances");
        Map<String, Integer> totals = new HashMap<>();
        for (LedgerEntry entry : entries) {
            switch (entry) {
                case Deposit deposit -> totals.merge(deposit.account(), deposit.amount(), Integer::sum);
                case Withdrawal withdrawal -> totals.merge(withdrawal.account(), -withdrawal.amount(), Integer::sum);
                case Note ignored -> {}
            }
        }
        for (String account : totals.keySet().stream().sorted().toList()) {
            System.out.println(account + " balance: " + totals.get(account));
        }
        System.out.println("Stage three: prime stream and window sums");
        List<Integer> primes = sieve(900);
        long windowSum = 0;
        for (int index = 0; index < 6 && index < primes.size(); index++) {
            windowSum += primes.get(index);
        }
        System.out.println("prime count up to 900: " + primes.size());
        System.out.println("largest prime: " + primes.get(primes.size() - 1));
        System.out.println("first window sum: " + windowSum);
        System.out.println("Showcase complete.");
    }
}
