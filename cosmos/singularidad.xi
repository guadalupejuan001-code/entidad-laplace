# LAPLACE P004: singularidad clasica por extrapolacion del FLRW de radiacion.
# El limite a=0 es FORMAL y no se calcula como un estado fisico.
# XI calcula H, T, densidad local, tiempo de radiacion, Kretschmann y umbral Planck.
# a=10^k; magnitudes=mantisa*10^exponente. El host SOLO fija k y memoria.
set r0 __START_EXP__
label sing_epoch
cmp r0 __END_EXP__
jlt sing_complete
# H=H0 sqrt(Omega_r) / a^2. Referencia redondeada 2.095093e-20 s^-1.
set r1 2095093
set r2 -26
sub r2 r0
sub r2 r0
# T=T0/a, extrapolacion adiabática (no incluye g_star variable).
set r3 2725500
set r4 -6
sub r4 r0
# rho_rad c^2=7.055432e-14 a^-4 J/m^3.
set r5 7055432
set r6 -20
sub r6 r0
sub r6 r0
sub r6 r0
sub r6 r0
# t_rad=a^2/(2H0sqrt(Omega_r)), no es edad LambdaCDM completa.
set r7 2386530
set r8 13
add r8 r0
add r8 r0
# Kretschmann K=24(H/c)^4 m^-4. Reduccion de mantisa evita i64 overflow.
mov r9 r1
div r9 1000
mov r10 r2
mul r10 4
sub r10 25
mul r9 r9
mul r9 r9
mul r9 29712
label sing_curvature_normalize
cmp r9 9999999
jle sing_curvature_ready
div r9 10
add r10 1
jmp sing_curvature_normalize
label sing_curvature_ready
# tPlanck = 5391247*10^-50 segundos (CODATA). r11=1 mas alla de umbral.
set r11 0
cmp r8 -50
jlt sing_below_planck
jgt sing_planck_checked
cmp r7 5391247
jge sing_planck_checked
label sing_below_planck
set r11 1
label sing_planck_checked
print r0
print r1
print r2
print r3
print r4
print r5
print r6
print r7
print r8
print r9
print r10
print r11
# Registro r0..r11, 96 bytes por epoca (i64 ZigZag little-endian).
set r13 __BASE_MEMORY__
mov r14 r0
sub r14 __START_EXP__
mul r14 -96
add r13 r14
set r12 0
label sing_field
cmp r12 12
jge sing_row_done
cmp r12 0
je sing_choose_0
cmp r12 1
je sing_choose_1
cmp r12 2
je sing_choose_2
cmp r12 3
je sing_choose_3
cmp r12 4
je sing_choose_4
cmp r12 5
je sing_choose_5
cmp r12 6
je sing_choose_6
cmp r12 7
je sing_choose_7
cmp r12 8
je sing_choose_8
cmp r12 9
je sing_choose_9
cmp r12 10
je sing_choose_10
jmp sing_choose_11
label sing_choose_0
mov r14 r0
jmp sing_encode
label sing_choose_1
mov r14 r1
jmp sing_encode
label sing_choose_2
mov r14 r2
jmp sing_encode
label sing_choose_3
mov r14 r3
jmp sing_encode
label sing_choose_4
mov r14 r4
jmp sing_encode
label sing_choose_5
mov r14 r5
jmp sing_encode
label sing_choose_6
mov r14 r6
jmp sing_encode
label sing_choose_7
mov r14 r7
jmp sing_encode
label sing_choose_8
mov r14 r8
jmp sing_encode
label sing_choose_9
mov r14 r9
jmp sing_encode
label sing_choose_10
mov r14 r10
jmp sing_encode
label sing_choose_11
mov r14 r11

label sing_encode
cmp r14 0
jge sing_zigzag_positive
mul r14 -2
sub r14 1
jmp sing_write8
label sing_zigzag_positive
mul r14 2
label sing_write8
mov r15 r14
mod r15 256
store8 $r13 r15
div r14 256
add r13 1
mov r15 r14
mod r15 256
store8 $r13 r15
div r14 256
add r13 1
mov r15 r14
mod r15 256
store8 $r13 r15
div r14 256
add r13 1
mov r15 r14
mod r15 256
store8 $r13 r15
div r14 256
add r13 1
mov r15 r14
mod r15 256
store8 $r13 r15
div r14 256
add r13 1
mov r15 r14
mod r15 256
store8 $r13 r15
div r14 256
add r13 1
mov r15 r14
mod r15 256
store8 $r13 r15
div r14 256
add r13 1
mov r15 r14
mod r15 256
store8 $r13 r15
div r14 256
add r13 1
add r12 1
jmp sing_field
label sing_row_done
sub r0 1
jmp sing_epoch
label sing_complete
mem_stats
qstats
halt
