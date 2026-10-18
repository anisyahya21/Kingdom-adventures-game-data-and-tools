1536478: str x30, [sp, #-0x40]!
153647c: stp x24, x23, [sp, #0x10]
1536480: stp x22, x21, [sp, #0x20]
1536484: stp x20, x19, [sp, #0x30]
1536488: adrp x24, #0x316a000
153648c: ldrb w8, [x24, #0xfd6]
1536490: mov w19, w4
1536494: mov w22, w3
1536498: mov w20, w2
153649c: mov w21, w1
15364a0: mov x23, x0
15364a4: tbnz w8, #0, #0x1536510
15364a8: adrp x0, #0x2f5b000
15364ac: ldr x0, [x0, #0x8a0]
15364b0: bl #0x12d21a0
15364b4: adrp x0, #0x2f5f000
15364b8: ldr x0, [x0, #0xb68]
15364bc: bl #0x12d21a0
15364c0: adrp x0, #0x2f5c000
15364c4: ldr x0, [x0, #0xb38]
15364c8: bl #0x12d21a0
15364cc: adrp x0, #0x2f5d000
15364d0: ldr x0, [x0, #0x4b8]
15364d4: bl #0x12d21a0
15364d8: adrp x0, #0x2f5f000
15364dc: ldr x0, [x0, #0xec8]
15364e0: bl #0x12d21a0
15364e4: adrp x0, #0x2f5d000
15364e8: ldr x0, [x0, #0x4c8]
15364ec: bl #0x12d21a0
15364f0: adrp x0, #0x2f63000
15364f4: ldr x0, [x0, #0x3b0]
15364f8: bl #0x12d21a0
15364fc: adrp x0, #0x2f5b000
1536500: ldr x0, [x0, #0xb8]
1536504: bl #0x12d21a0
1536508: mov w8, #1
153650c: strb w8, [x24, #0xfd6]
1536510: ldr x0, [x23, #0x10]
1536514: cbz x0, #0x15366d0
1536518: adrp x24, #0x2f5f000
153651c: ldr x24, [x24, #0xb68]
1536520: mov x1, xzr
1536524: bl #0x1475b3c kairo.unity.ecs.World$$get_map
1536528: ldr x8, [x24]
153652c: mov x24, x0
1536530: ldr w9, [x8, #0xe0]
1536534: cbnz w9, #0x1536540
1536538: mov x0, x8
153653c: bl #0x12d22a4
1536540: mov w3, #1
1536544: mov x0, x24
1536548: mov w1, w21
153654c: mov w2, w20
1536550: mov x4, xzr
1536554: bl #0x15afd9c ecs.MapSystem$$GetMapChip
1536558: mov x1, xzr
153655c: mov x24, x0
1536560: bl #0x147e7e0 kairo.unity.ecs.EntityExtension$$IsNullOrDestroyed
1536564: tbnz w0, #0, #0x15365c8
1536568: ldr x0, [x23, #0x10]
153656c: cbz x0, #0x15366d0
1536570: adrp x8, #0x2f5f000
1536574: ldr x8, [x8, #0xec8]
1536578: ldr x1, [x8]
153657c: bl #0x191de04 kairo.unity.ecs.World$$GetSystem<object>
1536580: cbz x0, #0x15366d0
1536584: mov w1, w21
1536588: mov w2, w20
153658c: mov x3, xzr
1536590: bl #0x15ed7b4 ecs.TerritorySystem$$IsOutOfTerritory
1536594: tbnz w0, #0, #0x15365c8
1536598: ldr x0, [x23, #0x10]
153659c: cbz x0, #0x15366d0
15365a0: adrp x8, #0x2f5d000
15365a4: ldr x8, [x8, #0x4c8]
15365a8: ldr x1, [x8]
15365ac: bl #0x191de04 kairo.unity.ecs.World$$GetSystem<object>
15365b0: cbz x0, #0x15366d0
15365b4: mov w1, w21
15365b8: mov w2, w20
15365bc: mov x3, xzr
15365c0: bl #0x15febc0 ecs.TownSystem$$IsTownTerritory
15365c4: tbz w0, #0, #0x15365e0
15365c8: mov w0, wzr
15365cc: ldp x20, x19, [sp, #0x30]
15365d0: ldp x22, x21, [sp, #0x20]
15365d4: ldp x24, x23, [sp, #0x10]
15365d8: ldr x30, [sp], #0x40
15365dc: ret
15365e0: cbz x24, #0x15366d0
15365e4: mov x0, x24
15365e8: mov x1, xzr
15365ec: bl #0x146fcd8 kairo.unity.ecs.Entity$$get_mapChip
15365f0: cbz x0, #0x15366d0
15365f4: mov x1, xzr
15365f8: bl #0x14cca04 ecs.MapChipComponent$$get_data
15365fc: cbz x0, #0x15366d0
1536600: ldp w9, w8, [x0, #0x20]
1536604: cmp w9, #0x11
1536608: b.ne #0x1536618
153660c: cmp w8, #0x22
1536610: cset w0, eq
1536614: b #0x15365cc
1536618: cmp w8, #7
153661c: cset w0, ne
1536620: b.eq #0x15365cc
1536624: tbz w22, #0, #0x15365cc
1536628: ldr x0, [x23, #0x10]
153662c: cbz x0, #0x15366d0
1536630: adrp x8, #0x2f5d000
1536634: ldr x8, [x8, #0x4b8]
1536638: ldr x1, [x8]
153663c: bl #0x191de04 kairo.unity.ecs.World$$GetSystem<object>
1536640: cbz x0, #0x15366d0
1536644: mov w1, w21
1536648: mov w2, w20
153664c: mov x3, xzr
1536650: bl #0x15e7ae0 ecs.SurveySystem$$SearchSurvey
1536654: cmp x0, #0
1536658: mov x8, x0
153665c: cset w0, eq
1536660: cbz x8, #0x15365cc
1536664: tbz w19, #0, #0x15365cc
1536668: adrp x8, #0x2f5b000
153666c: ldr x8, [x8, #0x8a0]
1536670: ldr x0, [x8]
1536674: ldr w8, [x0, #0xe0]
1536678: cbnz w8, #0x1536680
153667c: bl #0x12d22a4
1536680: adrp x8, #0x2f63000
1536684: adrp x9, #0x2f5b000
1536688: ldr x8, [x8, #0x3b0]
153668c: ldr x9, [x9, #0xb8]
1536690: mov x2, xzr
1536694: ldr x0, [x8]
1536698: ldr x1, [x9]
153669c: bl #0x22be668 kairo.unity.util.Language$$LT
15366a0: adrp x8, #0x2f5c000
15366a4: ldr x8, [x8, #0xb38]
15366a8: mov x19, x0
15366ac: ldr x8, [x8]
15366b0: ldr w9, [x8, #0xe0]
15366b4: cbnz w9, #0x15366c0
15366b8: mov x0, x8
15366bc: bl #0x12d22a4
15366c0: mov x0, x19
15366c4: mov x1, xzr
15366c8: bl #0x16993d4 game.ui.Toast$$Add
15366cc: b #0x15365c8
15366d0: bl #0x12d23c8
