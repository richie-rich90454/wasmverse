package main
import (
    "bufio"
    "fmt"
    "os"
    "strings"
)
func main() {
    fmt.Println("=== Hello from the Universal WASM Platform ===")
    fmt.Print("Your name? ")
    reader := bufio.NewReader(os.Stdin)
    name, _ := reader.ReadString('\n')
    fmt.Printf("Hello, %s!\n", strings.TrimSpace(name))
}
