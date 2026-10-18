145ff98: str x30, [sp, #-0x30]!
145ff9c: stp x22, x21, [sp, #0x10]
145ffa0: stp x20, x19, [sp, #0x20]
145ffa4: adrp x22, #0x316a000
145ffa8: adrp x21, #0x2f5c000
145ffac: ldrb w8, [x22, #0x9c2]
145ffb0: ldr x21, [x21, #0x538]
145ffb4: mov w20, w1
145ffb8: mov w19, w0
145ffbc: tbnz w8, #0, #0x145ffd4
145ffc0: adrp x0, #0x2f5c000
145ffc4: ldr x0, [x0, #0x538]
145ffc8: bl #0x12d21a0
145ffcc: mov w8, #1
145ffd0: strb w8, [x22, #0x9c2]
145ffd4: ldr x0, [x21]
145ffd8: ldr w8, [x0, #0xe0]
145ffdc: cbnz w8, #0x145ffe8
145ffe0: bl #0x12d22a4
145ffe4: ldr x0, [x21]
145ffe8: ldr x8, [x0, #0xb8]
145ffec: ldr x0, [x8]
145fff0: cbz x0, #0x1460020
145fff4: mov x1, xzr
145fff8: bl #0x22a513c java.util.JRandom$$NextInt
145fffc: sub w8, w20, w19
1460000: add w8, w8, #1
1460004: sdiv w9, w0, w8
1460008: msub w8, w9, w8, w0
146000c: add w0, w8, w19
1460010: ldp x20, x19, [sp, #0x20]
1460014: ldp x22, x21, [sp, #0x10]
1460018: ldr x30, [sp], #0x30
146001c: ret
1460020: bl #0x12d23c8
