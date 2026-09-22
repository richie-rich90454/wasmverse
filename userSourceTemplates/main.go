package main

import (
	"fmt"
	"sort"
	"sync"
)

type windowResult struct {
	worker  int
	label   string
	count   int
	largest int
}

func sieve(limit int) []int {
	if limit < 2 {
		return nil
	}
	flags := make([]bool, limit+1)
	for index := 2; index <= limit; index++ {
		flags[index] = true
	}
	for number := 2; number*number <= limit; number++ {
		if flags[number] {
			for multiple := number * number; multiple <= limit; multiple += number {
				flags[multiple] = false
			}
		}
	}
	primes := make([]int, 0, limit/6)
	for index := 2; index <= limit; index++ {
		if flags[index] {
			primes = append(primes, index)
		}
	}
	return primes
}

func rollingSums(values []int, width int) []int {
	sums := make([]int, 0, len(values)-width+1)
	for start := 0; start+width <= len(values); start++ {
		total := 0
		for offset := 0; offset < width; offset++ {
			total += values[start+offset]
		}
		sums = append(sums, total)
	}
	return sums
}

func main() {
	fmt.Println("WASMVerse Go showcase")
	fmt.Println("Stage one: worker pool with channel fan-out")

	jobs := make(chan struct {
		label string
		limit int
	}, 8)
	results := make(chan windowResult, 8)
	var waitGroup sync.WaitGroup

	for workerID := 1; workerID <= 4; workerID++ {
		waitGroup.Add(1)
		go func(id int) {
			defer waitGroup.Done()
			for job := range jobs {
				primes := sieve(job.limit)
				largest := 0
				if len(primes) > 0 {
					largest = primes[len(primes)-1]
				}
				results <- windowResult{worker: id, label: job.label, count: len(primes), largest: largest}
			}
		}(workerID)
	}

	for index := 1; index <= 8; index++ {
		jobs <- struct {
			label string
			limit int
		}{label: fmt.Sprintf("shard-%02d", index), limit: 2500 + index*500}
	}
	close(jobs)

	go func() {
		waitGroup.Wait()
		close(results)
	}()

	collected := make([]windowResult, 0, 8)
	totalPrimes := 0
	for result := range results {
		collected = append(collected, result)
		totalPrimes += result.count
		fmt.Printf("worker %d processed %s: %d primes, largest %d\n",
			result.worker, result.label, result.count, result.largest)
	}

	sort.Slice(collected, func(left, right int) bool {
		return collected[left].label < collected[right].label
	})
	fmt.Printf("windows completed: %d, prime totals: %d\n", len(collected), totalPrimes)

	fmt.Println("Stage two: rolling windows over a shared prime stream")
	shared := sieve(1500)
	sums := rollingSums(shared, 12)
	fmt.Printf("shared prime count: %d\n", len(shared))
	fmt.Printf("first window sums:")
	for index := 0; index < 6 && index < len(sums); index++ {
		fmt.Printf(" %d", sums[index])
	}
	fmt.Println()

	fmt.Println("Stage three: pipeline stages over labeled records")
	type record struct {
		name  string
		score int
	}
	records := []record{{"alpha", 7}, {"beta", 12}, {"gamma", 3}, {"delta", 15}}
	scores := make(chan int, len(records))
	var scoreGroup sync.WaitGroup
	for _, entry := range records {
		scoreGroup.Add(1)
		go func(value record) {
			defer scoreGroup.Done()
			scores <- value.score * value.score
		}(entry)
	}
	go func() {
		scoreGroup.Wait()
		close(scores)
	}()
	total := 0
	for square := range scores {
		total += square
	}
	fmt.Printf("sum of squares across records: %d\n", total)
	fmt.Println("Showcase complete.")
}
