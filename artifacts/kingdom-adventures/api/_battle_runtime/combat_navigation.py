"""Recovered formation navigation predicates; map occupancy remains explicit."""
from combat_initial_state import i32,trunc_div
from combat_states import is_most_front,is_normal_attack_target


def same_grid(unit,team):
    return any(other is not unit and other['board'][5] not in (2,7,8)
               and other['board'][7]==unit['board'][7] for other in team)


def empty_cell(occupants,has_ai,state):
    return occupants is not None and not any(has_ai(i) and state(i) not in (7,8) for i in occupants)


def queue_position(unit,team,hp,row_offset):
    counts=[sum(hp(other)>0 and i32(other['board'][7]-trunc_div(other['board'][7],5)*5)==column
                for other in team) for column in range(5)]
    column=min(range(5),key=lambda c:counts[c])
    row=counts[column]+1
    y=row_offset+1+row if unit['board'][6]==0 else row_offset-row
    return column*24,y*24


def front_opponent(opponents,exists,hp,state,grid,distance):
    eligible=[i for i in opponents if is_normal_attack_target(exists(i),hp(i),state(i)) and is_most_front(grid(i))]
    return min(eligible,key=distance) if eligible else None
