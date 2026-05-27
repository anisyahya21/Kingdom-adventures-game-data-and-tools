# Combat System Master Findings

## Stage 1: Initial discovery

Source evidence:
- `tools/asset_extractor/il2cpp_dump/decompiled_Assembly-CSharp/Assembly-CSharp.decompiled.cs`
- Decompiled code includes `Address(RVA = "...")` metadata for exact native offsets.

Key findings:

- `model.battle.BattleHelper` is the strongest combat subsystem candidate.
  - `CalcAttackIntervalFrame(int agility)` — attack timing from agility.
  - `CalcDamage(int attackerAttack, int receiverDefense)` — raw damage formula.
  - `CalcHitRate(int attackerDexterity, int receiverAgility, int receiverLuck)` — hit chance.
  - `CalcEvasion(int agility, int luck)` — evasion formula.
  - `CalcCriticalRate(int luck)` / `LotCritical(...)` — critical chance.
  - `Attack(...)` overloads for game objects and entities.
  - `CalcDamage(bool critical, Entity attacker, Entity receiver, AttackType type)` — damage scale with critical and attack type.
  - `Cure(Entity healer, Entity receiver, SkillData skill)` — healing/resurrection.
  - `Buff(Entity user, Entity opponent, SkillData skill)` — buff/debuff application.
  - `DamageEntitiesOnCell`, `BuffEntitiesOnCell`, `ProcessProjectileImpact`, `ProcessAttackEffect` — AoE/projectile/effect hooks.

- `SkillSystem` contains combat skill selection and targeting logic.
  - `GetEnemyInSkillRange(...)`, `GetAllyInSkillRange(...)`
  - `ChooseSkillCandidates(Entity user)`
  - `DecideToUseSkill(SkillInfo skill)`
  - `ChooseSkillByInvocationLevel(List<SkillTarget> skills)`

- `SkillData` contains explicit battle-related skill categories and flags:
  - `TYPE_MAGIC`, `TYPE_LONG_RANGE_ATTACK`, `TYPE_POISON_ATTACK`, `TYPE_REFLECTION`, `TYPE_CONTINUITY_ATTACK`, `TYPE_COUNTER`, `TYPE_HALF_DAMAGE`, `TYPE_EVATION_UP`, `TYPE_CRITICAL_UP`, `TYPE_PERFECT_DEFENCE`, `TYPE_ALL_ATTACK`, `TYPE_LINE_ATTACK`, `TYPE_RANGE_ATTACK`, `TYPE_SLEEP`, `TYPE_DEFENSE_DOWN`, etc.
  - `FLAG_FOR_BATTLE` and `FLAG_OPPONENT_APPOINT` are battle-specific.

- `BattlerComponent` holds core stat fields.
  - `maxHp`, `hp`, `maxMp`, `mp`, `attack`, `defense`, `agility`, `dexterity`, `luck`, `attackGauge`, `state`, `teamId`.

- `SkillInfo`, `SkillTarget`, `AttackResult<T>`, and `CureResult<T>` are combat data structures used by the battle engine.

## Combat discovery table

| Class | Method / Member | RVA | Likely responsibility | Confidence | Reason relevant | Export? |
|---|---|---|---|---|---|---|
| `model.battle.BattleHelper` | `CalcAttackIntervalFrame(int agility)` | `0x168C380` | Attack timing / turn interval | high | direct combat formula in helper class | yes |
| `model.battle.BattleHelper` | `CalcDamage(int attackerAttack, int receiverDefense)` | `0x168C460` | Raw damage formula | high | direct damage formula in helper class | yes |
| `model.battle.BattleHelper` | `CalcHitRate(int attackerDexterity, int receiverAgility, int receiverLuck)` | `0x168C588` | Hit-chance formula | high | core hit/miss logic | yes |
| `model.battle.BattleHelper` | `CalcEvasion(int agility, int luck)` | `0x168C62C` | Evasion formula | high | core miss/avoidance helper | yes |
| `model.battle.BattleHelper` | `CalcCriticalRate(int luck)` | `0x168C65C` | Critical chance formula | high | critical roll helper | yes |
| `model.battle.BattleHelper` | `Attack(model.conquest.GameObject attacker, model.conquest.GameObject receiver, AttackType type)` | `0x168C7F4` | Raw attack execution | high | direct attack execution path | yes |
| `model.battle.BattleHelper` | `Attack(Entity attacker, Entity receiver, SkillData skill)` | `0x168D1E8` | Skill-aware attack execution | high | core attack method for entity combat | yes |
| `model.battle.BattleHelper` | `CalcDamage(bool critical, Entity attacker, Entity receiver, AttackType type)` | `0x168CF80` | Damage calculation with critical and attack type | high | direct full damage formula | yes |
| `model.battle.BattleHelper` | `LotHit(Entity attacker, Entity receiver)` | `0x168CDE4` | Hit roll resolution | high | connects hit formula to attack result | yes |
| `model.battle.BattleHelper` | `LotCritical(Entity attacker)` | `0x168CC54` | Critical roll resolution | high | connects crit formula to attack result | yes |
| `model.battle.BattleHelper` | `Cure(Entity healer, Entity receiver, SkillData skill)` | `0x168E3C4` | Healing/resurrection skill effect | high | direct skill effect method | yes |
| `model.battle.BattleHelper` | `Buff(Entity user, Entity opponent, SkillData skill)` | `0x168E49C` | Buff/debuff application | high | direct status/skill effect method | yes |
| `model.battle.BattleHelper` | `DamageEntitiesOnCell(int xi, int yi, Entity attacker, SkillData skill)` | `0x168EBFC` | Area damage / cell impact | medium | AoE/projectile support | secondary |
| `model.battle.BattleHelper` | `ProcessProjectileImpact(Entity e, bool enabledAttackToHuman)` | `0x168F034` | Projectile impact logic | medium | projectile/effect hook | secondary |
| `model.battle.BattleHelper` | `ProcessAttackEffect(AttackResult<Entity> r)` | `0x168F480` | Attack result effect processing | medium | result handling wrapper | secondary |
| `SkillSystem` | `GetEnemyInSkillRange(Entity user, SkillData skill, Func<Entity, bool> predicate)` | `0x15DEB6C` | Skill targeting / range selection | high | key skill targeting helper | yes |
| `SkillSystem` | `GetAllyInSkillRange(Entity user, SkillData skill, Func<Entity, bool> predicate)` | `0x15DEB68` | Ally targeting / range selection | high | key skill targeting helper | yes |
| `SkillSystem` | `ChooseSkillCandidates(Entity user)` | `0x15E002C` | Skill candidate selection | high | skill decision entry point | yes |
| `SkillSystem` | `DecideToUseSkill(SkillInfo skill)` | `0x15E03D8` | Skill usage decision | high | AI/stat-based skill selection | yes |
| `SkillSystem` | `ChooseSkillByInvocationLevel(List<SkillTarget> skills)` | `0x15E0498` | Skill priority selection | high | choose skill based on invocation level | yes |
| `SkillSystem` | `GetInvocationRate(SkillInfo skill)` | `0x15DFF08` | Skill invocation weight | high | AI selection support | yes |
| `SkillData` | battle-related constants | n/a | skill category / type definitions | high | skill metadata and battle flags | passive |
| `BattlerComponent` | stat fields | n/a | entity combat stats | high | core combat stat container | passive |

## Notes

- The table lists only combat-relevant candidates from the IL2CPP decompiled assembly.
- Fields and data structures are marked passive because they are evidence sources, not export seeds.
- `BattleSystem`, `PvPBattleSystem`, and UI classes are omitted from this first export pass because they appear to be higher-level wrappers.
- This discovery phase is intentionally limited to game-extracted native evidence.
- Website code has not been used as proof; it may only serve later as comparison.
- No exports have been generated yet.

## Next stage

- Use the planned seed list and the new `ExportCombatSubsystem.java` script to resolve combat-native functions.
- After the script runs, inspect `seed_resolution.tsv`, `index.tsv`, `callgraph_edges.tsv`, and exported `.c`/`.s` files.
- Then classify functions and begin extracting actual formulas and rules.
