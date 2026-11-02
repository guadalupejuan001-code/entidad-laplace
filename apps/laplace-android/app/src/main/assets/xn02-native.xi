#!reverse-pc-machine-v1
# LAPLACE XN02 — XN01 con contadores uint32; formulas originales, XI/Ether original.
# Entrada preparada por el host:
#   r15 = numero de velas (64..1440)
#   close cents uint32 @ 1000000 + i*4
#   volume uint32      @ 2000000 + i*4
#   state-valid byte   @ 2500000 + i
#   label-valid byte   @ 2600000 + i
# La decision se calcula aqui; Java/JS no calcula la mascara ni la probabilidad.
# Estado 4 bits:
#   1: close(i)>=close(i-1)
#   2: close(i)>=close(i-3)
#   4: abs(delta5)*6 > suma(abs(delta5)) de los ultimos 30m
#   8: volumen(i)*6 > suma(volumen) de los ultimos 30m
# __INPUT_BYTES__
# Resultado:
#   r0 mask, r8 P(subida) bps, r9 direccion, r3 soporte,
#   r7 prior bps, r6 filas de entrenamiento, r10 confianza bps.

# Validar que el estado actual tenga 30 minutos continuos.
mov r0 r15
sub r0 1
mov r4 r0
add r4 2500000
load8 r12 $r4
cmp r12 1
je cur_start
set r0 255
print r0
halt

label cur_start
# close[i] -> r1
mov r4 r0
mul r4 4
add r4 1000000
load8 r1 $r4
add r4 1
load8 r11 $r4
mul r11 256
add r1 r11
add r4 1
load8 r11 $r4
mul r11 65536
add r1 r11
add r4 1
load8 r11 $r4
mul r11 16777216
add r1 r11
# close[i-1] -> r2
mov r4 r0
sub r4 1
mul r4 4
add r4 1000000
load8 r2 $r4
add r4 1
load8 r11 $r4
mul r11 256
add r2 r11
add r4 1
load8 r11 $r4
mul r11 65536
add r2 r11
add r4 1
load8 r11 $r4
mul r11 16777216
add r2 r11
set r3 0
cmp r1 r2
jlt cur_bit1_done
add r3 1
label cur_bit1_done
mov r5 r1
sub r5 r2
cmp r5 0
jge cur_abs_done
mul r5 -1
label cur_abs_done
# close[i-3] -> r2
mov r4 r0
sub r4 3
mul r4 4
add r4 1000000
load8 r2 $r4
add r4 1
load8 r11 $r4
mul r11 256
add r2 r11
add r4 1
load8 r11 $r4
mul r11 65536
add r2 r11
add r4 1
load8 r11 $r4
mul r11 16777216
add r2 r11
cmp r1 r2
jlt cur_bit2_done
add r3 2
label cur_bit2_done
# suma de movimientos absolutos de 30m -> r6
set r6 0
mov r7 r0
sub r7 5
label cur_imp_loop
cmp r7 r0
jgt cur_imp_done
# close[j] -> r8
mov r4 r7
mul r4 4
add r4 1000000
load8 r8 $r4
add r4 1
load8 r11 $r4
mul r11 256
add r8 r11
add r4 1
load8 r11 $r4
mul r11 65536
add r8 r11
add r4 1
load8 r11 $r4
mul r11 16777216
add r8 r11
# close[j-1] -> r9
mov r4 r7
sub r4 1
mul r4 4
add r4 1000000
load8 r9 $r4
add r4 1
load8 r11 $r4
mul r11 256
add r9 r11
add r4 1
load8 r11 $r4
mul r11 65536
add r9 r11
add r4 1
load8 r11 $r4
mul r11 16777216
add r9 r11
mov r10 r8
sub r10 r9
cmp r10 0
jge cur_imp_abs_done
mul r10 -1
label cur_imp_abs_done
add r6 r10
add r7 1
jmp cur_imp_loop
label cur_imp_done
mov r10 r5
mul r10 6
cmp r10 r6
jle cur_bit3_done
add r3 4
label cur_bit3_done
# volume[i] -> r5
mov r4 r0
mul r4 4
add r4 2000000
load8 r5 $r4
add r4 1
load8 r11 $r4
mul r11 256
add r5 r11
add r4 1
load8 r11 $r4
mul r11 65536
add r5 r11
add r4 1
load8 r11 $r4
mul r11 16777216
add r5 r11
set r6 0
mov r7 r0
sub r7 5
label cur_vol_loop
cmp r7 r0
jgt cur_vol_done
mov r4 r7
mul r4 4
add r4 2000000
load8 r8 $r4
add r4 1
load8 r11 $r4
mul r11 256
add r8 r11
add r4 1
load8 r11 $r4
mul r11 65536
add r8 r11
add r4 1
load8 r11 $r4
mul r11 16777216
add r8 r11
add r6 r8
add r7 1
jmp cur_vol_loop
label cur_vol_done
mov r10 r5
mul r10 6
cmp r10 r6
jle cur_bit4_done
add r3 8
label cur_bit4_done
store8 3000004 r3

# Contadores en InverseMemory.
store8 3010000 0
store8 3010001 0
store8 3010002 0
store8 3010003 0
store8 3010004 0
store8 3010005 0
store8 3010006 0
store8 3010007 0
store8 3010008 0
store8 3010009 0
store8 3010010 0
store8 3010011 0
store8 3010012 0
store8 3010013 0
store8 3010014 0
store8 3010015 0
set r0 6
label train_loop
mov r12 r15
sub r12 1
cmp r0 r12
jge train_done
# Saltar estados que cruzan cierres/pausas o no tienen etiqueta siguiente.
mov r4 r0
add r4 2600000
load8 r12 $r4
cmp r12 1
jne train_next

# close[i] -> r1
mov r4 r0
mul r4 4
add r4 1000000
load8 r1 $r4
add r4 1
load8 r11 $r4
mul r11 256
add r1 r11
add r4 1
load8 r11 $r4
mul r11 65536
add r1 r11
add r4 1
load8 r11 $r4
mul r11 16777216
add r1 r11
# close[i-1] -> r2
mov r4 r0
sub r4 1
mul r4 4
add r4 1000000
load8 r2 $r4
add r4 1
load8 r11 $r4
mul r11 256
add r2 r11
add r4 1
load8 r11 $r4
mul r11 65536
add r2 r11
add r4 1
load8 r11 $r4
mul r11 16777216
add r2 r11
set r3 0
cmp r1 r2
jlt tr_bit1_done
add r3 1
label tr_bit1_done
mov r5 r1
sub r5 r2
cmp r5 0
jge tr_abs_done
mul r5 -1
label tr_abs_done
# close[i-3] -> r2
mov r4 r0
sub r4 3
mul r4 4
add r4 1000000
load8 r2 $r4
add r4 1
load8 r11 $r4
mul r11 256
add r2 r11
add r4 1
load8 r11 $r4
mul r11 65536
add r2 r11
add r4 1
load8 r11 $r4
mul r11 16777216
add r2 r11
cmp r1 r2
jlt tr_bit2_done
add r3 2
label tr_bit2_done
# impulso 30m
set r6 0
mov r7 r0
sub r7 5
label tr_imp_loop
cmp r7 r0
jgt tr_imp_done
mov r4 r7
mul r4 4
add r4 1000000
load8 r8 $r4
add r4 1
load8 r11 $r4
mul r11 256
add r8 r11
add r4 1
load8 r11 $r4
mul r11 65536
add r8 r11
add r4 1
load8 r11 $r4
mul r11 16777216
add r8 r11
mov r4 r7
sub r4 1
mul r4 4
add r4 1000000
load8 r9 $r4
add r4 1
load8 r11 $r4
mul r11 256
add r9 r11
add r4 1
load8 r11 $r4
mul r11 65536
add r9 r11
add r4 1
load8 r11 $r4
mul r11 16777216
add r9 r11
mov r10 r8
sub r10 r9
cmp r10 0
jge tr_imp_abs_done
mul r10 -1
label tr_imp_abs_done
add r6 r10
add r7 1
jmp tr_imp_loop
label tr_imp_done
mov r10 r5
mul r10 6
cmp r10 r6
jle tr_bit3_done
add r3 4
label tr_bit3_done
# volumen 30m
mov r4 r0
mul r4 4
add r4 2000000
load8 r5 $r4
add r4 1
load8 r11 $r4
mul r11 256
add r5 r11
add r4 1
load8 r11 $r4
mul r11 65536
add r5 r11
add r4 1
load8 r11 $r4
mul r11 16777216
add r5 r11
set r6 0
mov r7 r0
sub r7 5
label tr_vol_loop
cmp r7 r0
jgt tr_vol_done
mov r4 r7
mul r4 4
add r4 2000000
load8 r8 $r4
add r4 1
load8 r11 $r4
mul r11 256
add r8 r11
add r4 1
load8 r11 $r4
mul r11 65536
add r8 r11
add r4 1
load8 r11 $r4
mul r11 16777216
add r8 r11
add r6 r8
add r7 1
jmp tr_vol_loop
label tr_vol_done
mov r10 r5
mul r10 6
cmp r10 r6
jle tr_bit4_done
add r3 8
label tr_bit4_done

# r2 = close[i+1]
mov r4 r0
add r4 1
mul r4 4
add r4 1000000
load8 r2 $r4
add r4 1
load8 r11 $r4
mul r11 256
add r2 r11
add r4 1
load8 r11 $r4
mul r11 65536
add r2 r11
add r4 1
load8 r11 $r4
mul r11 16777216
add r2 r11
# train count
load8 r12 3010012
load8 r11 3010013
mul r11 256
add r12 r11
load8 r11 3010014
mul r11 65536
add r12 r11
load8 r11 3010015
mul r11 16777216
add r12 r11
add r12 1
mov r11 r12
mod r11 256
store8 3010012 r11
mov r11 r12
div r11 256
mod r11 256
store8 3010013 r11
mov r11 r12
div r11 65536
mod r11 256
store8 3010014 r11
mov r11 r12
div r11 16777216
mod r11 256
store8 3010015 r11
# global up
cmp r2 r1
jle tr_not_global_up
load8 r12 3010008
load8 r11 3010009
mul r11 256
add r12 r11
load8 r11 3010010
mul r11 65536
add r12 r11
load8 r11 3010011
mul r11 16777216
add r12 r11
add r12 1
mov r11 r12
mod r11 256
store8 3010008 r11
mov r11 r12
div r11 256
mod r11 256
store8 3010009 r11
mov r11 r12
div r11 65536
mod r11 256
store8 3010010 r11
mov r11 r12
div r11 16777216
mod r11 256
store8 3010011 r11
label tr_not_global_up
# same-state counts
load8 r12 3000004
cmp r3 r12
jne train_next
load8 r12 3010000
load8 r11 3010001
mul r11 256
add r12 r11
load8 r11 3010002
mul r11 65536
add r12 r11
load8 r11 3010003
mul r11 16777216
add r12 r11
add r12 1
mov r11 r12
mod r11 256
store8 3010000 r11
mov r11 r12
div r11 256
mod r11 256
store8 3010001 r11
mov r11 r12
div r11 65536
mod r11 256
store8 3010002 r11
mov r11 r12
div r11 16777216
mod r11 256
store8 3010003 r11
cmp r2 r1
jle train_next
load8 r12 3010004
load8 r11 3010005
mul r11 256
add r12 r11
load8 r11 3010006
mul r11 65536
add r12 r11
load8 r11 3010007
mul r11 16777216
add r12 r11
add r12 1
mov r11 r12
mod r11 256
store8 3010004 r11
mov r11 r12
div r11 256
mod r11 256
store8 3010005 r11
mov r11 r12
div r11 65536
mod r11 256
store8 3010006 r11
mov r11 r12
div r11 16777216
mod r11 256
store8 3010007 r11

label train_next
add r0 1
jmp train_loop

label train_done
load8 r3 3010000
load8 r11 3010001
mul r11 256
add r3 r11
load8 r11 3010002
mul r11 65536
add r3 r11
load8 r11 3010003
mul r11 16777216
add r3 r11
load8 r4 3010004
load8 r11 3010005
mul r11 256
add r4 r11
load8 r11 3010006
mul r11 65536
add r4 r11
load8 r11 3010007
mul r11 16777216
add r4 r11
load8 r5 3010008
load8 r11 3010009
mul r11 256
add r5 r11
load8 r11 3010010
mul r11 65536
add r5 r11
load8 r11 3010011
mul r11 16777216
add r5 r11
load8 r6 3010012
load8 r11 3010013
mul r11 256
add r6 r11
load8 r11 3010014
mul r11 65536
add r6 r11
load8 r11 3010015
mul r11 16777216
add r6 r11
# prior_bps = (global_up+1)*10000/(train+2)
mov r7 r5
add r7 1
mul r7 10000
mov r12 r6
add r12 2
div r7 r12
# p_up_bps = (same_up*10000 + 8*prior_bps)/(same+8)
mov r8 r4
mul r8 10000
mov r12 r7
mul r12 8
add r8 r12
mov r12 r3
add r12 8
div r8 r12
# direction
set r9 0
cmp r8 5000
jlt dir_done
set r9 1
label dir_done
# confidence
mov r10 r8
cmp r8 5000
jge conf_done
set r10 10000
sub r10 r8
label conf_done
load8 r0 3000004
print r0
print r8
print r9
print r3
print r7
print r6
print r10
mem_stats
qstats
halt
