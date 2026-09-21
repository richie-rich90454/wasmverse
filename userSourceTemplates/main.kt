fun main() {
    println("=== Hello from the Universal WASM Platform ===")
    print("Your name? ")
    val name = readlnOrNull() ?: ""
    println("Hello, $name!")
}
