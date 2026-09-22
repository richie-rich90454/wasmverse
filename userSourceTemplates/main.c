#include <stdio.h>
#include <stdlib.h>
#include <string.h>

typedef struct {
    int *data;
    size_t size;
    size_t capacity;
} IntArena;

typedef enum {
    STATE_QUEUED = 0,
    STATE_RUNNING = 1,
    STATE_DONE = 2
} StateTag;

typedef struct {
    StateTag tag;
    int progress;
} State;

static IntArena arena_create(size_t capacity) {
    IntArena arena;
    arena.data = (int *)malloc(capacity * sizeof(int));
    arena.size = 0;
    arena.capacity = capacity;
    return arena;
}

static void arena_push(IntArena *arena, int value) {
    if (arena->size < arena->capacity) {
        arena->data[arena->size++] = value;
    }
}

static void arena_destroy(IntArena *arena) {
    free(arena->data);
    arena->data = NULL;
    arena->size = 0;
    arena->capacity = 0;
}

static const char *state_name(StateTag tag) {
    switch (tag) {
        case STATE_QUEUED: return "queued";
        case STATE_RUNNING: return "running";
        case STATE_DONE: return "done";
        default: return "unknown";
    }
}

static State advance(State current) {
    State next;
    switch (current.tag) {
        case STATE_QUEUED:
            next.tag = STATE_RUNNING;
            next.progress = 10;
            break;
        case STATE_RUNNING:
            if (current.progress >= 80) {
                next.tag = STATE_DONE;
                next.progress = 100;
            } else {
                next.tag = STATE_RUNNING;
                next.progress = current.progress + 35;
            }
            break;
        default:
            next.tag = STATE_DONE;
            next.progress = 100;
            break;
    }
    return next;
}

static void sieve(int limit, int *out_count, int *out_largest) {
    char *flags = (char *)malloc((size_t)(limit + 1));
    memset(flags, 1, (size_t)(limit + 1));
    flags[0] = 0;
    flags[1] = 0;
    for (int number = 2; number * number <= limit; ++number) {
        if (flags[number]) {
            for (int multiple = number * number; multiple <= limit; multiple += number) {
                flags[multiple] = 0;
            }
        }
    }
    int count = 0;
    int largest = 0;
    for (int index = 2; index <= limit; ++index) {
        if (flags[index]) {
            count += 1;
            largest = index;
        }
    }
    free(flags);
    *out_count = count;
    *out_largest = largest;
}

int main(void) {
    printf("WASMVerse C showcase\n");
    printf("Stage one: bump arena ledger\n");
    IntArena arena = arena_create(32);
    for (int value = 1; value <= 20; ++value) {
        arena_push(&arena, value * value);
    }
    int total = 0;
    for (size_t index = 0; index < arena.size; ++index) {
        total += arena.data[index];
    }
    printf("arena size: %zu, sum of squares: %d\n", arena.size, total);
    arena_destroy(&arena);
    printf("Stage two: tagged union state machine\n");
    State state = { STATE_QUEUED, 0 };
    for (int step = 0; step < 5; ++step) {
        printf("step %d: %s at %d percent\n", step, state_name(state.tag), state.progress);
        state = advance(state);
    }
    printf("Stage three: prime sieve\n");
    int prime_count = 0;
    int largest_prime = 0;
    sieve(1500, &prime_count, &largest_prime);
    printf("primes up to 1500: %d, largest: %d\n", prime_count, largest_prime);
    printf("Showcase complete.\n");
    return 0;
}
