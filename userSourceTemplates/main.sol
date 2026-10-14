// SPDX-License-Identifier: MIT
// WASMVerse Solidity showcase.
//
// Convention: the performer compiles every .sol file in the project together
// (imports resolve between them), deploys the first contract declared in this
// entry file, and calls its `main` function. `main` must take no parameters or
// a single `string[]` parameter, which receives the program arguments. The
// returned string (or every element of a returned string[]) is printed.

pragma solidity ^0.8.0;

library MathKit {
    function classify(uint256 value) internal pure returns (string memory) {
        if (value % 15 == 0) return "fizzbuzz";
        if (value % 3 == 0) return "fizz";
        if (value % 5 == 0) return "buzz";
        return "plain";
    }
}

contract Main {
    string[] private report;
    uint256 private stored;

    function decimal(uint256 value) internal pure returns (string memory) {
        if (value == 0) return "0";
        uint256 digits;
        uint256 cursor = value;
        while (cursor != 0) {
            digits += 1;
            cursor /= 10;
        }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + (value % 10)));
            value /= 10;
        }
        return string(buffer);
    }

    function main(string[] memory args) public returns (string[] memory) {
        report.push("WASMVerse Solidity showcase");
        report.push("Stage one: fizzbuzz classification");
        for (uint256 value = 13; value <= 17; value += 1) {
            report.push(string.concat("value ", decimal(value), " is ", MathKit.classify(value)));
        }
        report.push("Stage two: program argument passthrough");
        if (args.length > 0) {
            report.push(string.concat("arg0:", args[0]));
        } else {
            report.push("arg0:none");
        }
        report.push("Stage three: storage round trip");
        stored = 21;
        report.push(string.concat("stored ", decimal(stored), ", doubled ", decimal(stored * 2)));
        report.push("Showcase complete.");
        return report;
    }
}
