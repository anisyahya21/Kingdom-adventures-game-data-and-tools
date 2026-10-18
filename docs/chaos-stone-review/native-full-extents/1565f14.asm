1565f14: sub sp, sp, #0xb0
1565f18: stp d9, d8, [sp, #0x40]
1565f1c: str x30, [sp, #0x50]
1565f20: stp x28, x27, [sp, #0x60]
1565f24: stp x26, x25, [sp, #0x70]
1565f28: stp x24, x23, [sp, #0x80]
1565f2c: stp x22, x21, [sp, #0x90]
1565f30: stp x20, x19, [sp, #0xa0]
1565f34: adrp x21, #0x316b000
1565f38: ldrb w8, [x21, #0x12c]
1565f3c: mov x20, x1
1565f40: mov x19, x0
1565f44: tbnz w8, #0, #0x1565f74
1565f48: adrp x0, #0x2f5f000
1565f4c: ldr x0, [x0, #0x4d0]
1565f50: bl #0x12d21a0
1565f54: adrp x0, #0x2f5c000
1565f58: ldr x0, [x0, #0x538]
1565f5c: bl #0x12d21a0
1565f60: adrp x0, #0x2f5d000
1565f64: ldr x0, [x0, #0x678]
1565f68: bl #0x12d21a0
1565f6c: mov w8, #1
1565f70: strb w8, [x21, #0x12c]
1565f74: cbz x20, #0x1566260
1565f78: mov x0, x20
1565f7c: mov x1, xzr
1565f80: bl #0x146caa4 kairo.unity.ecs.Entity$$get_cell
1565f84: cbz x0, #0x1566260
1565f88: ldr w23, [x0, #0x10]
1565f8c: mov x0, x20
1565f90: mov x1, xzr
1565f94: bl #0x146caa4 kairo.unity.ecs.Entity$$get_cell
1565f98: cbz x0, #0x1566260
1565f9c: ldr x8, [x19, #0x10]
1565fa0: cbz x8, #0x1566260
1565fa4: adrp x9, #0x2f5d000
1565fa8: ldr x9, [x9, #0x678]
1565fac: ldr w24, [x0, #0x14]
1565fb0: mov x0, x8
1565fb4: ldr x1, [x9]
1565fb8: bl #0x191de04 kairo.unity.ecs.World$$GetSystem<object>
1565fbc: cbz x0, #0x1566260
1565fc0: mov w1, w23
1565fc4: mov w2, w24
1565fc8: mov x3, xzr
1565fcc: bl #0x14db414 ecs.AreaSystem$$GetArea
1565fd0: mov x1, xzr
1565fd4: mov x21, x0
1565fd8: bl #0x147e7e0 kairo.unity.ecs.EntityExtension$$IsNullOrDestroyed
1565fdc: tbnz w0, #0, #0x156623c
1565fe0: mov x0, x19
1565fe4: mov w1, w23
1565fe8: mov w2, w24
1565fec: mov w3, wzr
1565ff0: mov w4, wzr
1565ff4: bl #0x15666cc ecs.EnemyBaseSystem$$ChooseMonsterData
1565ff8: cbz x0, #0x156623c
1565ffc: mov x22, x0
1566000: mov x0, x20
1566004: mov x1, xzr
1566008: bl #0x146fd60 kairo.unity.ecs.Entity$$get_hasMapChip
156600c: tbz w0, #0, #0x1566024
1566010: add w1, w23, #1
1566014: add x0, sp, #0x58
1566018: mov w2, w24
156601c: str xzr, [sp, #0x58]
1566020: b #0x1566070
1566024: adrp x8, #0x2f5c000
1566028: ldr x8, [x8, #0x538]
156602c: ldr x0, [x8]
1566030: ldr w8, [x0, #0xe0]
1566034: cbnz w8, #0x156603c
1566038: bl #0x12d22a4
156603c: mov w0, #-1
1566040: mov w1, #1
1566044: mov x2, xzr
1566048: bl #0x145ff98 kairo.unity.math.Random$$Rand
156604c: mov w25, w0
1566050: mov w0, #-1
1566054: mov w1, #1
1566058: mov x2, xzr
156605c: bl #0x145ff98 kairo.unity.math.Random$$Rand
1566060: str xzr, [sp, #0x58]
1566064: add w1, w25, w23
1566068: add w2, w0, w24
156606c: add x0, sp, #0x58
1566070: mov x3, xzr
1566074: bl #0x145fc10 kairo.unity.math.Location$$.ctor
1566078: ldp w26, w25, [sp, #0x58]
156607c: ldr x0, [x19, #0x10]
1566080: cbz x0, #0x1566260
1566084: mov x1, xzr
1566088: bl #0x1475b3c kairo.unity.ecs.World$$get_map
156608c: cbz x0, #0x1566260
1566090: ldr x8, [x19, #0x10]
1566094: cbz x8, #0x1566260
1566098: ldr w27, [x0, #0x20]
156609c: mov x0, x8
15660a0: mov x1, xzr
15660a4: bl #0x1475b3c kairo.unity.ecs.World$$get_map
15660a8: cbz x0, #0x1566260
15660ac: cbz x21, #0x1566260
15660b0: ldr w28, [x0, #0x24]
15660b4: ldr x23, [x19, #0x10]
15660b8: ldr w22, [x22, #0x18]
15660bc: mov x0, x21
15660c0: mov x1, xzr
15660c4: bl #0x146bc50 kairo.unity.ecs.Entity$$get_area
15660c8: cbz x0, #0x1566260
15660cc: mov x1, xzr
15660d0: bl #0x14c63a4 ecs.AreaComponent$$get_data
15660d4: cbz x0, #0x1566260
15660d8: ldr w24, [x0, #0x2c]
15660dc: mov x0, x21
15660e0: mov x1, xzr
15660e4: bl #0x146bc50 kairo.unity.ecs.Entity$$get_area
15660e8: cbz x0, #0x1566260
15660ec: mov x1, xzr
15660f0: bl #0x14c63a4 ecs.AreaComponent$$get_data
15660f4: cbz x0, #0x1566260
15660f8: cbz x23, #0x1566260
15660fc: ldr w5, [x0, #0x2c]
1566100: mul w8, w27, w26
1566104: mul w9, w28, w25
1566108: scvtf s8, w8
156610c: scvtf s9, w9
1566110: fmov s1, wzr
1566114: mov w1, #1
1566118: mov w6, #0x1388
156611c: mov x0, x23
1566120: mov v0.16b, v8.16b
1566124: mov v2.16b, v9.16b
1566128: mov w2, w22
156612c: mov x3, x20
1566130: mov w4, w24
1566134: mov w7, wzr
1566138: str xzr, [sp, #0x18]
156613c: strb wzr, [sp, #0x10]
1566140: str wzr, [sp, #8]
1566144: str wzr, [sp]
1566148: bl #0x1477c5c kairo.unity.ecs.World$$CreateEnemyMonster
156614c: cbz x0, #0x1566260
1566150: mov w8, #0xff
1566154: fmov s0, wzr
1566158: fmov s1, wzr
156615c: fmov s2, wzr
1566160: fmov s3, #1.00000000
1566164: fmov s4, wzr
1566168: mov w4, #0x14
156616c: mov w1, wzr
1566170: mov w2, wzr
1566174: mov w3, wzr
1566178: mov w5, wzr
156617c: mov w6, wzr
1566180: mov w7, wzr
1566184: str xzr, [sp, #8]
1566188: str w8, [sp]
156618c: bl #0x14709bc kairo.unity.ecs.Entity$$AddModifyAnimation
1566190: cbz x0, #0x1566260
1566194: mov x1, xzr
1566198: bl #0x1468bc8 kairo.unity.ecs.Entity$$get_ai
156619c: cbz x0, #0x1566260
15661a0: mov w8, #2
15661a4: str w8, [x0, #0x10]
15661a8: adrp x20, #0x2f5f000
15661ac: ldr x20, [x20, #0x4d0]
15661b0: ldr x19, [x19, #0x10]
15661b4: ldr x0, [x20]
15661b8: ldr w8, [x0, #0xe0]
15661bc: cbnz w8, #0x15661c8
15661c0: bl #0x12d22a4
15661c4: ldr x0, [x20]
15661c8: ldr x8, [x0, #0xb8]
15661cc: ldr x8, [x8]
15661d0: cbz x8, #0x1566260
15661d4: ldr w9, [x8, #0x18]
15661d8: cmp w9, #0xd
15661dc: b.ls #0x1566264
15661e0: cbz x19, #0x1566260
15661e4: ldr w4, [x8, #0x54]
15661e8: mov w8, #0x64
15661ec: mov w9, #1
15661f0: mov w10, #0xd
15661f4: fmov s1, #20.00000000
15661f8: mov w3, #0x1c
15661fc: mov w5, #1
1566200: mov v0.16b, v8.16b
1566204: mov v2.16b, v9.16b
1566208: mov x0, x19
156620c: mov w1, wzr
1566210: mov w2, wzr
1566214: mov w6, wzr
1566218: mov w7, wzr
156621c: str xzr, [sp, #0x30]
1566220: str wzr, [sp, #0x20]
1566224: str xzr, [sp, #8]
1566228: str w8, [sp, #0x28]
156622c: strb w9, [sp, #0x18]
1566230: str w10, [sp, #0x10]
1566234: str wzr, [sp]
1566238: bl #0x1478ea0 kairo.unity.ecs.World$$CreateEffect
156623c: ldp x20, x19, [sp, #0xa0]
1566240: ldp x22, x21, [sp, #0x90]
1566244: ldp x24, x23, [sp, #0x80]
1566248: ldp x26, x25, [sp, #0x70]
156624c: ldp x28, x27, [sp, #0x60]
1566250: ldr x30, [sp, #0x50]
1566254: ldp d9, d8, [sp, #0x40]
1566258: add sp, sp, #0xb0
156625c: ret
1566260: bl #0x12d23c8
1566264: bl #0x12d23d0
