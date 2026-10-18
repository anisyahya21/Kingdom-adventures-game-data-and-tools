15362e0: str x30, [sp, #-0x20]!
15362e4: stp x20, x19, [sp, #0x10]
15362e8: cbz x0, #0x1536374
15362ec: mov x1, xzr
15362f0: mov x20, x0
15362f4: bl #0x146edf4 kairo.unity.ecs.Entity$$get_human
15362f8: cbz x0, #0x1536374
15362fc: mov x1, xzr
1536300: bl #0x14caa70 ecs.HumanComponent$$get_job
1536304: cbz x0, #0x1536374
1536308: ldr w19, [x0, #0xa4]
153630c: mov x0, x20
1536310: mov x1, xzr
1536314: bl #0x1472554 kairo.unity.ecs.Entity$$get_hasSkill
1536318: tbz w0, #0, #0x1536364
153631c: mov x0, x20
1536320: mov x1, xzr
1536324: bl #0x14724cc kairo.unity.ecs.Entity$$get_skill
1536328: cbz x0, #0x1536374
153632c: mov w1, #0x23
1536330: mov x2, xzr
1536334: bl #0x14d1670 ecs.SkillComponent$$HasSkillTypeOf
1536338: tbz w0, #0, #0x1536364
153633c: mov x0, x20
1536340: mov x1, xzr
1536344: bl #0x14724cc kairo.unity.ecs.Entity$$get_skill
1536348: cbz x0, #0x1536374
153634c: mov w1, #0x23
1536350: mov x2, xzr
1536354: bl #0x14d1490 ecs.SkillComponent$$SearchSkillTypeOf
1536358: cbz x0, #0x1536374
153635c: ldr w8, [x0, #0x30]
1536360: add w19, w8, w19
1536364: mov w0, w19
1536368: ldp x20, x19, [sp, #0x10]
153636c: ldr x30, [sp], #0x20
1536370: ret
1536374: bl #0x12d23c8
