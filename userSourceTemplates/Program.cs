using System;
class Program {
    static void Main() {
        Console.WriteLine("=== Hello from the Universal WASM Platform ===");
        Console.Write("Your name? ");
        string name = Console.ReadLine() ?? "";
        Console.WriteLine($"Hello, {name}!");
    }
}
