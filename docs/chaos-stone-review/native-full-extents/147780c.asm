147780c: sub sp, sp, #0x90
1477810: str d10, [sp, #0x10]
1477814: stp d9, d8, [sp, #0x20]
1477818: stp x29, x30, [sp, #0x30]
147781c: stp x28, x27, [sp, #0x40]
1477820: stp x26, x25, [sp, #0x50]
1477824: stp x24, x23, [sp, #0x60]
1477828: stp x22, x21, [sp, #0x70]
147782c: stp x20, x19, [sp, #0x80]
1477830: adrp x26, #0x316a000
1477834: adrp x28, #0x2f5b000
1477838: ldrb w8, [x26, #0xb00]
147783c: ldr x28, [x28, #0x890]
1477840: mov w27, w7
1477844: mov w21, w6
1477848: mov w22, w5
147784c: mov w19, w4
1477850: mov w23, w3
1477854: mov w20, w2
1477858: mov w24, w1
147785c: mov v8.16b, v2.16b
1477860: mov v9.16b, v1.16b
1477864: mov v10.16b, v0.16b
1477868: mov x25, x0
147786c: tbnz w8, #0, #0x14778f0
1477870: adrp x0, #0x2f5e000
1477874: ldr x0, [x0, #0xa10]
1477878: bl #0x12d21a0
147787c: adrp x0, #0x2f5b000
1477880: ldr x0, [x0, #0x890]
1477884: bl #0x12d21a0
1477888: adrp x0, #0x2f5f000
147788c: ldr x0, [x0, #0x488]
1477890: bl #0x12d21a0
1477894: adrp x0, #0x2f5e000
1477898: ldr x0, [x0, #0x658]
147789c: bl #0x12d21a0
14778a0: adrp x0, #0x2f5e000
14778a4: ldr x0, [x0, #0x668]
14778a8: bl #0x12d21a0
14778ac: adrp x0, #0x2f5b000
14778b0: ldr x0, [x0, #0x218]
14778b4: bl #0x12d21a0
14778b8: adrp x0, #0x2f5b000
14778bc: ldr x0, [x0, #0x8a8]
14778c0: bl #0x12d21a0
14778c4: adrp x0, #0x2f5b000
14778c8: ldr x0, [x0, #0x8b0]
14778cc: bl #0x12d21a0
14778d0: adrp x0, #0x2f5b000
14778d4: ldr x0, [x0, #0x8c0]
14778d8: bl #0x12d21a0
14778dc: adrp x0, #0x2f5d000
14778e0: ldr x0, [x0, #0xd0]
14778e4: bl #0x12d21a0
14778e8: mov w8, #1
14778ec: strb w8, [x26, #0xb00]
14778f0: ldr x0, [x28]
14778f4: ldr w8, [x0, #0xe0]
14778f8: cbnz w8, #0x1477900
14778fc: bl #0x12d22a4
1477900: mov x0, xzr
1477904: bl #0x161cbb0 data.Data$$get_monsterData
1477908: cbz x0, #0x1477c54
147790c: ldr w8, [x0, #0x18]
1477910: cmp w8, w20
1477914: b.ls #0x1477c58
1477918: adrp x8, #0x2f5b000
147791c: ldr x8, [x8, #0x218]
1477920: add x9, x0, w20, sxtw #3
1477924: ldr x20, [x9, #0x20]
1477928: mov w1, #2
147792c: ldr x0, [x8]
1477930: bl #0x12d2214
1477934: cbz x20, #0x1477c54
1477938: mov x28, x0
147793c: cbz x0, #0x1477c54
1477940: ldr w8, [x28, #0x18]
1477944: cbz w8, #0x1477c58
1477948: ldr w9, [x20, #0x34]
147794c: cmp w8, #1
1477950: str w9, [x28, #0x20]
1477954: b.eq #0x1477c58
1477958: ldr w8, [x20, #0x2c]
147795c: mov w10, #0xaaab
1477960: fcvtzs w9, s10
1477964: movk w10, #0x2aaa, lsl #16
1477968: str w8, [x28, #0x24]
147796c: ldr w8, [x20, #0x34]
1477970: mov w11, #0x7f800000
1477974: fmov s0, w11
1477978: fcvtzs w11, s8
147797c: smull x9, w9, w10
1477980: mov w12, #0xaaab
1477984: smull x10, w11, w10
1477988: lsr x11, x9, #0x20
147798c: lsr x9, x9, #0x3f
1477990: ldr x0, [x25, #0x30]
1477994: cmp w8, #3
1477998: movk w12, #0xfaaa, lsl #16
147799c: add w9, w9, w11, asr #2
14779a0: lsr x11, x10, #0x20
14779a4: lsr x10, x10, #0x3f
14779a8: cset w29, eq
14779ac: fcmp s10, s0
14779b0: add w10, w10, w11, asr #2
14779b4: csel w26, w12, w9, eq
14779b8: fcmp s8, s0
14779bc: csel w25, w12, w10, eq
14779c0: cbz x0, #0x1477c54
14779c4: and w2, w27, #1
14779c8: mov w1, wzr
14779cc: bl #0x1474148 kairo.unity.ecs.EntityManager$$CreateEntity
14779d0: cbz x0, #0x1477c54
14779d4: fmov s3, wzr
14779d8: fmov s4, wzr
14779dc: fmov s5, wzr
14779e0: mov v0.16b, v10.16b
14779e4: mov v1.16b, v9.16b
14779e8: mov v2.16b, v8.16b
14779ec: mov x1, xzr
14779f0: bl #0x1471530 kairo.unity.ecs.Entity$$AddPosition
14779f4: cbz x0, #0x1477c54
14779f8: mov w1, w26
14779fc: mov w2, w25
1477a00: mov x3, xzr
1477a04: bl #0x146cb3c kairo.unity.ecs.Entity$$AddCell
1477a08: cbz x0, #0x1477c54
1477a0c: mov w2, #0xa
1477a10: mov w1, wzr
1477a14: bl #0x146d370 kairo.unity.ecs.Entity$$AddDepth
1477a18: cbz x0, #0x1477c54
1477a1c: mov x1, x28
1477a20: mov x2, xzr
1477a24: mov x3, xzr
1477a28: mov x4, xzr
1477a2c: mov x5, xzr
1477a30: mov x6, xzr
1477a34: bl #0x146f2a4 kairo.unity.ecs.Entity$$AddImage
1477a38: cbz x0, #0x1477c54
1477a3c: add w2, w24, w29, lsl #2
1477a40: mov w1, #0x16
1477a44: mov w4, #-1
1477a48: mov w3, wzr
1477a4c: bl #0x1472260 kairo.unity.ecs.Entity$$AddSeb
1477a50: cbz x0, #0x1477c54
1477a54: fmov s0, wzr
1477a58: fmov s1, wzr
1477a5c: fmov s2, wzr
1477a60: bl #0x14728f0 kairo.unity.ecs.Entity$$AddSpeed
1477a64: cbz x0, #0x1477c54
1477a68: mov w1, #1
1477a6c: mov w2, #-1
1477a70: bl #0x146ba70 kairo.unity.ecs.Entity$$AddAnimation
1477a74: cbz x0, #0x1477c54
1477a78: mov w1, w24
1477a7c: bl #0x146d48c kairo.unity.ecs.Entity$$AddDirection
1477a80: cbz x0, #0x1477c54
1477a84: ldr w1, [x20, #0x18]
1477a88: adrp x24, #0x2f5e000
1477a8c: adrp x27, #0x2f5e000
1477a90: ldr x24, [x24, #0x668]
1477a94: ldr x27, [x27, #0x658]
1477a98: mov w2, w23
1477a9c: mov w3, w19
1477aa0: mov w4, w22
1477aa4: mov w5, wzr
1477aa8: mov w6, wzr
1477aac: mov w7, w21
1477ab0: bl #0x1470c94 kairo.unity.ecs.Entity$$AddMonster
1477ab4: ldr x8, [x24]
1477ab8: mov x21, x0
1477abc: mov x0, x8
1477ac0: bl #0x12d23b8
1477ac4: ldr x1, [x27]
1477ac8: mov x22, x0
1477acc: bl #0x1b1f698 System.Collections.Generic.Dictionary<Int32Enum, int>$$.ctor
1477ad0: cbz x22, #0x1477c54
1477ad4: adrp x23, #0x2f5f000
1477ad8: ldr x23, [x23, #0x488]
1477adc: adrp x24, #0x2f5e000
1477ae0: mov w1, #0x13
1477ae4: mov x0, x22
1477ae8: ldr x3, [x23]
1477aec: ldr x24, [x24, #0xa10]
1477af0: mov w2, w26
1477af4: bl #0x1b1ffe4 System.Collections.Generic.Dictionary<Int32Enum, int>$$Add
1477af8: ldr x3, [x23]
1477afc: mov w1, #0x14
1477b00: mov x0, x22
1477b04: mov w2, w25
1477b08: bl #0x1b1ffe4 System.Collections.Generic.Dictionary<Int32Enum, int>$$Add
1477b0c: ldr x0, [x24]
1477b10: bl #0x12d23b8
1477b14: mov x1, x22
1477b18: mov x2, xzr
1477b1c: mov x23, x0
1477b20: bl #0x1465378 kairo.unity.ai.BlackboardInt$$.ctor
1477b24: cbz x21, #0x1477c54
1477b28: adrp x22, #0x2f5d000
1477b2c: ldr x22, [x22, #0xd0]
1477b30: mov x0, x21
1477b34: mov w1, wzr
1477b38: mov x2, xzr
1477b3c: mov x3, x23
1477b40: mov x4, xzr
1477b44: mov x5, xzr
1477b48: bl #0x146b520 kairo.unity.ecs.Entity$$AddAI
1477b4c: ldr x8, [x22]
1477b50: mov x21, x0
1477b54: ldr w9, [x8, #0xe0]
1477b58: cbnz w9, #0x1477b64
1477b5c: mov x0, x8
1477b60: bl #0x12d22a4
1477b64: mov x0, x20
1477b68: mov w1, w19
1477b6c: mov x2, xzr
1477b70: bl #0x16602c8 parameter.Param$$Create
1477b74: cbz x21, #0x1477c54
1477b78: adrp x19, #0x2f5b000
1477b7c: adrp x22, #0x2f5b000
1477b80: ldr x19, [x19, #0x8c0]
1477b84: ldr x22, [x22, #0x8b0]
1477b88: mov x1, x0
1477b8c: mov x0, x21
1477b90: mov x2, xzr
1477b94: bl #0x1471298 kairo.unity.ecs.Entity$$AddParameter
1477b98: ldr x8, [x19]
1477b9c: mov x19, x0
1477ba0: mov x0, x8
1477ba4: bl #0x12d23b8
1477ba8: ldr x1, [x22]
1477bac: mov x21, x0
1477bb0: bl #0x1dc5d6c System.Collections.Generic.List<int>$$.ctor
1477bb4: cbz x21, #0x1477c54
1477bb8: adrp x9, #0x2f5b000
1477bbc: ldr x9, [x9, #0x8a8]
1477bc0: ldr w10, [x21, #0x1c]
1477bc4: ldr w1, [x20, #0x90]
1477bc8: ldr x8, [x21, #0x10]
1477bcc: ldr x9, [x9]
1477bd0: add w10, w10, #1
1477bd4: str w10, [x21, #0x1c]
1477bd8: cbz x8, #0x1477c54
1477bdc: ldrsw x10, [x21, #0x18]
1477be0: ldr w11, [x8, #0x18]
1477be4: cmp w10, w11
1477be8: b.hs #0x1477c00
1477bec: add w9, w10, #1
1477bf0: add x8, x8, x10, lsl #2
1477bf4: str w9, [x21, #0x18]
1477bf8: str w1, [x8, #0x20]
1477bfc: b #0x1477c14
1477c00: ldr x8, [x9, #0x20]
1477c04: mov x0, x21
1477c08: ldr x8, [x8, #0xc0]
1477c0c: ldr x2, [x8, #0x70]
1477c10: bl #0x1dc6564 System.Collections.Generic.List<int>$$AddWithResize
1477c14: cbz x19, #0x1477c54
1477c18: mov x0, x19
1477c1c: mov x2, x21
1477c20: ldp x20, x19, [sp, #0x80]
1477c24: ldp x22, x21, [sp, #0x70]
1477c28: ldp x24, x23, [sp, #0x60]
1477c2c: ldp x26, x25, [sp, #0x50]
1477c30: ldp x28, x27, [sp, #0x40]
1477c34: ldp x29, x30, [sp, #0x30]
1477c38: ldp d9, d8, [sp, #0x20]
1477c3c: ldr d10, [sp, #0x10]
1477c40: mov w1, #1
1477c44: mov x3, xzr
1477c48: mov x4, xzr
1477c4c: add sp, sp, #0x90
1477c50: b #0x1472564 kairo.unity.ecs.Entity$$AddSkill
1477c54: bl #0x12d23c8
1477c58: bl #0x12d23d0
