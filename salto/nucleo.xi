# LAPLACE SALTO E005 - nucleo XI Machine v1 (REVERSE-PC).
# La cabecera y las matrices binarias de entrada son compiladas por el anfitrion.
# Solo XI realiza los productos GF(2), las potencias y la consulta final.
# r0=exponente; r1=ancho extendido; r15=productos ejecutados.
# r11=continuacion (1=acumulador,2=cuadrado); r12/13/14=bases A/B/C.
# No ejecuta n transiciones. Construye M^n mediante cuadrados sucesivos.
label laplace_inicio
set r15 0
label laplace_bucle
cmp r0 0
je laplace_aplicar
mov r10 r0
mod r10 2
cmp r10 0
je laplace_despues_acumular
set r11 1
set r12 7000000000200000
set r13 7000000000100000
set r14 7000000000300000
jmp laplace_multiplicar
label laplace_acumulado
set r2 0
label laplace_copiar_acumulador
mov r6 r1
mul r6 r1
cmp r2 r6
jge laplace_despues_acumular
mov r7 r2
add r7 7000000000300000
load8 r8 $r7
mov r9 r2
add r9 7000000000200000
store8 $r9 r8
add r2 1
jmp laplace_copiar_acumulador
label laplace_despues_acumular
div r0 2
cmp r0 0
je laplace_aplicar
set r11 2
set r12 7000000000100000
set r13 7000000000100000
set r14 7000000000300000
jmp laplace_multiplicar
label laplace_cuadrado
set r2 0
label laplace_copiar_base
mov r6 r1
mul r6 r1
cmp r2 r6
jge laplace_bucle
mov r7 r2
add r7 7000000000300000
load8 r8 $r7
mov r9 r2
add r9 7000000000100000
store8 $r9 r8
add r2 1
jmp laplace_copiar_base
# Multiplicacion de matrices binarias en XI, C=A*B (modulo 2).
# La matriz destino es distinta de A y B: no pisa operandos durante el calculo.
label laplace_multiplicar
add r15 1
set r2 0
label laplace_filas
cmp r2 r1
jge laplace_producto_fin
set r3 0
label laplace_columnas
cmp r3 r1
jge laplace_fila_siguiente
set r4 0
set r5 0
label laplace_producto_interior
cmp r4 r1
jge laplace_producto_guardar
mov r6 r2
mul r6 r1
add r6 r4
add r6 r12
load8 r7 $r6
mov r8 r4
mul r8 r1
add r8 r3
add r8 r13
load8 r9 $r8
mul r7 r9
add r5 r7
add r4 1
jmp laplace_producto_interior
label laplace_producto_guardar
mod r5 2
mov r10 r2
mul r10 r1
add r10 r3
add r10 r14
store8 $r10 r5
add r3 1
jmp laplace_columnas
label laplace_fila_siguiente
add r2 1
jmp laplace_filas
label laplace_producto_fin
cmp r11 1
je laplace_acumulado
jmp laplace_cuadrado
# Consulta del estado final de M^n * [estado,1] sin desplegar su trayectoria.
label laplace_aplicar
set r2 0
label laplace_salida_fila
cmp r2 r1
jge laplace_final
set r4 0
set r5 0
label laplace_salida_columna
cmp r4 r1
jge laplace_salida_guardar
mov r6 r2
mul r6 r1
add r6 r4
add r6 7000000000200000
load8 r7 $r6
mov r8 r4
add r8 7000000000400000
load8 r9 $r8
mul r7 r9
add r5 r7
add r4 1
jmp laplace_salida_columna
label laplace_salida_guardar
mod r5 2
mov r10 r2
add r10 7000000000500000
store8 $r10 r5
print r5
add r2 1
jmp laplace_salida_fila
label laplace_final
print r15
mem_stats
qstats
halt
