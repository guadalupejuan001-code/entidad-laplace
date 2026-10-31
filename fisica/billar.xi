# LAPLACE P001 -- billar elastico bidimensional, dinamica exacta en XI.
# REVERSE-PC es el ejecutor; Inverse Ether Memory conserva las seis magnitudes.
# Unidades: mm, mm/s, kg, segundos; E2 = m*(vx^2+vy^2) en kg*mm^2/s^2.
# Para cualquier t conocido, la solucion exacta pliega la coordenada libre
# contra las paredes de una caja sin friccion ni interacciones externas ocultas.
# R10=x, R11=y, R12=vx, R13=vy, R14=masa, R15=fase de impulso (0/1).
# Entradas compiladas: R0=duracion del primer tramo, R1..R9 son temporales.
label fisica_evolucion
set r1 __WIDTH_MM__
mov r2 r10
mov r3 r12
set r9 0
jmp fisica_eje
label fisica_x_lista
mov r10 r7
mov r12 r8
set r1 __HEIGHT_MM__
mov r2 r11
mov r3 r13
set r9 1
jmp fisica_eje
label fisica_y_lista
mov r11 r7
mov r13 r8
cmp r15 0
jne fisica_resultado
# La intervencion es un impulso instantaneo conocido en t=t_evento.
# No se modifica el pasado ni se informa al predictor que desconoce el evento.
add r12 __DELTA_VX_MM_S__
add r13 __DELTA_VY_MM_S__
set r0 __HORIZON_S__
sub r0 __EVENT_AT_S__
set r15 1
jmp fisica_evolucion
label fisica_resultado
# Kinetica conservada sin impulso: E=m*(vx^2+vy^2)/2, en unidades SI.
mov r4 r12
mul r4 r4
mov r5 r13
mul r5 r5
add r4 r5
mul r4 r14
print r10
print r11
print r12
print r13
print r14
print r4
# Publicar las seis cantidades en Inverse Ether Memory como 8 bytes
# little-endian de enteros ZigZag. No se duplica una segunda simulacion.
# Un cero no requiere sobreescritura cuando coincide con el fondo.
set r9 0
label fisica_siguiente_valor
cmp r9 6
jge fisica_terminar
cmp r9 0
je fisica_almacenar_x
cmp r9 1
je fisica_almacenar_y
cmp r9 2
je fisica_almacenar_vx
cmp r9 3
je fisica_almacenar_vy
cmp r9 4
je fisica_almacenar_masa
mov r1 r4
jmp fisica_serializar
label fisica_almacenar_x
mov r1 r10
jmp fisica_serializar
label fisica_almacenar_y
mov r1 r11
jmp fisica_serializar
label fisica_almacenar_vx
mov r1 r12
jmp fisica_serializar
label fisica_almacenar_vy
mov r1 r13
jmp fisica_serializar
label fisica_almacenar_masa
mov r1 r14
jmp fisica_serializar
label fisica_serializar
# ZigZag: v >= 0 -> 2*v; v < 0 -> -2*v-1.
cmp r1 0
jge fisica_entero_positivo
set r2 0
sub r2 r1
mul r2 2
sub r2 1
mov r1 r2
jmp fisica_bytes_inicio
label fisica_entero_positivo
mul r1 2
label fisica_bytes_inicio
set r5 7000000001000000
mov r6 r9
mul r6 8
add r5 r6
set r2 0
label fisica_bytes
cmp r2 8
jge fisica_bytes_terminados
mov r6 r1
mod r6 256
store8 $r5 r6
div r1 256
add r5 1
add r2 1
jmp fisica_bytes
label fisica_bytes_terminados
add r9 1
jmp fisica_siguiente_valor
label fisica_terminar
mem_stats
qstats
halt

# Una sola ley de reflexion para ambos ejes. No recorre cada choque.
# u=x+v*t; r=u mod 2L; x_f=r si r<=L, si no x_f=2L-r.
# La velocidad observada en pared apunta al interior DESPUES del choque.
label fisica_eje
mov r4 r3
mul r4 r0
add r4 r2
mov r5 r1
mul r5 2
mov r6 r4
mod r6 r5
cmp r6 0
jge fisica_residuo_ok
add r6 r5
label fisica_residuo_ok
cmp r6 r1
jle fisica_rama_directa
mov r7 r5
sub r7 r6
set r8 0
sub r8 r3
jmp fisica_bordes
label fisica_rama_directa
mov r7 r6
mov r8 r3
label fisica_bordes
cmp r6 0
je fisica_pared_inicial
cmp r6 r1
je fisica_pared_final
jmp fisica_eje_listo
label fisica_pared_inicial
cmp r8 0
jge fisica_eje_listo
set r8 0
sub r8 r3
jmp fisica_eje_listo
label fisica_pared_final
cmp r8 0
jle fisica_eje_listo
set r8 0
sub r8 r3
label fisica_eje_listo
cmp r9 0
je fisica_x_lista
jmp fisica_y_lista
