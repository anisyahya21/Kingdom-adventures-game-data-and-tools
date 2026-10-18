1535118: str x30, [sp, #-0x10]!
153511c: ldr x9, [x0, #0x20]
1535120: cbz x9, #0x1535140
1535124: ldp w8, w9, [x9, #0x10]
1535128: and w3, w1, #1
153512c: and w4, w2, #1
1535130: mov w1, w8
1535134: mov w2, w9
1535138: ldr x30, [sp], #0x10
153513c: b #0x1536478 ecs.DispatchAreaSelectSystem$$CheckDispatch
1535140: bl #0x12d23c8
