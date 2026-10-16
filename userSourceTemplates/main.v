// WASMVerse Verilog showcase.
//
// Convention: this entry file is the testbench; every .v file in the project is
// compiled together, so helper modules can live in separate files. Simulation
// output comes from $display, and the testbench must end with $finish.
// Program arguments arrive as vvp plusargs named arg0, arg1, ... and are read
// with $value$plusargs("arg0=%s", target).

`timescale 1ns/1ps

module ripple_adder(
    input  [7:0] a,
    input  [7:0] b,
    input        carry_in,
    output [7:0] sum,
    output       carry_out
);
    wire [8:0] total = a + b + carry_in;
    assign sum = total[7:0];
    assign carry_out = total[8];
endmodule

module lfsr(
    input        clk,
    input        reset,
    output reg [7:0] state
);
    always @(posedge clk) begin
        if (reset) begin
            state <= 8'hA5;
        end else begin
            state <= {state[6:0], state[7] ^ state[5] ^ state[4] ^ state[3]};
        end
    end
endmodule

module tb;
    reg clk = 0;
    reg reset = 1;

    reg  [7:0] a = 0;
    reg  [7:0] b = 0;
    reg        carry_in = 0;
    wire [7:0] sum;
    wire       carry_out;

    wire [7:0] lfsr_state;

    ripple_adder adder(.a(a), .b(b), .carry_in(carry_in), .sum(sum), .carry_out(carry_out));
    lfsr randomizer(.clk(clk), .reset(reset), .state(lfsr_state));

    always #5 clk = ~clk;

    integer step;
    reg [8*16-1:0] first_argument;

    initial begin
        $display("WASMVerse Verilog showcase");
        $display("Stage one: ripple adder carry chain");

        a = 8'd200; b = 8'd100; carry_in = 0;
        #1 $display("200 + 100 + 0 = %0d carry %0d", sum, carry_out);
        a = 8'd75; b = 8'd50; carry_in = 1;
        #1 $display("75 + 50 + 1 = %0d carry %0d", sum, carry_out);
        a = 8'd255; b = 8'd255; carry_in = 1;
        #1 $display("255 + 255 + 1 = %0d carry %0d", sum, carry_out);

        $display("Stage two: LFSR sequence from seed A5");
        reset = 1;
        #10;
        reset = 0;
        for (step = 0; step < 6; step = step + 1) begin
            #10 $display("state %h", lfsr_state);
        end

        $display("Stage three: program arguments");
        if ($value$plusargs("arg0=%s", first_argument)) begin
            $display("arg0:%0s", first_argument);
        end else begin
            $display("arg0:none");
        end

        $display("Showcase complete.");
        $finish;
    end
endmodule
