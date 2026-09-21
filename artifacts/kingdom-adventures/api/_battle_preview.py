"""Formation preview projection for `ka-battle-preview-1` (transport helper, no combat).

The preview transport answers "what formation would the authoritative runner set up?" without ever
running a fight. It calls exactly the two preparation stages the replay export calls before
`combat_sandbox.run_scenario`:

    combat_scenario.load_scenario -> combat_setup.prepare_setup

and projects their own values: prepared cells/columns/rows/grids, effective parameter values and
maxima, the ordered encounter roster and the declared household pets. `run_scenario` /
`export_replay` are never imported here, so no replay, entity id, RNG draw or event trace can leak
into a preview (a preview that fought would no longer be a preview).

Nothing in this module invents game facts:

  * ally cells and effective stats come from `prepare_setup` output, unchanged;
  * enemy cells and parameters come from the recovered encounter baseline inside that same output;
  * pets are the loader-materialized house pets, still bound to their `petOwnerName` owner;
  * pet capacity is left `null`. The recovered native enumeration appends every ally monster of the
    owner with NO count cap, and no verified household/battle capacity has been recovered, so a
    number here would be invented. The unverified capacity is reported as a diagnostic instead.

The helper deliberately imports the packaged runtime modules lazily (inside `build_preview`), so
importing this file can never break the transport's other envelopes.
"""

PREVIEW_SCHEMA = 'ka-battle-preview-1'
SCENARIO_SCHEMA = 'ka-special-combat-research-1'

# Native pet enumeration has no count cap; no verified capacity exists in the recovered evidence.
PET_CAPACITY_DIAGNOSTIC = dict(
    code='pet-capacity-unverified',
    message='The current backend does not expose a confirmed household capacity, so maxPets is null. '
            'Attached pets and placement are passed through the existing preparation pipeline.')


def _parameters(rows):
    """Parameter map keyed by string id, exposing the same effective pair the replay exposes."""
    return {str(pid): dict(effectiveValue=row['value'] if 'value' in row else row['rawValue'],
                           effectiveMaximum=row['maximum'] if 'maximum' in row else row['rawMax'])
            for pid, row in sorted(rows.items(), key=lambda item: int(item[0]))}


def build_units(normalized, setup):
    """Allies (selected roster, then their owner-bound pets) followed by the encounter roster."""
    units = []
    for index, (source, prepared) in enumerate(zip(normalized['ownUnits'], setup['ownUnits'],
                                                   strict=True)):
        unit = dict(unitId=f'ally:{index}', name=source['name'], side='ally', rosterIndex=index,
                    kind='human' if source['human'] else 'monster',
                    cell=list(prepared['cell']),
                    parameters=_parameters(prepared['effectiveParameters']))
        if source.get('petOwnerName') is not None:
            unit['petOwnerName'] = source['petOwnerName']
        units.append(unit)
    for index, fighter in enumerate(setup['encounter']['fighters']):
        units.append(dict(
            unitId=f'enemy:{index}', name=f"enemy:{fighter['incomingIndex']}:{fighter['monsterId']}",
            side='enemy', rosterIndex=index, kind='monster', cell=list(fighter['cell']),
            boss=bool(fighter['leaderIdentity']),
            parameters={str(pid): dict(effectiveValue=row['rawValue'],
                                       effectiveMaximum=row['rawMax'])
                        for pid, row in sorted(fighter['parameters'].items(),
                                               key=lambda item: int(item[0]))}))
    return units


def build_pet_limits(normalized):
    """One entry per declared house owner; `maxPets` stays null until a capacity is verified."""
    attached = {}
    for source in normalized['ownUnits']:
        owner = source.get('petOwnerName')
        if owner is not None:
            attached[owner] = attached.get(owner, 0) + 1
    owners = []
    for owner in list(normalized.get('householdOwners') or []) + list(attached):
        if owner not in owners:
            owners.append(owner)
    return [dict(owner=owner, maxPets=None, attachedPets=attached.get(owner, 0)) for owner in owners]


def build_preview(scenario):
    """Project `load_scenario`/`prepare_setup` output as `ka-battle-preview-1`. Never fights."""
    from combat_scenario import load_scenario
    from combat_setup import prepare_setup

    normalized = load_scenario(scenario)
    setup = prepare_setup(normalized)
    pet_limits = build_pet_limits(normalized)
    diagnostics = [dict(PET_CAPACITY_DIAGNOSTIC)] if pet_limits else []
    return dict(schema=PREVIEW_SCHEMA, units=build_units(normalized, setup),
                petLimits=pet_limits, diagnostics=diagnostics)
