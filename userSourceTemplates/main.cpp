#include <iostream>
#include <string>
int main() {
    std::string name;
    std::cout << "=== Hello from the Universal WASM Platform ===" << std::endl;
    std::cout << "Your name? ";
    std::getline(std::cin, name);
    std::cout << "Hello, " << name << "!" << std::endl;
    return 0;
}
