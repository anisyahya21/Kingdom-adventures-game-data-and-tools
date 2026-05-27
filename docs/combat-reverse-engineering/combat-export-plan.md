# Combat Export Plan

## Scope

This export plan is focused on native combat logic in Kingdom Adventures.
It prioritizes damage, hit/miss, critical, skill execution, targeting, and status mechanics.

## Primary seeds

The primary seed set is chosen from `BattleHelper` and `SkillSystem` functions discovered in the IL2CPP decompilation.
The goal is to capture the core damage/hit formula and the combat execution path.

- `BattleHelper.CalcAttackIntervalFrame(int agility)` — attack/timing interval logic.
- `BattleHelper.CalcDamage(int attackerAttack, int receiverDefense)` — raw damage formula.
- `BattleHelper.CalcHitRate(int attackerDexterity, int receiverAgility, int receiverLuck)` — hit-chance formula.
- `BattleHelper.CalcEvasion(int agility, int luck)` — evasion formula.
- `BattleHelper.CalcCriticalRate(int luck)` — critical-rate formula.
- `BattleHelper.Attack(model.conquest.GameObject attacker, model.conquest.GameObject receiver, AttackType type)` — attack execution path.
- `BattleHelper.Attack(Entity attacker, Entity receiver, SkillData skill)` — entity-based attack execution.
- `BattleHelper.CalcDamage(bool critical, Entity attacker, Entity receiver, AttackType type)` — full damage application.
- `BattleHelper.LotHit(Entity attacker, Entity receiver)` — hit/dodge roll.
- `BattleHelper.LotCritical(Entity attacker)` — critical roll.
- `BattleHelper.Cure(Entity healer, Entity receiver, SkillData skill)` — healing/resurrection.
- `BattleHelper.Buff(Entity user, Entity opponent, SkillData skill)` — buff/debuff application.

## Secondary seeds

These are support seeds for skill selection, targeting, and battle-specific behavior.

- `SkillSystem.GetEnemyInSkillRange(Entity user, SkillData skill, Func<Entity, bool> predicate)`
- `SkillSystem.GetAllyInSkillRange(Entity user, SkillData skill, Func<Entity, bool> predicate)`
- `SkillSystem.ChooseSkillCandidates(Entity user)`
- `SkillSystem.DecideToUseSkill(SkillInfo skill)`
- `SkillSystem.ChooseSkillByInvocationLevel(List<SkillTarget> skills)`
- `SkillSystem.GetInvocationRate(SkillInfo skill)`
- `BattleHelper.DamageEntitiesOnCell(int xi, int yi, Entity attacker, SkillData skill)`
- `BattleHelper.BuffEntitiesOnCell(int xi, int yi, Entity user, SkillData skill)`
- `BattleHelper.ProcessProjectileImpact(Entity e, bool enabledAttackToHuman)`
- `BattleHelper.ProcessAttackEffect(AttackResult<Entity> r)`

## Rejected candidates for this initial export pass

Excluded from the first native seed set because they are either high-level wrappers, UI/score systems, or non-core combat flow:

- `BattleSystem` and `BattleScoreSystem` — likely wrapper/update/display systems.
- `PvPBattleSystem` — specialized mode, not core formula discovery.
- `EnemyBaseSystem` — dungeon/attack enemy generation logic rather than combat formulas.
- `MonsterSystem` — monster farm and data management.
- `ExpeditionBattleSystem` — expedition UI/flow and non-core combat logic.
- `BattleForm`, `BattleLog`, `MonsterInfoBar` — UI/presentation.
- `AttackComponent`, `SkillComponent`, `EnemyComponent` ECS types alone — structural data only.

## Justification

- `BattleHelper` contains direct formula and execution methods and is the cleanest entry point for native combat logic.
- `SkillSystem` is the right secondary target because combat skill selection is functionally tied to attack resolution.
- The exported graph should remain controlled: direct callers, direct callees, and callees-of-callees up to depth 2.
- This plan avoids broad engine/system wrappers until the core formulas and target selection are confirmed.

## Export target

- Generate `tools/asset_extractor/ghidra_scripts/ExportCombatSubsystem.java`.
- Output to `Reverse engineering/combat-exports/depth1` by default.
- Produce `seed_resolution.tsv`, `index.tsv`, `callgraph_edges.tsv`, `relevance_notes.tsv`, and `strings.tsv`.
- Do not run the export until this plan has been reviewed.
