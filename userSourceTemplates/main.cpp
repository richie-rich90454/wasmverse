#include <array>
#include <iostream>
#include <map>
#include <memory>
#include <numeric>
#include <sstream>
#include <string>
#include <variant>
#include <vector>

namespace showcase {

constexpr int kWindowSize = 9;

template <typename T>
T clamp_positive(T value) {
    return value < T{0} ? T{0} : value;
}

struct NumberNode {
    long value;
};

struct BinaryNode;

using Node = std::variant<NumberNode, std::shared_ptr<BinaryNode>>;

struct BinaryNode {
    char op;
    std::vector<Node> children;
};

long evaluate(const Node& node) {
    if (std::holds_alternative<NumberNode>(node)) {
        return std::get<NumberNode>(node).value;
    }
    const BinaryNode& branch = *std::get<std::shared_ptr<BinaryNode>>(node);
    long total = branch.op == '*' ? 1 : 0;
    for (const Node& child : branch.children) {
        long piece = evaluate(child);
        if (branch.op == '+') {
            total += piece;
        } else if (branch.op == '*') {
            total *= piece;
        } else {
            total = clamp_positive(total - piece);
        }
    }
    return total;
}

std::vector<int> sieve(int limit) {
    std::vector<bool> flags(static_cast<size_t>(limit) + 1, true);
    if (limit >= 0) flags[0] = false;
    if (limit >= 1) flags[1] = false;
    for (int number = 2; number * number <= limit; ++number) {
        if (flags[static_cast<size_t>(number)]) {
            for (int multiple = number * number; multiple <= limit; multiple += number) {
                flags[static_cast<size_t>(multiple)] = false;
            }
        }
    }
    std::vector<int> primes;
    for (int index = 2; index <= limit; ++index) {
        if (flags[static_cast<size_t>(index)]) primes.push_back(index);
    }
    return primes;
}

std::vector<int> rolling_sums(const std::vector<int>& values, int width) {
    std::vector<int> sums;
    for (size_t index = 0; index + static_cast<size_t>(width) <= values.size(); ++index) {
        int total = std::accumulate(values.begin() + static_cast<long>(index),
                                    values.begin() + static_cast<long>(index) + width, 0);
        sums.push_back(total);
    }
    return sums;
}

}  // namespace showcase

int main() {
    using namespace showcase;
    std::cout << "WASMVerse C++ showcase\n";
    std::cout << "Stage one: constexpr table and templates\n";
    constexpr auto squares = [] {
        std::array<int, 8> table{};
        for (int index = 0; index < 8; ++index) {
            table[static_cast<size_t>(index)] = (index + 1) * (index + 1);
        }
        return table;
    }();
    std::cout << "compile-time squares:";
    for (int value : squares) std::cout << ' ' << value;
    std::cout << '\n';

    std::cout << "Stage two: variant visitors over an expression tree\n";
    auto sum = std::make_shared<BinaryNode>();
    sum->op = '+';
    sum->children.push_back(NumberNode{40});
    sum->children.push_back(NumberNode{1});
    auto combined = std::make_shared<BinaryNode>();
    combined->op = '*';
    combined->children.push_back(Node(sum));
    combined->children.push_back(NumberNode{2});
    std::cout << "(40 + 1) * 2 = " << evaluate(Node(combined)) << '\n';

    std::cout << "Stage three: prime windows and frequency maps\n";
    auto primes = sieve(1200);
    auto sums = rolling_sums(primes, kWindowSize);
    std::cout << "prime count up to 1200: " << primes.size() << '\n';
    std::cout << "largest prime: " << primes.back() << '\n';
    std::map<int, int> residues;
    for (int prime : primes) residues[prime % 10] += 1;
    std::cout << "last-digit histogram size: " << residues.size() << '\n';
    std::ostringstream buffer;
    for (size_t index = 0; index < sums.size() && index < 6; ++index) {
        if (index) buffer << ", ";
        buffer << sums[index];
    }
    std::cout << "first window sums: " << buffer.str() << '\n';
    std::cout << "Showcase complete.\n";
    return 0;
}
