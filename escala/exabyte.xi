# LAPLACE P005 — Rule 90 on a logical ring with >10^18 cells.
# The physical states are NOT materialized in full. Initial seeds and query
# bytes are stored in original Inverse Ether Memory by the compiler.
# The recurrence is EXACT: x(t+1,i) = x(t,i-1) XOR x(t,i+1).
# Derive a queried cell directly using Lucas parity in XI, NOT JS.
# Nonoverlap 2*t < ring_size/number_of_seeds enables exact global population.
# r0=N,r1=t,r2=seed_count,r3=spacing,r4=query,r5=answer,r6=seed index.
# r15=query index is preserved while evaluating all seed contributions.
label exa_start
set r0 __RING_SIZE__
set r1 __TIME__
set r2 __SEED_COUNT__
set r3 __SEED_SPACING__
set r9 __HALF_SIZE__
set r15 0
label exa_next_query
cmp r15 __QUERY_COUNT__
jge exa_population
# Read 64-bit unsigned coordinate from eight little-endian Ether bytes.
set r4 0
set r14 7
label exa_coord_byte
cmp r14 0
jlt exa_coordinate_ready
mul r4 256
mov r13 r15
mul r13 8
add r13 __INPUT_BASE__
add r13 r14
load8 r12 $r13
add r4 r12
sub r14 1
jmp exa_coord_byte
label exa_coordinate_ready
set r5 0
set r6 0
label exa_each_seed
cmp r6 r2
jge exa_return
mov r7 r6
mul r7 r3
# Only the existing sparse seed cells are read.
mov r14 r7
add r14 __FIELD_BASE__
load8 r14 $r14
cmp r14 0
je exa_seed_next
# diff = shortest signed cyclic displacement from this seed.
mov r8 r4
sub r8 r7
cmp r8 r9
jlt exa_wrap_negative
sub r8 r0
label exa_wrap_negative
mov r14 r9
mul r14 -1
cmp r8 r14
jge exa_wrap_done
add r8 r0
label exa_wrap_done
# In at most t local propagation distance with matching parity?
mov r10 r8
add r10 r1
cmp r10 0
jlt exa_seed_next
mov r11 r1
mul r11 2
cmp r10 r11
jgt exa_seed_next
mov r11 r10
mod r11 2
cmp r11 0
jne exa_seed_next
div r10 2
mov r12 r1
# Lucas theorem: C(t,k) is odd iff every set bit in k is set in t.
label exa_lucas
cmp r10 0
je exa_flip
mov r13 r10
mod r13 2
cmp r13 0
je exa_shift
mov r14 r12
mod r14 2
cmp r14 0
je exa_seed_next
label exa_shift
div r10 2
div r12 2
jmp exa_lucas
# XOR a seed's contribution into the queried cell.
label exa_flip
cmp r5 0
je exa_turn_on
set r5 0
jmp exa_seed_next
label exa_turn_on
set r5 1
label exa_seed_next
add r6 1
jmp exa_each_seed
label exa_return
print r15
print r5
mov r14 r15
add r14 __OUTPUT_BASE__
store8 $r14 r5
add r15 1
jmp exa_next_query
# A seed produces 2^popcount(t) active cells (binomial parity).
# Their light cones are disjoint by validation: multiply by seed_count.
# No full-ring scan and NO n-step time loop.
label exa_population
set r5 1
mov r10 r1
label exa_count_bits
cmp r10 0
je exa_count_ready
mov r11 r10
mod r11 2
cmp r11 0
je exa_count_next
mul r5 2
label exa_count_next
div r10 2
jmp exa_count_bits
label exa_count_ready
mul r5 r2
print r5
print r1
print r2
print r15
mem_stats
qstats
halt
