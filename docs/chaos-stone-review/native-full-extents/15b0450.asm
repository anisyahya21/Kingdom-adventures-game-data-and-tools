15b0450: stp x30, x27, [sp, #-0x50]!
15b0454: stp x26, x25, [sp, #0x10]
15b0458: stp x24, x23, [sp, #0x20]
15b045c: stp x22, x21, [sp, #0x30]
15b0460: stp x20, x19, [sp, #0x40]
15b0464: adrp x26, #0x316b000
15b0468: adrp x27, #0x2f5e000
15b046c: adrp x22, #0x2f5e000
15b0470: adrp x25, #0x2f5c000
15b0474: ldrb w8, [x26, #0x33c]
15b0478: ldr x27, [x27, #0x4b8]
15b047c: ldr x22, [x22, #0x4e8]
15b0480: ldr x25, [x25, #0x538]
15b0484: mov w21, w4
15b0488: mov w24, w3
15b048c: mov w19, w2
15b0490: mov w23, w1
15b0494: mov x20, x0
15b0498: tbnz w8, #0, #0x15b04c8
15b049c: adrp x0, #0x2f5c000
15b04a0: ldr x0, [x0, #0x538]
15b04a4: bl #0x12d21a0
15b04a8: adrp x0, #0x2f5e000
15b04ac: ldr x0, [x0, #0x4e8]
15b04b0: bl #0x12d21a0
15b04b4: adrp x0, #0x2f5e000
15b04b8: ldr x0, [x0, #0x4b8]
15b04bc: bl #0x12d21a0
15b04c0: mov w8, #1
15b04c4: strb w8, [x26, #0x33c]
15b04c8: ldr x0, [x27]
15b04cc: bl #0x12d23b8
15b04d0: ldr x1, [x22]
15b04d4: mov x22, x0
15b04d8: bl #0x2190f5c kairo.unity.math.Vector2D<int>$$.ctor
15b04dc: ldr x0, [x25]
15b04e0: ldr w8, [x0, #0xe0]
15b04e4: cbnz w8, #0x15b04ec
15b04e8: bl #0x12d22a4
15b04ec: mov w0, w24
15b04f0: mov x1, xzr
15b04f4: bl #0x145fee4 kairo.unity.math.Random$$Rand
15b04f8: cbz x20, #0x15b0560
15b04fc: ldr w8, [x20, #0x10]
15b0500: add w0, w0, w23
15b0504: mov w1, wzr
15b0508: mov x3, xzr
15b050c: sub w2, w8, #1
15b0510: bl #0x13eb3a0 IntExtension$$Clamp
15b0514: cbz x22, #0x15b0560
15b0518: str w0, [x22, #0x10]
15b051c: mov w0, w21
15b0520: mov x1, xzr
15b0524: bl #0x145fee4 kairo.unity.math.Random$$Rand
15b0528: ldr w8, [x20, #0x14]
15b052c: add w0, w0, w19
15b0530: mov w1, wzr
15b0534: mov x3, xzr
15b0538: sub w2, w8, #1
15b053c: bl #0x13eb3a0 IntExtension$$Clamp
15b0540: str w0, [x22, #0x14]
15b0544: mov x0, x22
15b0548: ldp x20, x19, [sp, #0x40]
15b054c: ldp x22, x21, [sp, #0x30]
15b0550: ldp x24, x23, [sp, #0x20]
15b0554: ldp x26, x25, [sp, #0x10]
15b0558: ldp x30, x27, [sp], #0x50
15b055c: ret
15b0560: bl #0x12d23c8
