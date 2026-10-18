1566268: str x30, [sp, #-0x60]!
156626c: stp x28, x27, [sp, #0x10]
1566270: stp x26, x25, [sp, #0x20]
1566274: stp x24, x23, [sp, #0x30]
1566278: stp x22, x21, [sp, #0x40]
156627c: stp x20, x19, [sp, #0x50]
1566280: adrp x19, #0x316b000
1566284: ldrb w8, [x19, #0x12b]
1566288: mov x20, x0
156628c: tbnz w8, #0, #0x15662e0
1566290: adrp x0, #0x2f5b000
1566294: ldr x0, [x0, #0x570]
1566298: bl #0x12d21a0 il2cpp_class_init
156629c: adrp x0, #0x2f5c000
15662a0: ldr x0, [x0, #0x138]
15662a4: bl #0x12d21a0 il2cpp_class_init
15662a8: adrp x0, #0x2f5d000
15662ac: ldr x0, [x0, #0x358]
15662b0: bl #0x12d21a0 il2cpp_class_init
15662b4: adrp x0, #0x2f5d000
15662b8: ldr x0, [x0, #0x360]
15662bc: bl #0x12d21a0 il2cpp_class_init
15662c0: adrp x0, #0x2f5c000
15662c4: ldr x0, [x0, #0x140]
15662c8: bl #0x12d21a0 il2cpp_class_init
15662cc: adrp x0, #0x2f5d000
15662d0: ldr x0, [x0, #0xd0]
15662d4: bl #0x12d21a0 il2cpp_class_init
15662d8: mov w8, #1
15662dc: strb w8, [x19, #0x12b]
15662e0: mov x0, x20
15662e4: bl #0x1563cbc ecs.EnemyBaseSystem$$get_enemyGenerators
15662e8: cbz x0, #0x15665d8
15662ec: adrp x10, #0x2f5d000
15662f0: ldr x8, [x0]
15662f4: ldr x10, [x10, #0x358]
15662f8: mov x19, x0
15662fc: ldrh w9, [x8, #0x12e]
1566300: ldr x1, [x10]
1566304: cbz x9, #0x1566328
1566308: ldr x10, [x8, #0xb0]
156630c: add x10, x10, #8
1566310: ldur x11, [x10, #-8]
1566314: cmp x11, x1
1566318: b.eq #0x1566338
156631c: subs x9, x9, #1
1566320: add x10, x10, #0x10
1566324: b.ne #0x1566310
1566328: mov x0, x19
156632c: mov w2, wzr
1566330: bl #0x1332890
1566334: b #0x1566344
1566338: ldrsw x9, [x10]
156633c: add x8, x8, x9, lsl #4
1566340: add x0, x8, #0x138
1566344: ldp x8, x1, [x0]
1566348: adrp x23, #0x2f5c000
156634c: ldr x23, [x23, #0x138]
1566350: mov x0, x19
1566354: blr x8
1566358: mov x19, x0
156635c: cbz x0, #0x15665dc
1566360: adrp x24, #0x2f5c000
1566364: adrp x25, #0x2f5d000
1566368: adrp x26, #0x2f5d000
156636c: adrp x27, #0x2f5b000
1566370: ldr x24, [x24, #0x140]
1566374: ldr x25, [x25, #0x360]
1566378: ldr x26, [x26, #0xd0]
156637c: ldr x27, [x27, #0x570]
1566380: ldr x8, [x19]
1566384: ldr x1, [x24]
1566388: ldrh w9, [x8, #0x12e]
156638c: cbz x9, #0x15663b0
1566390: ldr x10, [x8, #0xb0]
1566394: add x10, x10, #8
1566398: ldur x11, [x10, #-8]
156639c: cmp x11, x1
15663a0: b.eq #0x15663c0
15663a4: subs x9, x9, #1
15663a8: add x10, x10, #0x10
15663ac: b.ne #0x1566398
15663b0: mov x0, x19
15663b4: mov w2, wzr
15663b8: bl #0x1332890
15663bc: b #0x15663cc
15663c0: ldrsw x9, [x10]
15663c4: add x8, x8, x9, lsl #4
15663c8: add x0, x8, #0x138
15663cc: ldp x8, x1, [x0]
15663d0: mov x0, x19
15663d4: blr x8
15663d8: tbz w0, #0, #0x156654c
15663dc: ldr x8, [x19]
15663e0: ldr x1, [x25]
15663e4: ldrh w9, [x8, #0x12e]
15663e8: cbz x9, #0x156640c
15663ec: ldr x10, [x8, #0xb0]
15663f0: add x10, x10, #8
15663f4: ldur x11, [x10, #-8]
15663f8: cmp x11, x1
15663fc: b.eq #0x156641c
1566400: subs x9, x9, #1
1566404: add x10, x10, #0x10
1566408: b.ne #0x15663f4
156640c: mov x0, x19
1566410: mov w2, wzr
1566414: bl #0x1332890
1566418: b #0x1566428
156641c: ldrsw x9, [x10]
1566420: add x8, x8, x9, lsl #4
1566424: add x0, x8, #0x138
1566428: ldp x8, x1, [x0]
156642c: mov x0, x19
1566430: blr x8
1566434: mov x21, x0
1566438: cbz x0, #0x15665cc
156643c: mov x0, x21
1566440: mov x1, xzr
1566444: bl #0x146e04c kairo.unity.ecs.Entity$$get_facility
1566448: cbz x0, #0x15665d0
156644c: ldr x0, [x0, #0x28]
1566450: mov x1, xzr
1566454: bl #0x147e7e0 kairo.unity.ecs.EntityExtension$$IsNullOrDestroyed
1566458: tbnz w0, #0, #0x1566380
156645c: mov x0, x21
1566460: mov x1, xzr
1566464: bl #0x146e04c kairo.unity.ecs.Entity$$get_facility
1566468: cbz x0, #0x15665d4
156646c: mov x1, xzr
1566470: bl #0x14c8b00 ecs.FacilityComponent$$get_isUseCountLocked
1566474: tbnz w0, #0, #0x1566380
1566478: ldr x0, [x26]
156647c: ldr w8, [x0, #0xe0]
1566480: cbnz w8, #0x1566488
1566484: bl #0x12d22a4 il2cpp_method_init
1566488: mov w1, #0x1d
156648c: mov x0, x21
1566490: mov w2, wzr
1566494: mov x3, xzr
1566498: bl #0x166070c parameter.Param$$GetValue
156649c: mov w22, w0
15664a0: ldr x0, [x27]
15664a4: ldr w8, [x0, #0xe0]
15664a8: cbnz w8, #0x15664b0
15664ac: bl #0x12d22a4 il2cpp_method_init
15664b0: mov w0, #3
15664b4: mov w1, w22
15664b8: mov x2, xzr
15664bc: bl #0x16657c8 main.AppData$$ClampMax
15664c0: mov w22, w0
15664c4: cmp w0, #1
15664c8: mov w28, w0
15664cc: b.lt #0x1566380
15664d0: mov x0, x20
15664d4: mov x1, x21
15664d8: bl #0x1565f14 ecs.EnemyBaseSystem$$CreateMonster
15664dc: subs w28, w28, #1
15664e0: b.ne #0x15664d0
15664e4: ldr x0, [x26]
15664e8: ldr w8, [x0, #0xe0]
15664ec: cbnz w8, #0x15664f4
15664f0: bl #0x12d22a4 il2cpp_method_init
15664f4: mov w1, #0x1d
15664f8: mov x0, x21
15664fc: mov w2, w22
1566500: mov x3, xzr
1566504: bl #0x1660ef8 parameter.Param$$SubValue
1566508: mov w1, #0x1d
156650c: mov x0, x21
1566510: mov w2, wzr
1566514: mov x3, xzr
1566518: bl #0x166070c parameter.Param$$GetValue
156651c: tbz w0, #0x1f, #0x1566380
1566520: ldr x0, [x26]
1566524: ldr w8, [x0, #0xe0]
1566528: cbnz w8, #0x1566530
156652c: bl #0x12d22a4 il2cpp_method_init
1566530: mov w1, #0x1d
1566534: mov x0, x21
1566538: mov w2, wzr
156653c: mov w3, wzr
1566540: mov x4, xzr
1566544: bl #0x1660ccc parameter.Param$$SetValue
1566548: b #0x1566380
156654c: mov x21, xzr
1566550: cbz x19, #0x15665ac
1566554: ldr x8, [x19]
1566558: ldr x1, [x23]
156655c: ldrh w9, [x8, #0x12e]
1566560: cbz x9, #0x1566584
1566564: ldr x10, [x8, #0xb0]
1566568: add x10, x10, #8
156656c: ldur x11, [x10, #-8]
1566570: cmp x11, x1
1566574: b.eq #0x1566594
1566578: subs x9, x9, #1
156657c: add x10, x10, #0x10
1566580: b.ne #0x156656c
1566584: mov x0, x19
1566588: mov w2, wzr
156658c: bl #0x1332890
1566590: b #0x15665a0
1566594: ldrsw x9, [x10]
1566598: add x8, x8, x9, lsl #4
156659c: add x0, x8, #0x138
15665a0: ldp x8, x1, [x0]
15665a4: mov x0, x19
15665a8: blr x8
15665ac: cbnz x21, #0x15665e0
15665b0: ldp x20, x19, [sp, #0x50]
15665b4: ldp x22, x21, [sp, #0x40]
15665b8: ldp x24, x23, [sp, #0x30]
15665bc: ldp x26, x25, [sp, #0x20]
15665c0: ldp x28, x27, [sp, #0x10]
15665c4: ldr x30, [sp], #0x60
15665c8: ret
