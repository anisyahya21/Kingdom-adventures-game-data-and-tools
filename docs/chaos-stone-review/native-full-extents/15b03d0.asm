15b03d0: str x30, [sp, #-0x40]!
15b03d4: stp x24, x23, [sp, #0x10]
15b03d8: stp x22, x21, [sp, #0x20]
15b03dc: stp x20, x19, [sp, #0x30]
15b03e0: adrp x23, #0x316b000
15b03e4: adrp x24, #0x2f5f000
15b03e8: ldrb w8, [x23, #0x33b]
15b03ec: ldr x24, [x24, #0xb68]
15b03f0: mov w19, w3
15b03f4: mov w21, w2
15b03f8: mov w22, w1
15b03fc: mov x20, x0
15b0400: tbnz w8, #0, #0x15b0418
15b0404: adrp x0, #0x2f5f000
15b0408: ldr x0, [x0, #0xb68]
15b040c: bl #0x12d21a0
15b0410: mov w8, #1
15b0414: strb w8, [x23, #0x33b]
15b0418: ldr x0, [x24]
15b041c: ldr w8, [x0, #0xe0]
15b0420: cbnz w8, #0x15b0428
15b0424: bl #0x12d22a4
15b0428: sub w1, w22, w19
15b042c: sub w2, w21, w19
15b0430: lsl w3, w19, #1
15b0434: mov x0, x20
15b0438: ldp x20, x19, [sp, #0x30]
15b043c: ldp x22, x21, [sp, #0x20]
15b0440: ldp x24, x23, [sp, #0x10]
15b0444: mov w4, w3
15b0448: ldr x30, [sp], #0x40
15b044c: b #0x15b0450 ecs.MapSystem$$GetRandomLocation
