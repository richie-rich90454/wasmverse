const std = @import("std");

const squares = blk: {
    var table: [8]u32 = undefined;
    for (&table, 0..) |*slot, index| {
        const value: u32 = @intCast(index + 1);
        slot.* = value * value;
    }
    break :blk table;
};

const ParseError = error{ EmptyInput, BadDigit, Overflow };

fn parseSmall(text: []const u8) ParseError!u32 {
    if (text.len == 0) return ParseError.EmptyInput;
    var total: u32 = 0;
    for (text) |byte| {
        if (byte < '0' or byte > '9') return ParseError.BadDigit;
        if (total > 429496729) return ParseError.Overflow;
        const digit: u32 = byte - '0';
        total = total * 10 + digit;
    }
    return total;
}

pub fn main() void {
    std.debug.print("WASMVerse Zig showcase\n", .{});
    std.debug.print("Stage one: compile-time squares:", .{});
    for (squares) |value| {
        std.debug.print(" {d}", .{value});
    }
    std.debug.print("\n", .{});
    std.debug.print("Stage two: error unions over a parsing pipeline\n", .{});
    const inputs = [_][]const u8{ "40", "7", "", "4x", "4294967296" };
    for (inputs) |text| {
        const result = parseSmall(text);
        if (result) |value| {
            std.debug.print("parsed \"{s}\": {d}\n", .{ text, value });
        } else |err| {
            std.debug.print("parsed \"{s}\": {s}\n", .{ text, @errorName(err) });
        }
    }
    std.debug.print("Stage three: bounded sieve\n", .{});
    var flags: [301]bool = undefined;
    for (&flags) |*flag| {
        flag.* = true;
    }
    flags[0] = false;
    flags[1] = false;
    var number: usize = 2;
    while (number * number <= 300) : (number += 1) {
        if (flags[number]) {
            var multiple = number * number;
            while (multiple <= 300) : (multiple += number) {
                flags[multiple] = false;
            }
        }
    }
    var count: usize = 0;
    var largest: usize = 0;
    for (flags, 0..) |keep, index| {
        if (keep) {
            count += 1;
            largest = index;
        }
    }
    std.debug.print("primes up to 300: {d}, largest: {d}\n", .{ count, largest });
    std.debug.print("Showcase complete.\n", .{});
}
