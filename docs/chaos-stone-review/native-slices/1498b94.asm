1498b94: stp d9, d8, [sp, #-0x50]!
1498b98: str x30, [sp, #0x10]
1498b9c: stp x24, x23, [sp, #0x20]
1498ba0: stp x22, x21, [sp, #0x30]
1498ba4: stp x20, x19, [sp, #0x40]
1498ba8: adrp x21, #0x316a000
1498bac: ldrb w8, [x21, #0xbc5]
1498bb0: mov x19, x1
1498bb4: mov x20, x0
1498bb8: tbnz w8, #0, #0x1498bf4
1498bbc: adrp x0, #0x2f5d000
1498bc0: ldr x0, [x0, #0x3e8]
1498bc4: bl #0x12d21a0 il2cpp_class_init
1498bc8: adrp x0, #0x2f5f000
1498bcc: ldr x0, [x0, #0xb68]
1498bd0: bl #0x12d21a0 il2cpp_class_init
1498bd4: adrp x0, #0x2f5c000
1498bd8: ldr x0, [x0, #0x538]
1498bdc: bl #0x12d21a0 il2cpp_class_init
1498be0: adrp x0, #0x2f5f000
1498be4: ldr x0, [x0, #0xda8]
1498be8: bl #0x12d21a0 il2cpp_class_init
1498bec: mov w8, #1
1498bf0: strb w8, [x21, #0xbc5]
1498bf4: cbz x19, #0x1498eac
1498bf8: mov x0, x19
1498bfc: mov x1, xzr
1498c00: bl #0x1468bc8 kairo.unity.ecs.Entity$$get_ai
1498c04: cbz x0, #0x1498eac
1498c08: ldr w8, [x0, #0x1c]
1498c0c: mov x21, x0
1498c10: cmp w8, #1
1498c14: b.ne #0x1498e94
1498c18: ldr w8, [x21, #0x54]
1498c1c: mov w9, #0xcccd
1498c20: mov w10, #0x9998
1498c24: movk w9, #0xcccc, lsl #16
1498c28: movk w10, #0x1999, lsl #16
1498c2c: madd w8, w8, w9, w10
1498c30: mov w9, #0xcccc
1498c34: ror w8, w8, #2
1498c38: movk w9, #0xccc, lsl #16
1498c3c: cmp w8, w9
1498c40: b.hi #0x1498e94
1498c44: mov x0, x19
1498c48: mov x1, xzr
1498c4c: bl #0x1470bfc kairo.unity.ecs.Entity$$get_monster
1498c50: cbz x0, #0x1498eac
1498c54: mov x1, xzr
1498c58: bl #0x14cdb94 ecs.MonsterComponent$$get_data
1498c5c: cbz x0, #0x1498eac
1498c60: ldr w8, [x0, #0x30]
1498c64: cmp w8, #1
1498c68: b.ne #0x1498e34
1498c6c: mov x0, x19
1498c70: mov x1, xzr
1498c74: bl #0x1470bfc kairo.unity.ecs.Entity$$get_monster
1498c78: cbz x0, #0x1498eac
1498c7c: mov w1, #1
1498c80: mov x2, xzr
1498c84: bl #0x14cdc18 ecs.MonsterComponent$$Check
1498c88: tbz w0, #0, #0x1498e34
1498c8c: ldr x22, [x20, #0x10]
1498c90: mov x0, x19
1498c94: mov x1, xzr
1498c98: bl #0x146caa4 kairo.unity.ecs.Entity$$get_cell
1498c9c: cbz x0, #0x1498eac
1498ca0: ldr w23, [x0, #0x10]
1498ca4: mov x0, x19
1498ca8: mov x1, xzr
1498cac: bl #0x146caa4 kairo.unity.ecs.Entity$$get_cell
1498cb0: cbz x0, #0x1498eac
1498cb4: adrp x8, #0x2f5f000
1498cb8: ldr x8, [x8, #0xb68]
1498cbc: ldr w24, [x0, #0x14]
1498cc0: ldr x8, [x8]
1498cc4: ldr w9, [x8, #0xe0]
1498cc8: cbnz w9, #0x1498cd4
1498ccc: mov x0, x8
1498cd0: bl #0x12d22a4 il2cpp_method_init
1498cd4: mov w3, #1
1498cd8: mov x0, x22
1498cdc: mov w1, w23
1498ce0: mov w2, w24
1498ce4: mov x4, xzr
1498ce8: bl #0x15b00c8 ecs.MapSystem$$GetMapChip
1498cec: mov x1, xzr
1498cf0: mov x22, x0
1498cf4: bl #0x1477df0 kairo.unity.ecs.EntityExtension$$IsAlive
1498cf8: tbz w0, #0, #0x1498e34
1498cfc: mov x0, x19
1498d00: mov x1, xzr
1498d04: bl #0x1470bfc kairo.unity.ecs.Entity$$get_monster
1498d08: cbz x0, #0x1498eac
1498d0c: mov x1, xzr
1498d10: bl #0x14cdb94 ecs.MonsterComponent$$get_data
1498d14: cbz x0, #0x1498eac
1498d18: mov w1, #4
1498d1c: mov x2, xzr
1498d20: bl #0x161c200 data.BaseData$$Check
1498d24: tst w0, #1
1498d28: mov w8, #0x19
1498d2c: mov w9, #0x68
1498d30: csel w23, w9, w8, ne
1498d34: cbz x22, #0x1498eac
1498d38: mov x0, x22
1498d3c: mov x1, xzr
1498d40: bl #0x146fcd8 kairo.unity.ecs.Entity$$get_mapChip
1498d44: cbz x0, #0x1498eac
1498d48: mov x1, xzr
1498d4c: bl #0x14cca04 ecs.MapChipComponent$$get_data
1498d50: cbz x0, #0x1498eac
1498d54: ldr w8, [x0, #0x24]
1498d58: cmp w8, w23
1498d5c: b.eq #0x1498e34
1498d60: ldr x0, [x21, #0x60]
1498d64: cbz x0, #0x1498eac
1498d68: adrp x8, #0x2f5d000
1498d6c: ldr x21, [x20, #0x10]
1498d70: ldr x8, [x8, #0x3e8]
1498d74: mov w1, #0x2f
1498d78: mov x2, #-1
1498d7c: ldr x3, [x8]
1498d80: bl #0x1a6a40c kairo.unity.ai.Blackboard<Int32Enum, long>$$Get
1498d84: cbz x21, #0x1498eac
1498d88: mov x1, x0
1498d8c: mov x0, x21
1498d90: mov x2, xzr
1498d94: bl #0x147ac28 kairo.unity.ecs.World$$DestroyEntity
1498d98: ldr x21, [x20, #0x10]
1498d9c: mov x0, x19
1498da0: mov x1, xzr
1498da4: bl #0x1471498 kairo.unity.ecs.Entity$$get_position
1498da8: cbz x0, #0x1498eac
1498dac: ldr s8, [x0, #0x10]
1498db0: mov x0, x19
1498db4: mov x1, xzr
1498db8: bl #0x1471498 kairo.unity.ecs.Entity$$get_position
1498dbc: cbz x0, #0x1498eac
1498dc0: ldr s9, [x0, #0x14]
1498dc4: mov x0, x19
1498dc8: mov x1, xzr
1498dcc: bl #0x1471498 kairo.unity.ecs.Entity$$get_position
1498dd0: cbz x0, #0x1498eac
1498dd4: cbz x21, #0x1498eac
1498dd8: ldr s2, [x0, #0x18]
1498ddc: fmov s0, #30.00000000
1498de0: fadd s1, s9, s0
1498de4: mov w1, #0xd
1498de8: mov w3, #0x64
1498dec: mov x0, x21
1498df0: mov v0.16b, v8.16b
1498df4: mov w2, wzr
1498df8: mov x4, xzr
1498dfc: bl #0x1479108 kairo.unity.ecs.World$$CreateEffect
1498e00: ldr x0, [x20, #0x10]
1498e04: cbz x0, #0x1498eac
1498e08: adrp x8, #0x2f5f000
1498e0c: ldr x8, [x8, #0xda8]
1498e10: mov w1, #0x20
1498e14: mov x2, x19
1498e18: mov x3, xzr
1498e1c: ldr x4, [x8]
1498e20: bl #0x191e880 kairo.unity.ecs.World$$Send<object, object>
1498e24: mov w1, #1
1498e28: mov x0, x19
1498e2c: mov x2, xzr
1498e30: bl #0x146e6bc kairo.unity.ecs.Entity$$AddGarbage
1498e34: adrp x20, #0x2f5c000
1498e38: ldr x20, [x20, #0x538]
1498e3c: ldr x0, [x20]
1498e40: ldr w8, [x0, #0xe0]
1498e44: cbnz w8, #0x1498e4c
1498e48: bl #0x12d22a4 il2cpp_method_init
1498e4c: mov w0, #0x19
1498e50: mov x1, xzr
1498e54: bl #0x1460024 kairo.unity.math.Random$$Hits
1498e58: tbz w0, #0, #0x1498e94
1498e5c: mov x0, x19
1498e60: mov x1, xzr
1498e64: bl #0x146d3f4 kairo.unity.ecs.Entity$$get_direction
1498e68: ldr x8, [x20]
1498e6c: mov x19, x0
1498e70: ldr w9, [x8, #0xe0]
1498e74: cbnz w9, #0x1498e80
1498e78: mov x0, x8
1498e7c: bl #0x12d22a4 il2cpp_method_init
1498e80: mov w0, #4
1498e84: mov x1, xzr
1498e88: bl #0x145fee4 kairo.unity.math.Random$$Rand
1498e8c: cbz x19, #0x1498eac
1498e90: str w0, [x19, #0x10]
1498e94: ldp x20, x19, [sp, #0x40]
1498e98: ldp x22, x21, [sp, #0x30]
1498e9c: ldp x24, x23, [sp, #0x20]
1498ea0: ldr x30, [sp, #0x10]
1498ea4: ldp d9, d8, [sp], #0x50
1498ea8: ret
