import { useMemo, useState } from "react";
import { ChevronDown, Dumbbell, ImageOff } from "lucide-react";
import { PageHeader } from "@/components/ka/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getFacilityIconByName, getFurnitureIcon } from "@/lib/equipment-icons";
import { localSharedData } from "@/lib/local-shared-data";
import { parseCsv } from "@/lib/monster-truth";
import facilityLookupCsv from "../../../../data/sheet-research/raw-copies/KA GameData - Facility_lookup.csv?raw";

type FacilityStatName =
  | "HP"
  | "MP"
  | "Vigor"
  | "Attack"
  | "Defence"
  | "Speed"
  | "Luck"
  | "Intelligence"
  | "Dexterity"
  | "Gather"
  | "Move"
  | "Heart";

type TrainingFacility = {
  id: number;
  name: string;
  stats: FacilityStatName[];
};

const STAT_ORDER: FacilityStatName[] = [
  "HP",
  "MP",
  "Vigor",
  "Attack",
  "Defence",
  "Speed",
  "Luck",
  "Intelligence",
  "Dexterity",
  "Gather",
  "Move",
  "Heart",
];

const FACILITY_STAT_HEADERS: Array<{ header: string; stat: FacilityStatName }> = [
  { header: "HP", stat: "HP" },
  { header: "MP", stat: "MP" },
  { header: "Vigor", stat: "Vigor" },
  { header: "Atk", stat: "Attack" },
  { header: "Def", stat: "Defence" },
  { header: "Spd", stat: "Speed" },
  { header: "Luck", stat: "Luck" },
  { header: "Int", stat: "Intelligence" },
  { header: "Dex", stat: "Dexterity" },
  { header: "Gather", stat: "Gather" },
  { header: "Move", stat: "Move" },
  { header: "Heart", stat: "Heart" },
];

function parseIntSafe(value: string | undefined): number {
  if (!value) return 0;
  const parsed = Number.parseInt(value.trim(), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseTrainingFacilities(): TrainingFacility[] {
  const rows = parseCsv(facilityLookupCsv);
  if (rows.length < 2) return [];

  const header = rows[0] ?? [];
  const idIndex = header.findIndex((col) => String(col).trim() === "id");
  const nameIndex = header.findIndex((col) => String(col).trim() === "name");
  if (idIndex < 0 || nameIndex < 0) return [];

  const statColumnMap = FACILITY_STAT_HEADERS
    .map((entry) => ({
      stat: entry.stat,
      index: header
        .map((col, index) => ({ col: String(col).trim(), index }))
        .filter((item) => item.col === entry.header)
        .map((item) => item.index)
        .pop() ?? -1,
    }))
    .filter((entry) => entry.index >= 0);

  const entries: TrainingFacility[] = [];
  for (const row of rows.slice(1)) {
    const id = parseIntSafe(row[idIndex]);
    const name = String(row[nameIndex] ?? "").trim();
    if (!name) continue;

    const stats = statColumnMap
      .filter(({ index }) => parseIntSafe(row[index]) > 0)
      .map(({ stat }) => stat)
      .sort((a, b) => STAT_ORDER.indexOf(a) - STAT_ORDER.indexOf(b));

    if (stats.length === 0) continue;
    entries.push({ id, name, stats });
  }

  return entries.sort((a, b) => a.name.localeCompare(b.name));
}

export default function TrainingFacilitiesPage() {
  const facilities = useMemo(() => parseTrainingFacilities(), []);
  const [desiredStats, setDesiredStats] = useState<FacilityStatName[]>([]);
  const [undesiredStats, setUndesiredStats] = useState<FacilityStatName[]>([]);
  const statIcons = useMemo(() => {
    const icons = (localSharedData as { statIcons?: Record<string, unknown> }).statIcons ?? {};
    const normalized: Record<string, string> = {};
    for (const [key, value] of Object.entries(icons)) {
      if (typeof value === "string" && value.length > 0) normalized[key] = value;
    }
    return normalized;
  }, []);

  const filteredFacilities = useMemo(() => {
    return facilities.filter((facility) => {
      const satisfiesDesired = desiredStats.every((stat) => facility.stats.includes(stat));
      const avoidsUndesired = undesiredStats.every((stat) => !facility.stats.includes(stat));
      return satisfiesDesired && avoidsUndesired;
    });
  }, [facilities, desiredStats, undesiredStats]);

  function toggleDesiredStat(stat: FacilityStatName, checked: boolean) {
    setDesiredStats((current) => {
      if (checked) return current.includes(stat) ? current : [...current, stat];
      return current.filter((value) => value !== stat);
    });
    if (checked) setUndesiredStats((current) => current.filter((value) => value !== stat));
  }

  function toggleUndesiredStat(stat: FacilityStatName, checked: boolean) {
    setUndesiredStats((current) => {
      if (checked) return current.includes(stat) ? current : [...current, stat];
      return current.filter((value) => value !== stat);
    });
    if (checked) setDesiredStats((current) => current.filter((value) => value !== stat));
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-4">
      <PageHeader icon={<Dumbbell className="w-5 h-5" />} title="Training Facilities">
        <p>
          Facilities from Facility_lookup with non-zero stat gains.
        </p>
      </PageHeader>

      <Card>
        <CardContent className="pt-6">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="gap-2">
                  Desired Stats ({desiredStats.length})
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuLabel>Must include all selected</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {STAT_ORDER.map((stat) => (
                  <DropdownMenuCheckboxItem
                    key={`desired-${stat}`}
                    checked={desiredStats.includes(stat)}
                    onCheckedChange={(checked) => toggleDesiredStat(stat, checked === true)}
                  >
                    <span className="inline-flex items-center gap-2">
                      {statIcons[stat] ? <img src={statIcons[stat]} alt={stat} className="h-4 w-4 object-contain" /> : null}
                      {stat}
                    </span>
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="gap-2">
                  Undesired Stats ({undesiredStats.length})
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuLabel>Must not include any selected</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {STAT_ORDER.map((stat) => (
                  <DropdownMenuCheckboxItem
                    key={`undesired-${stat}`}
                    checked={undesiredStats.includes(stat)}
                    onCheckedChange={(checked) => toggleUndesiredStat(stat, checked === true)}
                  >
                    <span className="inline-flex items-center gap-2">
                      {statIcons[stat] ? <img src={statIcons[stat]} alt={stat} className="h-4 w-4 object-contain" /> : null}
                      {stat}
                    </span>
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <span className="text-sm text-muted-foreground">Showing {filteredFacilities.length} of {facilities.length}</span>
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Facility</TableHead>
                  <TableHead>Stats Gained</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredFacilities.map((facility) => {
                  const facilityIcon = getFacilityIconByName(facility.name) ?? getFurnitureIcon(facility.name);
                  return (
                    <TableRow key={`${facility.id}-${facility.name}`}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {facilityIcon ? (
                            <img src={facilityIcon} alt={facility.name} className="h-8 w-8 rounded-sm object-contain" />
                          ) : (
                            <div className="inline-flex h-8 w-8 items-center justify-center rounded-sm border border-dashed text-muted-foreground">
                              <ImageOff className="h-4 w-4" />
                            </div>
                          )}
                          <span className="font-medium">{facility.name}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-2">
                          {facility.stats.map((stat) => {
                            const icon = statIcons[stat];
                            if (!icon) return null;
                            return <img key={`${facility.id}-${stat}`} src={icon} alt={stat} title={stat} className="h-5 w-5 object-contain" />;
                          })}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
