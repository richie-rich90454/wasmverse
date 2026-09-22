import asyncio
import dataclasses
import math
from collections import deque


@dataclasses.dataclass(frozen=True)
class WorkItem:
    label: str
    limit: int


def sieve(limit: int) -> list[int]:
    flags = [True] * (limit + 1)
    flags[0] = False
    flags[1] = False
    number = 2
    while number * number <= limit:
        if flags[number]:
            multiple = number * number
            while multiple <= limit:
                flags[multiple] = False
                multiple += number
        number += 1
    return [index for index, keep in enumerate(flags) if keep]


class RollingStats:
    def __init__(self) -> None:
        self.samples: deque[int] = deque(maxlen=8)

    def record(self, value: int) -> None:
        self.samples.append(value)

    def mean(self) -> float:
        if not self.samples:
            return 0.0
        return sum(self.samples) / len(self.samples)


async def worker(worker_id: int, queue: asyncio.Queue, results: list, stats: RollingStats) -> None:
    while True:
        item = await queue.get()
        try:
            if item is None:
                return
            primes = sieve(item.limit)
            largest = primes[-1] if primes else 0
            stats.record(len(primes))
            results.append((worker_id, item.label, len(primes), largest))
            print(f"worker {worker_id} processed {item.label}: {len(primes)} primes up to {item.limit}")
        finally:
            queue.task_done()


async def main() -> None:
    print("WASMVerse Python showcase")
    print("Stage one: dataclass pipeline over a prime sieve")
    queue: asyncio.Queue = asyncio.Queue()
    results: list = []
    stats = RollingStats()
    items = [WorkItem(f"window-{index:02d}", 4000 + index * 1500) for index in range(8)]
    for item in items:
        queue.put_nowait(item)
    workers = [asyncio.create_task(worker(worker_id, queue, results, stats)) for worker_id in range(3)]
    await queue.join()
    for _ in workers:
        queue.put_nowait(None)
    await asyncio.gather(*workers)
    results.sort(key=lambda row: row[1])
    total_primes = sum(row[2] for row in results)
    print(f"workers finished: {len(results)} windows, {total_primes} primes total")
    print(f"rolling mean of primes per window: {stats.mean():.2f}")
    print("Stage two: matrix rotation and frequency analysis")
    matrix = [[(row * 7 + column * 3) % 29 for column in range(6)] for row in range(6)]
    rotated = [list(row) for row in zip(*matrix[::-1])]
    flat = [value for row in rotated for value in row]
    frequency: dict[int, int] = {}
    for value in flat:
        frequency[value] = frequency.get(value, 0) + 1
    top_value, top_count = max(frequency.items(), key=lambda pair: pair[1])
    print(f"rotated corner values: {rotated[0][0]}, {rotated[0][-1]}, {rotated[-1][0]}, {rotated[-1][-1]}")
    print(f"most frequent residue: {top_value} appears {top_count} times")
    print(f"rotated row sums: {[sum(row) for row in rotated]}")
    print("Stage three: deterministic sampling")
    sample = [math.isqrt(index * index + index) for index in range(1, 11)]
    print(f"integer roots: {sample}")
    print("Stage four: interactive sieve limit")
    try:
        raw_limit = input("Enter a sieve limit between 10 and 5000: ")
    except EOFError:
        raw_limit = ""
    try:
        chosen_limit = int(raw_limit.strip())
    except ValueError:
        chosen_limit = 0
    if chosen_limit < 10 or chosen_limit > 5000:
        chosen_limit = 500
        print("Using the default limit of 500.")
    chosen_primes = sieve(chosen_limit)
    print(f"primes up to {chosen_limit}: {len(chosen_primes)}")
    print("Showcase complete.")


if __name__ == "__main__":
    asyncio.run(main())
