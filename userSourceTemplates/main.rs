use std::io::{self, Write};
fn main() {
    println!("=== Hello from the Universal WASM Platform ===");
    print!("Your name? ");
    io::stdout().flush().unwrap();
    let mut name = String::new();
    io::stdin().read_line(&mut name).unwrap();
    println!("Hello, {}!", name.trim());
}
