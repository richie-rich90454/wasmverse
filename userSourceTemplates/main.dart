sealed class LedgerEntry {}

class Deposit extends LedgerEntry {
  final String account;
  final int amount;
  Deposit(this.account, this.amount);
}

class Withdrawal extends LedgerEntry {
  final String account;
  final int amount;
  Withdrawal(this.account, this.amount);
}

String describe(LedgerEntry entry) {
  return switch (entry) {
    Deposit(account: var account, amount: var amount) =>
      'deposit $amount to $account',
    Withdrawal(account: var account, amount: var amount) =>
      'withdraw $amount from $account',
  };
}

Stream<int> primeStream(int limit) async* {
  final flags = List<bool>.filled(limit + 1, true);
  if (limit >= 0) {
    flags[0] = false;
  }
  if (limit >= 1) {
    flags[1] = false;
  }
  for (var number = 2; number * number <= limit; number++) {
    if (flags[number]) {
      for (var multiple = number * number; multiple <= limit; multiple += number) {
        flags[multiple] = false;
      }
    }
  }
  for (var index = 2; index <= limit; index++) {
    if (flags[index]) {
      yield index;
    }
  }
}

Future<String> buildReport(List<int> primes) async {
  await Future.delayed(Duration.zero);
  final largest = primes.isEmpty ? 0 : primes.last;
  return 'report over ${primes.length} primes, largest $largest';
}

Future<void> main() async {
  print('WASMVerse Dart showcase');
  print('Stage one: pattern matching over ledger entries');
  final entries = <LedgerEntry>[
    Deposit('alpha', 120),
    Withdrawal('alpha', 40),
    Deposit('beta', 75),
  ];
  for (final entry in entries) {
    print(describe(entry));
  }
  print('Stage two: async stream over a prime sieve');
  final heads = <int>[];
  await for (final prime in primeStream(200).take(10)) {
    heads.add(prime);
  }
  print('first primes: ${heads.join(', ')}');
  print('Stage three: scheduled task builds the live report');
  final primes = await primeStream(900).toList();
  print(await buildReport(primes));
  print('Showcase complete.');
}
