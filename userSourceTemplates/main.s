# WASMVerse RISC-V (RV32I) showcase.
#
# Syscall convention, all through `ecall` with the service number in a7:
#   1   print the integer in a1
#   4   print the string at a1 with length a2 (bytes)
#   5   read one line and parse it as a decimal integer into a0
#   8   read one line into the buffer at a1 with capacity a2 bytes; a0 = bytes stored
#   10  exit with the code in a0
#   11  print the character in a1
#   13  open the NUL terminated path at a1 (flags in a0 are ignored); a0 = descriptor or -1
#   14  read from descriptor a0 into the buffer a1, at most a2 bytes; a0 = bytes read
#   15  close the descriptor in a0
#   20  print the NUL terminated string at a1
#
# Startup state: a0 = number of program arguments, a1 = address of the argv table
# (an array of 32-bit pointers) or 0 without arguments. The stack pointer starts
# at 0x7fff0000. Other sources are pulled in with `.include "file.s"`.

.data
banner_line:    .asciz "WASMVerse RISC-V showcase\n"
stage_one_line: .asciz "Stage one: name from stdin\n"
greet_word:     .asciz "greet:"
helper_word:    .asciz "helper"
colon:          .asciz ":"
arg_word:       .asciz "arg0:"
none_word:      .asciz "none"
newline:        .asciz "\n"
stage_two_line: .asciz "Stage two: sieve of Eratosthenes up to 200\n"
count_word:     .asciz "primes counted: "
sum_word:       .asciz "prime sum: "
largest_word:   .asciz "largest prime: "
stage_three_line: .asciz "Stage three: stack-backed running total over the primes\n"
total_word:     .asciz "checksum: "
done_line:      .asciz "Showcase complete.\n"
name_buffer:    .space 64
flags:          .space 201

.text
_start:
    mv s8, a0
    mv s9, a1

    la a1, banner_line
    li a7, 20
    ecall

    la a1, stage_one_line
    li a7, 20
    ecall

    la a1, greet_word
    li a7, 20
    ecall
    la a1, helper_word
    li a7, 20
    ecall
    la a1, colon
    li a7, 20
    ecall

    la a1, name_buffer
    li a2, 64
    li a7, 8
    ecall
    mv s2, a0
    la a1, name_buffer
    mv a2, s2
    li a7, 4
    ecall
    la a1, newline
    li a7, 20
    ecall

    la a1, arg_word
    li a7, 20
    ecall
    beqz s8, no_arguments
    lw t0, 0(s9)
    mv a1, t0
    li a7, 20
    ecall
    j arguments_done
no_arguments:
    la a1, none_word
    li a7, 20
    ecall
arguments_done:
    la a1, newline
    li a7, 20
    ecall

    la a1, stage_two_line
    li a7, 20
    ecall

    li s4, 2
    li s5, 0
    li s6, 0
    li s7, 0
sieve_loop:
    li t1, 200
    bgt s4, t1, sieve_done
    la t2, flags
    add t2, t2, s4
    lb t3, 0(t2)
    bnez t3, next_candidate

    addi s5, s5, 1
    add s6, s6, s4
    mv s7, s4

    mv t5, s4
    li t6, 0
square_loop:
    beqz t5, square_done
    add t6, t6, s4
    addi t5, t5, -1
    j square_loop
square_done:
    mv t0, t6
mark_loop:
    li t1, 200
    bgt t0, t1, next_candidate
    la t2, flags
    add t2, t2, t0
    li t3, 1
    sb t3, 0(t2)
    add t0, t0, s4
    j mark_loop

next_candidate:
    addi s4, s4, 1
    j sieve_loop

sieve_done:
    la a1, count_word
    li a7, 20
    ecall
    mv a1, s5
    li a7, 1
    ecall
    la a1, newline
    li a7, 20
    ecall

    la a1, sum_word
    li a7, 20
    ecall
    mv a1, s6
    li a7, 1
    ecall
    la a1, newline
    li a7, 20
    ecall

    la a1, largest_word
    li a7, 20
    ecall
    mv a1, s7
    li a7, 1
    ecall
    la a1, newline
    li a7, 20
    ecall

    la a1, stage_three_line
    li a7, 20
    ecall
    addi sp, sp, -4
    mv t0, s6
    sw t0, 0(sp)
    lw t1, 0(sp)
    addi sp, sp, 4
    sub t1, t1, s5
    la a1, total_word
    li a7, 20
    ecall
    mv a1, t1
    li a7, 1
    ecall
    la a1, newline
    li a7, 20
    ecall

    la a1, done_line
    li a7, 20
    ecall
    li a0, 0
    li a7, 10
    ecall
