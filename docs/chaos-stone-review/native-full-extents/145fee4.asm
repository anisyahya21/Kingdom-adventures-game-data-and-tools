145fee4: str x30, [sp, #-0x20]!
145fee8: stp x20, x19, [sp, #0x10]
145feec: adrp x20, #0x316a000
145fef0: ldrb w8, [x20, #0x9c1]
145fef4: mov w19, w0
145fef8: tbnz w8, #0, #0x145ff1c
145fefc: adrp x0, #0x2f5b000
145ff00: ldr x0, [x0, #0xf0]
145ff04: bl #0x12d21a0
145ff08: adrp x0, #0x2f5c000
145ff0c: ldr x0, [x0, #0x538]
145ff10: bl #0x12d21a0
145ff14: mov w8, #1
145ff18: strb w8, [x20, #0x9c1]
145ff1c: cbz w19, #0x145ff84
145ff20: adrp x20, #0x2f5c000
145ff24: ldr x20, [x20, #0x538]
145ff28: ldr x0, [x20]
145ff2c: ldr w8, [x0, #0xe0]
145ff30: cbnz w8, #0x145ff3c
145ff34: bl #0x12d22a4
145ff38: ldr x0, [x20]
145ff3c: ldr x8, [x0, #0xb8]
145ff40: ldr x0, [x8]
145ff44: cbz x0, #0x145ff94
145ff48: adrp x20, #0x2f5b000
145ff4c: ldr x20, [x20, #0xf0]
145ff50: mov x1, xzr
145ff54: bl #0x22a513c java.util.JRandom$$NextInt
145ff58: ldr x8, [x20]
145ff5c: mov w20, w0
145ff60: ldr w9, [x8, #0xe0]
145ff64: cbnz w9, #0x145ff70
145ff68: mov x0, x8
145ff6c: bl #0x12d22a4
145ff70: cmp w20, #0
145ff74: cneg w8, w20, mi
145ff78: sdiv w9, w8, w19
145ff7c: msub w0, w9, w19, w8
145ff80: b #0x145ff88
145ff84: mov w0, wzr
145ff88: ldp x20, x19, [sp, #0x10]
145ff8c: ldr x30, [sp], #0x20
145ff90: ret
145ff94: bl #0x12d23c8
