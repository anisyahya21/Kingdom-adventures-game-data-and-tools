148bf40: sub sp, sp, #0x80
148bf44: str x30, [sp, #0x20]
148bf48: stp x28, x27, [sp, #0x30]
148bf4c: stp x26, x25, [sp, #0x40]
148bf50: stp x24, x23, [sp, #0x50]
148bf54: stp x22, x21, [sp, #0x60]
148bf58: stp x20, x19, [sp, #0x70]
148bf5c: adrp x25, #0x316a000
148bf60: ldrb w8, [x25, #0xb8a]
148bf64: mov w24, w6
148bf68: mov w20, w4
148bf6c: mov w21, w3
148bf70: mov w22, w2
148bf74: mov x23, x1
148bf78: mov x19, x0
148bf7c: tbnz w8, #0, #0x148bfc4
148bf80: adrp x0, #0x2f5f000
148bf84: ldr x0, [x0, #0x410]
148bf88: bl #0x12d21a0 il2cpp_class_init
148bf8c: adrp x0, #0x2f5f000
148bf90: ldr x0, [x0, #0xd08]
148bf94: bl #0x12d21a0 il2cpp_class_init
148bf98: adrp x0, #0x2f5d000
148bf9c: ldr x0, [x0, #0xc40]
148bfa0: bl #0x12d21a0 il2cpp_class_init
148bfa4: adrp x0, #0x2f5d000
148bfa8: ldr x0, [x0, #0xd20]
148bfac: bl #0x12d21a0 il2cpp_class_init
148bfb0: adrp x0, #0x2f5d000
148bfb4: ldr x0, [x0, #0x8a0]
148bfb8: bl #0x12d21a0 il2cpp_class_init
148bfbc: mov w8, #1
148bfc0: strb w8, [x25, #0xb8a]
148bfc4: cbz x19, #0x148c2dc
148bfc8: mov x0, x19
148bfcc: mov x1, xzr
148bfd0: bl #0x1471498 kairo.unity.ecs.Entity$$get_position
148bfd4: cbz x0, #0x148c2dc
148bfd8: ldr s0, [x0, #0x10]
148bfdc: mov w8, #0x7f800000
148bfe0: fmov s1, w8
148bfe4: mov w26, #-0xffffffff80000000
148bfe8: fcvtzs w8, s0
148bfec: fcmp s0, s1
148bff0: mov x0, x19
148bff4: mov x1, xzr
148bff8: csel w25, w26, w8, eq
148bffc: bl #0x1471498 kairo.unity.ecs.Entity$$get_position
148c000: cbz x0, #0x148c2dc
148c004: ldr s0, [x0, #0x18]
148c008: mov w8, #0x7f800000
148c00c: fmov s1, w8
148c010: fcvtzs w8, s0
148c014: fcmp s0, s1
148c018: csel w26, w26, w8, eq
148c01c: cmp w25, w22
148c020: b.ne #0x148c02c
148c024: cmp w26, w21
148c028: b.eq #0x148c28c
148c02c: adrp x8, #0x2f5f000
148c030: ldr x8, [x8, #0x410]
148c034: ldr x27, [x19, #0x30]
148c038: ldr x0, [x8]
148c03c: ldr w8, [x0, #0xe0]
148c040: cbnz w8, #0x148c048
148c044: bl #0x12d22a4 il2cpp_method_init
148c048: and w8, w24, #1
148c04c: mov x0, x27
148c050: mov x1, x23
148c054: mov w2, w25
148c058: mov w3, w26
148c05c: mov w4, w22
148c060: mov w5, w21
148c064: str wzr, [sp, #8]
148c068: strb w8, [sp, #0x10]
148c06c: str wzr, [sp]
148c070: bl #0x148e1bc ecs.AISystem$$_MoveStart
148c074: cbz x0, #0x148c2b0
148c078: adrp x25, #0x2f5d000
148c07c: adrp x26, #0x2f5d000
148c080: adrp x28, #0x2f5f000
148c084: ldr w8, [x0, #0x18]
148c088: ldr x25, [x25, #0xd20]
148c08c: ldr x26, [x26, #0x8a0]
148c090: ldr x28, [x28, #0xd08]
148c094: mov x21, x0
148c098: mov w27, wzr
148c09c: sub w9, w8, #2
148c0a0: cmp w9, #1
148c0a4: b.lt #0x148c208
148c0a8: mov w22, wzr
148c0ac: ldr x2, [x25]
148c0b0: mov x0, x21
148c0b4: mov w1, w22
148c0b8: bl #0x1deb9a8 System.Collections.Generic.List<object>$$get_Item
148c0bc: ldr x2, [x25]
148c0c0: mov x24, x0
148c0c4: add w1, w22, #2
148c0c8: mov x0, x21
148c0cc: bl #0x1deb9a8 System.Collections.Generic.List<object>$$get_Item
148c0d0: cbz x24, #0x148c2dc
148c0d4: ldr w8, [x24, #0x18]
148c0d8: cbz w8, #0x148c2d8
148c0dc: mov x23, x0
148c0e0: cbz x0, #0x148c2dc
148c0e4: ldr w9, [x23, #0x18]
148c0e8: cbz w9, #0x148c2d8
148c0ec: ldr w10, [x24, #0x20]
148c0f0: ldr w11, [x23, #0x20]
148c0f4: cmp w10, w11
148c0f8: b.eq #0x148c11c
148c0fc: cmp w8, #1
148c100: b.ls #0x148c2d8
148c104: cmp w9, #1
148c108: b.ls #0x148c2d8
148c10c: ldr w8, [x24, #0x24]
148c110: ldr w9, [x23, #0x24]
148c114: cmp w8, w9
148c118: b.ne #0x148c1f4
148c11c: ldr w8, [x21, #0x18]
148c120: add w1, w22, #3
148c124: cmp w1, w8
148c128: b.ge #0x148c1f4
148c12c: ldr x2, [x25]
148c130: mov x0, x21
148c134: bl #0x1deb9a8 System.Collections.Generic.List<object>$$get_Item
148c138: ldr w8, [x24, #0x18]
148c13c: cbz w8, #0x148c2d8
148c140: cbz x0, #0x148c2dc
148c144: ldr w9, [x0, #0x18]
148c148: cbz w9, #0x148c2d8
148c14c: ldr w10, [x24, #0x20]
148c150: ldr w11, [x0, #0x20]
148c154: cmp w10, w11
148c158: b.ne #0x148c170
148c15c: ldr w11, [x23, #0x18]
148c160: cbz w11, #0x148c2d8
148c164: ldr w11, [x23, #0x20]
148c168: cmp w11, w10
148c16c: b.eq #0x148c1a8
148c170: cmp w8, #1
148c174: b.ls #0x148c2d8
148c178: cmp w9, #1
148c17c: b.ls #0x148c2d8
148c180: ldr w8, [x24, #0x24]
148c184: ldr w9, [x0, #0x24]
148c188: cmp w8, w9
148c18c: b.ne #0x148c1f4
148c190: ldr w9, [x23, #0x18]
148c194: cmp w9, #1
148c198: b.ls #0x148c2d8
148c19c: ldr w9, [x23, #0x24]
148c1a0: cmp w9, w8
148c1a4: b.ne #0x148c1f4
148c1a8: ldr x2, [x25]
148c1ac: add w23, w22, #1
148c1b0: mov x0, x21
148c1b4: mov w1, w23
148c1b8: bl #0x1deb9a8 System.Collections.Generic.List<object>$$get_Item
148c1bc: ldr x8, [x26]
148c1c0: mov x24, x0
148c1c4: ldr w9, [x8, #0xe0]
148c1c8: cbnz w9, #0x148c1d4
148c1cc: mov x0, x8
148c1d0: bl #0x12d22a4 il2cpp_method_init
148c1d4: mov x0, x24
148c1d8: mov x1, xzr
148c1dc: bl #0x1441cac ext.util.Pools$$Return
148c1e0: ldr x2, [x28]
148c1e4: mov x0, x21
148c1e8: mov w1, w23
148c1ec: bl #0x1ded4fc System.Collections.Generic.List<object>$$RemoveAt
148c1f0: sub w22, w22, #1
148c1f4: ldr w8, [x21, #0x18]
148c1f8: add w22, w22, #1
148c1fc: sub w9, w8, #2
148c200: cmp w22, w9
148c204: b.lt #0x148c0ac
148c208: add w27, w27, #1
148c20c: cmp w27, #2
148c210: b.ne #0x148c09c
148c214: subs w22, w8, #1
148c218: b.mi #0x148c28c
148c21c: ldr x2, [x25]
148c220: mov x0, x21
148c224: mov w1, w22
148c228: bl #0x1deb9a8 System.Collections.Generic.List<object>$$get_Item
148c22c: mov x23, x0
148c230: mov x0, x19
148c234: mov x1, xzr
148c238: bl #0x1468bc8 kairo.unity.ecs.Entity$$get_ai
148c23c: cbz x23, #0x148c2dc
148c240: ldr w8, [x23, #0x18]
148c244: cbz w8, #0x148c2d8
148c248: cmp w8, #1
148c24c: b.eq #0x148c2d8
148c250: cbz x0, #0x148c2dc
148c254: ldp w1, w2, [x23, #0x20]
148c258: mov w4, #1
148c25c: mov w3, w20
148c260: mov x5, xzr
148c264: bl #0x14c4384 ecs.AIComponent$$AddCommandMove
148c268: ldr x0, [x26]
148c26c: ldr w8, [x0, #0xe0]
148c270: cbnz w8, #0x148c278
148c274: bl #0x12d22a4 il2cpp_method_init
148c278: mov x0, x23
148c27c: mov x1, xzr
148c280: bl #0x1441cac ext.util.Pools$$Return
148c284: subs w22, w22, #1
148c288: b.pl #0x148c21c
148c28c: mov w0, #1
148c290: ldp x20, x19, [sp, #0x70]
148c294: ldp x22, x21, [sp, #0x60]
148c298: ldp x24, x23, [sp, #0x50]
148c29c: ldp x26, x25, [sp, #0x40]
148c2a0: ldp x28, x27, [sp, #0x30]
148c2a4: ldr x30, [sp, #0x20]
148c2a8: add sp, sp, #0x80
148c2ac: ret
