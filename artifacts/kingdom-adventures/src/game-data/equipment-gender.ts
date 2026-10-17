/** EquipData.FLAG_FOR_WOMEN from the recovered native declaration; gender 0 male, 1 female. */
export const EQUIPMENT_FLAG_FOR_WOMEN = 1024;

export function equipmentAllowedForGender(flags: number, gender?: number): boolean {
  return (flags & EQUIPMENT_FLAG_FOR_WOMEN) === 0 || gender === 1;
}
