#include <stdio.h>
int main() {
    char name[256];
    printf("=== Hello from the Universal WASM Platform ===\n");
    printf("Your name? ");
    if (scanf("%255s", name) == 1) {
        printf("Hello, %s!\n", name);
    }
    return 0;
}
