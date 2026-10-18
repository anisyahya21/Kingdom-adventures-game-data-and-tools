15682c4: str x30, [sp, #-0x50]!
15682c8: stp x26, x25, [sp, #0x10]
15682cc: stp x24, x23, [sp, #0x20]
15682d0: stp x22, x21, [sp, #0x30]
15682d4: stp x20, x19, [sp, #0x40]
15682d8: adrp x21, #0x316b000
15682dc: ldrb w8, [x21, #0x13a]
15682e0: mov w20, w2
15682e4: mov x19, x0
15682e8: tbnz w8, #0, #0x156833c
15682ec: adrp x0, #0x2f5f000
15682f0: ldr x0, [x0, #0x980]
15682f4: bl #0x12d21a0 il2cpp_class_init
15682f8: adrp x0, #0x2f5c000
15682fc: ldr x0, [x0, #0x138]
1568300: bl #0x12d21a0 il2cpp_class_init
1568304: adrp x0, #0x2f5d000
1568308: ldr x0, [x0, #0x358]
156830c: bl #0x12d21a0 il2cpp_class_init
1568310: adrp x0, #0x2f5d000
1568314: ldr x0, [x0, #0x360]
1568318: bl #0x12d21a0 il2cpp_class_init
156831c: adrp x0, #0x2f5c000
1568320: ldr x0, [x0, #0x140]
1568324: bl #0x12d21a0 il2cpp_class_init
1568328: adrp x0, #0x2f5d000
156832c: ldr x0, [x0, #0xd0]
1568330: bl #0x12d21a0 il2cpp_class_init
1568334: mov w8, #1
1568338: strb w8, [x21, #0x13a]
156833c: cmp w20, #0x14
1568340: b.ne #0x1568574
1568344: mov x0, x19
1568348: bl #0x1563cbc ecs.EnemyBaseSystem$$get_enemyGenerators
156834c: cbz x0, #0x1568618
1568350: adrp x10, #0x2f5d000
1568354: ldr x8, [x0]
1568358: ldr x10, [x10, #0x358]
156835c: mov x21, x0
1568360: ldrh w9, [x8, #0x12e]
1568364: ldr x1, [x10]
1568368: cbz x9, #0x156838c
156836c: ldr x10, [x8, #0xb0]
1568370: add x10, x10, #8
1568374: ldur x11, [x10, #-8]
1568378: cmp x11, x1
156837c: b.eq #0x156839c
1568380: subs x9, x9, #1
1568384: add x10, x10, #0x10
1568388: b.ne #0x1568374
156838c: mov x0, x21
1568390: mov w2, wzr
1568394: bl #0x1332890
1568398: b #0x15683a8
156839c: ldrsw x9, [x10]
15683a0: add x8, x8, x9, lsl #4
15683a4: add x0, x8, #0x138
15683a8: ldp x8, x1, [x0]
15683ac: mov x0, x21
15683b0: blr x8
15683b4: mov x21, x0
15683b8: cbz x0, #0x156861c
15683bc: adrp x24, #0x2f5c000
15683c0: adrp x25, #0x2f5d000
15683c4: adrp x26, #0x2f5d000
15683c8: ldr x24, [x24, #0x140]
15683cc: ldr x25, [x25, #0x360]
15683d0: ldr x26, [x26, #0xd0]
15683d4: ldr x8, [x21]
15683d8: ldr x1, [x24]
15683dc: ldrh w9, [x8, #0x12e]
15683e0: cbz x9, #0x1568404
15683e4: ldr x10, [x8, #0xb0]
15683e8: add x10, x10, #8
15683ec: ldur x11, [x10, #-8]
15683f0: cmp x11, x1
15683f4: b.eq #0x1568414
15683f8: subs x9, x9, #1
15683fc: add x10, x10, #0x10
1568400: b.ne #0x15683ec
1568404: mov x0, x21
1568408: mov w2, wzr
156840c: bl #0x1332890
1568410: b #0x1568420
1568414: ldrsw x9, [x10]
1568418: add x8, x8, x9, lsl #4
156841c: add x0, x8, #0x138
1568420: ldp x8, x1, [x0]
1568424: mov x0, x21
1568428: blr x8
156842c: tbz w0, #0, #0x1568508
1568430: ldr x8, [x21]
1568434: ldr x1, [x25]
1568438: ldrh w9, [x8, #0x12e]
156843c: cbz x9, #0x1568460
1568440: ldr x10, [x8, #0xb0]
1568444: add x10, x10, #8
1568448: ldur x11, [x10, #-8]
156844c: cmp x11, x1
1568450: b.eq #0x1568470
1568454: subs x9, x9, #1
1568458: add x10, x10, #0x10
156845c: b.ne #0x1568448
1568460: mov x0, x21
1568464: mov w2, wzr
1568468: bl #0x1332890
156846c: b #0x156847c
1568470: ldrsw x9, [x10]
1568474: add x8, x8, x9, lsl #4
1568478: add x0, x8, #0x138
156847c: ldp x8, x1, [x0]
1568480: mov x0, x21
1568484: blr x8
1568488: mov x22, x0
156848c: cbz x0, #0x1568610
1568490: mov x0, x22
1568494: mov x1, xzr
1568498: bl #0x146e04c kairo.unity.ecs.Entity$$get_facility
156849c: cbz x0, #0x1568614
15684a0: mov x1, xzr
15684a4: bl #0x14c8660 ecs.FacilityComponent$$get_data
15684a8: mov x23, x0
15684ac: mov x0, x22
15684b0: mov x1, xzr
15684b4: bl #0x146e04c kairo.unity.ecs.Entity$$get_facility
15684b8: cbz x0, #0x1568608
15684bc: mov x1, xzr
15684c0: bl #0x14c8944 ecs.FacilityComponent$$get_limitLevel
15684c4: mov w1, w0
15684c8: cbz x23, #0x156860c
15684cc: mov x0, x23
15684d0: mov x2, xzr
15684d4: bl #0x16232a0 data.FacilityData$$GetProductCapacity
15684d8: mov w23, w0
15684dc: ldr x0, [x26]
15684e0: ldr w8, [x0, #0xe0]
15684e4: cbnz w8, #0x15684ec
15684e8: bl #0x12d22a4 il2cpp_method_init
15684ec: mov w1, #0x1d
15684f0: mov x0, x22
15684f4: mov w2, w23
15684f8: mov w3, wzr
15684fc: mov x4, xzr
1568500: bl #0x1660ccc parameter.Param$$SetValue
1568504: b #0x15683d4
1568508: mov x22, xzr
156850c: cbz x21, #0x1568570
1568510: adrp x10, #0x2f5c000
1568514: ldr x8, [x21]
1568518: ldr x10, [x10, #0x138]
156851c: ldrh w9, [x8, #0x12e]
1568520: ldr x1, [x10]
1568524: cbz x9, #0x1568548
1568528: ldr x10, [x8, #0xb0]
156852c: add x10, x10, #8
1568530: ldur x11, [x10, #-8]
1568534: cmp x11, x1
1568538: b.eq #0x1568558
156853c: subs x9, x9, #1
1568540: add x10, x10, #0x10
1568544: b.ne #0x1568530
1568548: mov x0, x21
156854c: mov w2, wzr
1568550: bl #0x1332890
1568554: b #0x1568564
1568558: ldrsw x9, [x10]
156855c: add x8, x8, x9, lsl #4
1568560: add x0, x8, #0x138
1568564: ldp x8, x1, [x0]
1568568: mov x0, x21
156856c: blr x8
1568570: cbnz x22, #0x1568620
1568574: adrp x21, #0x2f5f000
1568578: ldr x21, [x21, #0x980]
156857c: ldr x0, [x21]
1568580: ldr w8, [x0, #0xe0]
1568584: cbnz w8, #0x1568590
1568588: bl #0x12d22a4 il2cpp_method_init
156858c: ldr x0, [x21]
1568590: ldr x8, [x0, #0xb8]
1568594: ldr x0, [x8]
1568598: cbz x0, #0x1568618
156859c: mov x1, xzr
15685a0: bl #0x167dc90 main.AppData$$IsNight
15685a4: tbz w0, #0, #0x15685d4
15685a8: mov x0, x19
15685ac: bl #0x1566268 ecs.EnemyBaseSystem$$GenerateMonsterFromEnemyGenerators
15685b0: mov w8, #0xaaab
15685b4: mov w9, #0xaaaa
15685b8: movk w8, #0xaaaa, lsl #16
15685bc: movk w9, #0x2aaa, lsl #16
15685c0: madd w8, w20, w8, w9
15685c4: mov w9, #0x5554
15685c8: movk w9, #0x5555, lsl #16
15685cc: cmp w8, w9
15685d0: b.ls #0x15685ec
15685d4: ldp x20, x19, [sp, #0x40]
15685d8: ldp x22, x21, [sp, #0x30]
15685dc: ldp x24, x23, [sp, #0x20]
15685e0: ldp x26, x25, [sp, #0x10]
15685e4: ldr x30, [sp], #0x50
15685e8: ret
