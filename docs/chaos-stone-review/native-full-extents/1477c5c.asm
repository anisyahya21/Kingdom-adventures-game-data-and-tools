1477c5c: sub sp, sp, #0x30
1477c60: stp x30, x21, [sp, #0x10]
1477c64: stp x20, x19, [sp, #0x20]
1477c68: ldrb w9, [sp, #0x40]
1477c6c: ldr w20, [sp, #0x38]
1477c70: ldr w21, [sp, #0x30]
1477c74: mov w8, w7
1477c78: mov x19, x3
1477c7c: and w7, w9, #1
1477c80: mov w3, w4
1477c84: mov w4, w5
1477c88: mov w5, w6
1477c8c: mov w6, w8
1477c90: bl #0x147780c kairo.unity.ecs.World$$CreateMonster
1477c94: cbz x0, #0x1477cb4
1477c98: mov x1, x19
1477c9c: mov w2, w21
1477ca0: mov w3, w20
1477ca4: ldp x20, x19, [sp, #0x20]
1477ca8: ldp x30, x21, [sp, #0x10]
1477cac: add sp, sp, #0x30
1477cb0: b #0x146dc04 kairo.unity.ecs.Entity$$AddEnemy
1477cb4: bl #0x12d23c8
