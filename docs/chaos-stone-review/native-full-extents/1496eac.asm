1496eac: stp d9, d8, [sp, #-0x50]!
1496eb0: str x30, [sp, #0x10]
1496eb4: stp x24, x23, [sp, #0x20]
1496eb8: stp x22, x21, [sp, #0x30]
1496ebc: stp x20, x19, [sp, #0x40]
1496ec0: adrp x19, #0x316a000
1496ec4: ldrb w8, [x19, #0xbc0]
1496ec8: mov x20, x1
1496ecc: mov x21, x0
1496ed0: tbnz w8, #0, #0x1496f3c
1496ed4: adrp x0, #0x2f5f000
1496ed8: ldr x0, [x0, #0x410]
1496edc: bl #0x12d21a0
1496ee0: adrp x0, #0x2f5f000
1496ee4: ldr x0, [x0, #0x980]
1496ee8: bl #0x12d21a0
1496eec: adrp x0, #0x2f5f000
1496ef0: ldr x0, [x0, #0xb88]
1496ef4: bl #0x12d21a0
1496ef8: adrp x0, #0x2f5d000
1496efc: ldr x0, [x0, #0x3e8]
1496f00: bl #0x12d21a0
1496f04: adrp x0, #0x2f5f000
1496f08: ldr x0, [x0, #0xb68]
1496f0c: bl #0x12d21a0
1496f10: adrp x0, #0x2f5c000
1496f14: ldr x0, [x0, #0x538]
1496f18: bl #0x12d21a0
1496f1c: adrp x0, #0x2f5d000
1496f20: ldr x0, [x0, #0x4c8]
1496f24: bl #0x12d21a0
1496f28: adrp x0, #0x2f5f000
1496f2c: ldr x0, [x0, #0xda8]
1496f30: bl #0x12d21a0
1496f34: mov w8, #1
1496f38: strb w8, [x19, #0xbc0]
1496f3c: cbz x20, #0x1497350
1496f40: mov x0, x20
1496f44: mov x1, xzr
1496f48: bl #0x1468bc8 kairo.unity.ecs.Entity$$get_ai
1496f4c: cbz x0, #0x1497350
1496f50: ldr w8, [x0, #0x1c]
1496f54: mov x19, x0
1496f58: cmp w8, #2
1496f5c: b.eq #0x1497134
1496f60: cbnz w8, #0x14972f4
1496f64: mov x0, x20
1496f68: mov x1, xzr
1496f6c: bl #0x1468bc8 kairo.unity.ecs.Entity$$get_ai
1496f70: cbz x0, #0x1497350
1496f74: ldr x0, [x0, #0x58]
1496f78: cbz x0, #0x1497350
1496f7c: adrp x23, #0x2f5f000
1496f80: ldr x23, [x23, #0xb88]
1496f84: mov w1, #0x13
1496f88: mov w2, #0x7fffffff
1496f8c: ldr x3, [x23]
1496f90: bl #0x1a6a1cc kairo.unity.ai.Blackboard<Int32Enum, int>$$Get
1496f94: mov w22, w0
1496f98: mov x0, x20
1496f9c: mov x1, xzr
1496fa0: bl #0x1468bc8 kairo.unity.ecs.Entity$$get_ai
1496fa4: cbz x0, #0x1497350
1496fa8: ldr x0, [x0, #0x58]
1496fac: cbz x0, #0x1497350
1496fb0: ldr x3, [x23]
1496fb4: mov w1, #0x14
1496fb8: mov w2, #0x7fffffff
1496fbc: mov w20, #0x7fffffff
1496fc0: bl #0x1a6a1cc kairo.unity.ai.Blackboard<Int32Enum, int>$$Get
1496fc4: cmp w22, w20
1496fc8: b.eq #0x14972c0
1496fcc: mov w23, w0
1496fd0: cmp w0, w20
1496fd4: b.eq #0x14972c0
1496fd8: ldr x0, [x21, #0x10]
1496fdc: cbz x0, #0x1497350
1496fe0: mov x1, xzr
1496fe4: bl #0x1475b3c kairo.unity.ecs.World$$get_map
1496fe8: adrp x24, #0x2f5f000
1496fec: ldr x24, [x24, #0xb68]
1496ff0: mov x20, x0
1496ff4: ldr x8, [x24]
1496ff8: ldr w9, [x8, #0xe0]
1496ffc: cbnz w9, #0x1497008
1497000: mov x0, x8
1497004: bl #0x12d22a4
1497008: mov w3, #4
149700c: mov x0, x20
1497010: mov w1, w22
1497014: mov w2, w23
1497018: mov x4, xzr
149701c: bl #0x15b03d0 ecs.MapSystem$$GetRandomLocation
1497020: ldr x8, [x21, #0x10]
1497024: cbz x8, #0x1497350
1497028: adrp x9, #0x2f5d000
149702c: ldr x9, [x9, #0x4c8]
1497030: mov x21, x0
1497034: mov x0, x8
1497038: ldr x1, [x9]
149703c: bl #0x191de04 kairo.unity.ecs.World$$GetSystem<object>
1497040: cbz x21, #0x1497350
1497044: cbz x0, #0x1497350
1497048: ldp w1, w2, [x21, #0x10]
149704c: mov x3, xzr
1497050: bl #0x15febc0 ecs.TownSystem$$IsTownTerritory
1497054: tbnz w0, #0, #0x14972c0
1497058: ldr x0, [x24]
149705c: ldp w23, w22, [x21, #0x10]
1497060: ldr w8, [x0, #0xe0]
1497064: cbnz w8, #0x149706c
1497068: bl #0x12d22a4
149706c: mov w3, #1
1497070: mov x0, x20
1497074: mov w1, w23
1497078: mov w2, w22
149707c: mov x4, xzr
1497080: bl #0x15afd9c ecs.MapSystem$$GetMapChip
1497084: cbz x0, #0x1497350
1497088: mov x1, xzr
149708c: bl #0x146fcd8 kairo.unity.ecs.Entity$$get_mapChip
1497090: cbz x0, #0x1497350
1497094: mov x1, xzr
1497098: bl #0x14cca04 ecs.MapChipComponent$$get_data
149709c: cbz x0, #0x1497350
14970a0: ldr w8, [x0, #0x20]
14970a4: mov x22, x0
14970a8: cmp w8, #0x11
14970ac: b.eq #0x14972c0
14970b0: mov w1, #0x2000
14970b4: mov x0, x22
14970b8: mov x2, xzr
14970bc: bl #0x162d654 data.MapChipData$$Check
14970c0: tbnz w0, #0, #0x14972c0
14970c4: mov w1, #0x80000
14970c8: mov x0, x22
14970cc: mov x2, xzr
14970d0: bl #0x162d654 data.MapChipData$$Check
14970d4: tbz w0, #0, #0x14972c0
14970d8: cbz x20, #0x1497350
14970dc: ldp w8, w9, [x21, #0x10]
14970e0: ldp w10, w11, [x20, #0x20]
14970e4: mov x0, x19
14970e8: mov w3, wzr
14970ec: mov w4, wzr
14970f0: mul w1, w10, w8
14970f4: mul w2, w11, w9
14970f8: mov w5, wzr
14970fc: mov x6, xzr
1497100: bl #0x14c4488 ecs.AIComponent$$AddCommandMoveRoute
1497104: adrp x8, #0x2f5c000
1497108: ldr x8, [x8, #0x538]
149710c: ldr x0, [x8]
1497110: ldr w8, [x0, #0xe0]
1497114: cbnz w8, #0x149711c
1497118: bl #0x12d22a4
149711c: mov w0, #0x14
1497120: mov w1, #0x1e
1497124: mov x2, xzr
1497128: bl #0x145ff98 kairo.unity.math.Random$$Rand
149712c: mov w1, w0
1497130: b #0x14972c4
1497134: mov x0, x20
1497138: mov x1, xzr
149713c: bl #0x1470bfc kairo.unity.ecs.Entity$$get_monster
1497140: cbz x0, #0x1497350
1497144: mov x1, xzr
1497148: bl #0x14cdb94 ecs.MonsterComponent$$get_data
149714c: cbz x0, #0x1497350
1497150: ldr w8, [x0, #0x30]
1497154: cmp w8, #1
1497158: b.ne #0x1497260
149715c: mov x0, x20
1497160: mov x1, xzr
1497164: bl #0x1470bfc kairo.unity.ecs.Entity$$get_monster
1497168: cbz x0, #0x1497350
149716c: ldr w8, [x0, #0x24]
1497170: mov w9, #0x1c20
1497174: cmp w8, w9
1497178: b.lt #0x1497260
149717c: mov x0, x20
1497180: mov x1, xzr
1497184: bl #0x146e6ac kairo.unity.ecs.Entity$$get_hasGarbage
1497188: tbnz w0, #0, #0x1497260
149718c: ldr x0, [x19, #0x60]
1497190: cbz x0, #0x1497350
1497194: adrp x8, #0x2f5d000
1497198: ldr x22, [x21, #0x10]
149719c: ldr x8, [x8, #0x3e8]
14971a0: mov w1, #0x2f
14971a4: mov x2, #-1
14971a8: ldr x3, [x8]
14971ac: bl #0x1a6a40c kairo.unity.ai.Blackboard<Int32Enum, long>$$Get
14971b0: cbz x22, #0x1497350
14971b4: mov x1, x0
14971b8: mov x0, x22
14971bc: mov x2, xzr
14971c0: bl #0x147ac28 kairo.unity.ecs.World$$DestroyEntity
14971c4: ldr x22, [x21, #0x10]
14971c8: mov x0, x20
14971cc: mov x1, xzr
14971d0: bl #0x1471498 kairo.unity.ecs.Entity$$get_position
14971d4: cbz x0, #0x1497350
14971d8: ldr s8, [x0, #0x10]
14971dc: mov x0, x20
14971e0: mov x1, xzr
14971e4: bl #0x1471498 kairo.unity.ecs.Entity$$get_position
14971e8: cbz x0, #0x1497350
14971ec: ldr s9, [x0, #0x14]
14971f0: mov x0, x20
14971f4: mov x1, xzr
14971f8: bl #0x1471498 kairo.unity.ecs.Entity$$get_position
14971fc: cbz x0, #0x1497350
1497200: cbz x22, #0x1497350
1497204: ldr s2, [x0, #0x18]
1497208: fmov s0, #30.00000000
149720c: fadd s1, s9, s0
1497210: mov w1, #0xd
1497214: mov w3, #0x64
1497218: mov x0, x22
149721c: mov v0.16b, v8.16b
1497220: mov w2, wzr
1497224: mov x4, xzr
1497228: bl #0x1479108 kairo.unity.ecs.World$$CreateEffect
149722c: ldr x0, [x21, #0x10]
1497230: cbz x0, #0x1497350
1497234: adrp x8, #0x2f5f000
1497238: ldr x8, [x8, #0xda8]
149723c: mov w1, #0x20
1497240: mov x2, x20
1497244: mov x3, xzr
1497248: ldr x4, [x8]
149724c: bl #0x191e880 kairo.unity.ecs.World$$Send<object, object>
1497250: mov w1, #1
1497254: mov x0, x20
1497258: mov x2, xzr
149725c: bl #0x146e6bc kairo.unity.ecs.Entity$$AddGarbage
1497260: adrp x21, #0x2f5f000
1497264: ldr x21, [x21, #0x980]
1497268: ldr x0, [x21]
149726c: ldr w8, [x0, #0xe0]
1497270: cbnz w8, #0x149727c
1497274: bl #0x12d22a4
1497278: ldr x0, [x21]
149727c: ldr x8, [x0, #0xb8]
1497280: ldr x0, [x8]
1497284: cbz x0, #0x1497350
1497288: mov x1, xzr
149728c: bl #0x167dc90 main.AppData$$IsNight
1497290: adrp x8, #0x2f5f000
1497294: ldr x8, [x8, #0x410]
1497298: tbz w0, #0, #0x149730c
149729c: ldr x0, [x8]
14972a0: ldr w19, [x19, #0x14]
14972a4: ldr w8, [x0, #0xe0]
14972a8: cbz w19, #0x1497324
14972ac: cbnz w8, #0x14972b4
14972b0: bl #0x12d22a4
14972b4: mov x0, x20
14972b8: mov w1, w19
14972bc: b #0x1497334
14972c0: mov w1, #0x14
14972c4: mov x0, x19
14972c8: mov w2, wzr
14972cc: mov w3, wzr
14972d0: mov x4, xzr
14972d4: bl #0x14c47f0 ecs.AIComponent$$AddCommandWait
14972d8: mov w1, #2
14972dc: mov x0, x19
14972e0: mov w2, wzr
14972e4: mov x3, xzr
14972e8: bl #0x14c4b7c ecs.AIComponent$$AddCommandPhase
14972ec: mov w8, #1
14972f0: str w8, [x19, #0x1c]
14972f4: ldp x20, x19, [sp, #0x40]
14972f8: ldp x22, x21, [sp, #0x30]
14972fc: ldp x24, x23, [sp, #0x20]
1497300: ldr x30, [sp, #0x10]
1497304: ldp d9, d8, [sp], #0x50
1497308: ret
149730c: ldr x0, [x8]
1497310: ldr w8, [x0, #0xe0]
1497314: cbnz w8, #0x149731c
1497318: bl #0x12d22a4
149731c: mov w1, #2
1497320: b #0x1497330
1497324: cbnz w8, #0x149732c
1497328: bl #0x12d22a4
149732c: mov w1, #1
1497330: mov x0, x20
1497334: ldp x20, x19, [sp, #0x40]
1497338: ldp x22, x21, [sp, #0x30]
149733c: ldp x24, x23, [sp, #0x20]
1497340: ldr x30, [sp, #0x10]
1497344: mov w2, wzr
1497348: ldp d9, d8, [sp], #0x50
149734c: b #0x1483934 ecs.AISystem$$ChangeState
1497350: bl #0x12d23c8
