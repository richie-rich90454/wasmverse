import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.stream.Collectors;

public class Main {
    static class Movement {
        final String account;
        final int amount;
        final boolean deposit;

        Movement(String account, int amount, boolean deposit) {
            this.account = account;
            this.amount = amount;
            this.deposit = deposit;
        }

        String describe() {
            if (deposit) {
                return "deposit " + amount + " to " + account;
            }
            return "withdraw " + amount + " from " + account;
        }

        int signedAmount() {
            return deposit ? amount : -amount;
        }
    }

    static List<Integer> sieve(int limit) {
        boolean[] flags = new boolean[limit + 1];
        Arrays.fill(flags, true);
        if (limit >= 0) {
            flags[0] = false;
        }
        if (limit >= 1) {
            flags[1] = false;
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
        System.out.println("Stage one: lambdas describe ledger movements");
        List<Movement> movements = Arrays.asList(
            new Movement("alpha", 120, true),
            new Movement("beta", 75, true),
            new Movement("alpha", 40, false),
            new Movement("beta", 10, false)
        );
        movements.stream().map(Movement::describe).forEach(System.out::println);
        System.out.println("Stage two: collectors summarize balances");
        Map<String, Integer> totals = movements.stream().collect(
            Collectors.groupingBy(
                movement -> movement.account,
                TreeMap::new,
                Collectors.summingInt(Movement::signedAmount)
            )
        );
        totals.forEach((account, total) -> System.out.println(account + " balance: " + total));
        List<Map.Entry<String, Integer>> ranked = totals.entrySet().stream()
            .sorted(Comparator.comparing(Map.Entry<String, Integer>::getValue).reversed())
            .collect(Collectors.toList());
        System.out.println("top account: " + ranked.get(0).getKey());
        System.out.println("Stage three: prime stream and window sums");
        List<Integer> primes = sieve(900);
        long windowSum = primes.stream().limit(6).mapToLong(Integer::longValue).sum();
        System.out.println("prime count up to 900: " + primes.size());
        System.out.println("largest prime: " + primes.get(primes.size() - 1));
        System.out.println("first window sum: " + windowSum);
        System.out.println("Showcase complete.");
    }
}
