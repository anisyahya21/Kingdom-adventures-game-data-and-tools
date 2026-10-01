import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { Check, Loader2, Plus, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EQUIPMENT_CATALOG } from "@/lib/generated-equipment-data";
import { compareEquipmentCatalogOriginalOrder } from "@/lib/equipment-order";
import { getEquipmentIcon } from "@/lib/equipment-icons";
import { localSharedData } from "@/lib/local-shared-data";
import {
  fetchAuthSession,
  updateAuthProfile,
  type AuthSessionResponse,
} from "@/lib/auth-session";
import {
  PLAYER_VALUABLES,
  usePlayerProfile,
  useProfileStorageError,
  useProfileValuables,
  type PlayerCharacter,
} from "@/lib/player-profile";
import type { SharedJobProfileData } from "@/game-data/job-profile";
import { canonicalStatKey, STAT_KEYS } from "@/game-data/stat-parameter-ids";
import { gearSlotForName } from "@/lib/battle-team-draft";
import { RESIDENT_STAT_ITEMS } from "@/game-data/resident-stat-items";
import { EquipmentSprite } from "@/components/ka/equipment-sprite";
import { useProfileAccountSync } from "@/lib/account-player-profile/sync";

type EquipmentEntry = (typeof EQUIPMENT_CATALOG)[number];
const jobsData = localSharedData as unknown as SharedJobProfileData;
const JOBS = Object.keys(jobsData.jobs ?? {})
  .sort((a, b) => a.localeCompare(b))
  .map((name) => ({
    id: name,
    name,
    ranks: Object.keys(jobsData.jobs?.[name]?.ranks ?? {}),
  }));
const slotAssignments = (localSharedData.slotAssignments ?? {}) as Record<
  string,
  string
>;
const STAT_SET = new Set<string>(STAT_KEYS);
const WATER_KEYS = new Set(RESIDENT_STAT_ITEMS.map((item) => item.key));

function normalizeStatLevels(
  stats: Record<string, unknown>,
  previous: Record<string, number> = {},
) {
  const normalized: Record<string, number> = {};
  for (const key of Object.keys(stats)) {
    const canonical = canonicalStatKey(key);
    if (STAT_SET.has(canonical))
      normalized[canonical] = previous[canonical] ?? 1;
  }
  return normalized;
}

function NumberEditor({
  value,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
  label,
  onCommit,
  className = "",
}: {
  value: number;
  min?: number;
  max?: number;
  label: string;
  onCommit: (value: number) => void;
  className?: string;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    const parsed = draft.trim() === "" ? min : Number(draft);
    const normalized = Math.max(
      min,
      Math.min(max, Number.isFinite(parsed) ? Math.floor(parsed) : min),
    );
    setDraft(String(normalized));
    onCommit(normalized);
  };
  return (
    <Input
      aria-label={label}
      inputMode="numeric"
      type="number"
      min={min}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
      }}
      className={`h-11 ${className}`}
    />
  );
}

function equipmentSlot(item: EquipmentEntry) {
  const slot = gearSlotForName(item.name, slotAssignments);
  return slot ? slot.charAt(0).toUpperCase() + slot.slice(1) : "Unassigned";
}

export default function PlayerProfilePage() {
  const [profile, setProfile] = usePlayerProfile();
  const storageError = useProfileStorageError();
  const accountSync = useProfileAccountSync();
  const [valuableCounts, setValuableCounts] = useProfileValuables();
  const [auth, setAuth] = useState<AuthSessionResponse>({
    authenticated: false,
    guest: true,
  });
  const [authLoading, setAuthLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [accountName, setAccountName] = useState("");
  const [gameId, setGameId] = useState("");
  const [accountError, setAccountError] = useState("");
  const [accountSaved, setAccountSaved] = useState(false);
  const [tab, setTab] = useState("equipment");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("ALL");
  const [ownedOnly, setOwnedOnly] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkLevel, setBulkLevel] = useState("1");
  const [newJob, setNewJob] = useState(JOBS[0]?.name ?? "");

  useEffect(() => {
    let live = true;
    let latestRequest = 0;
    const refreshAccount = () => {
      const request = ++latestRequest;
      void fetchAuthSession()
        .then((session) => {
          if (live && request === latestRequest) {
            setAuth(session);
            setAccountName(session.user?.displayName ?? "");
            setGameId(session.user?.gameId ?? "");
          }
        })
        .catch(() => {})
        .finally(() => {
          if (live && request === latestRequest) setAuthLoading(false);
        });
    };
    refreshAccount();
    window.addEventListener("ka-auth-changed", refreshAccount);
    return () => {
      live = false;
      window.removeEventListener("ka-auth-changed", refreshAccount);
    };
  }, []);

  const categories = useMemo(
    () =>
      Array.from(new Set(EQUIPMENT_CATALOG.map((item) => equipmentSlot(item))))
        .filter((slot) => slot !== "Unassigned")
        .sort(),
    [],
  );
  const visibleItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    return EQUIPMENT_CATALOG.filter((item) => {
      const owned = Boolean(profile.equipment[item.name]);
      if (ownedOnly && !owned) return false;
      if (category !== "ALL" && equipmentSlot(item) !== category) return false;
      return (
        !query ||
        `${item.name} ${item.rankLabel} ${equipmentSlot(item)}`
          .toLowerCase()
          .includes(query)
      );
    }).sort(compareEquipmentCatalogOriginalOrder);
  }, [profile.equipment, category, search, ownedOnly]);

  const saveAccount = async () => {
    const normalizedName = accountName.trim();
    const normalizedId = gameId.trim();
    if (normalizedId && !/^\d{3},\d{3},\d{3}$/.test(normalizedId)) {
      setAccountError("Game ID must match 123,456,789 format.");
      return;
    }
    setSavingProfile(true);
    setAccountError("");
    setAccountSaved(false);
    try {
      await updateAuthProfile({
        displayName: normalizedName,
        gameId: normalizedId,
      });
      const session = await fetchAuthSession();
      setAuth(session);
      window.dispatchEvent(
        new CustomEvent("ka-auth-changed", {
          detail: { authenticated: session.authenticated },
        }),
      );
      setAccountSaved(true);
    } catch (error) {
      setAccountError(
        error instanceof Error ? error.message : "Could not save profile.",
      );
    } finally {
      setSavingProfile(false);
    }
  };

  const setEquipmentLevel = (name: string, level: number) =>
    setProfile((previous) => ({
      ...previous,
      equipment: { ...previous.equipment, [name]: level },
    }));
  const addCharacter = () => {
    const job = JOBS.find((entry) => entry.name === newJob);
    const rank = job?.ranks[0];
    if (!job || !rank) return;
    const stats = jobsData.jobs?.[job.name]?.ranks?.[rank]?.stats ?? {};
    const next: PlayerCharacter = {
      id: crypto.randomUUID(),
      jobName: job.name,
      rank,
      statLevels: normalizeStatLevels(stats),
    };
    setProfile((previous) => ({
      ...previous,
      characters: [...previous.characters, next],
    }));
  };
  const updateCharacter = (id: string, patch: Partial<PlayerCharacter>) =>
    setProfile((previous) => ({
      ...previous,
      characters: previous.characters.map((character) =>
        character.id === id ? { ...character, ...patch } : character,
      ),
    }));

  if (authLoading)
    return (
      <main className="container mx-auto max-w-6xl px-3 py-8">
        <div className="flex min-h-48 items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" /> Loading profile…
        </div>
      </main>
    );
  return (
    <main className="container mx-auto max-w-6xl space-y-5 px-3 py-6 sm:px-5">
      <div>
        <div className="text-sm text-muted-foreground">Account</div>
        <h1 className="text-3xl font-bold tracking-tight">Player Profile</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Characters, gear levels and valuables save automatically to your
          account when logged in. Your collection is shared with Loadout and Houses.
        </p>
      </div>
      <Card>
        <CardContent className="grid gap-4 p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <label className="space-y-1 text-sm">
            <span>Display name</span>
            <Input
              className="h-11"
              value={accountName}
              maxLength={64}
              onChange={(event) => {
                setAccountName(event.target.value);
                setAccountSaved(false);
              }}
              placeholder="Your name"
              disabled={!auth.authenticated}
            />
          </label>
          <label className="space-y-1 text-sm">
            <span>Game ID</span>
            <Input
              className="h-11"
              value={gameId}
              onChange={(event) => {
                setGameId(event.target.value);
                setAccountSaved(false);
              }}
              placeholder="123,456,789"
              disabled={!auth.authenticated}
            />
            <span className="block text-xs text-muted-foreground">
              Format: 3 digits, comma, 3 digits, comma, 3 digits.
            </span>
          </label>
          <Button
            className="h-11"
            onClick={() => void saveAccount()}
            disabled={savingProfile || !auth.authenticated}
          >
            {savingProfile && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {accountSaved ? (
              <>
                <Check className="mr-2 h-4 w-4" />
                Saved
              </>
            ) : auth.authenticated ? (
              "Save account details"
            ) : (
              "Log in to edit account"
            )}
          </Button>
          {!auth.authenticated && (
            <div className="text-sm text-muted-foreground sm:col-span-3">
              Collection edits stay on this device while logged out. Log in
              using the account menu to save them across devices.
            </div>
          )}
          {accountError && (
            <div className="text-sm text-destructive sm:col-span-3">
              {accountError}
            </div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardContent className="space-y-3 p-4">
          <div role={accountSync.status === "error" || accountSync.status === "conflict" ? "alert" : "status"} className="text-sm" aria-live="polite">
            {accountSync.status === "syncing" && <Loader2 className="mr-2 inline h-4 w-4 animate-spin" aria-hidden="true" />}
            {accountSync.status === "saved" && <Check className="mr-2 inline h-4 w-4" aria-hidden="true" />}
            {accountSync.message}
          </div>
          <div className="flex flex-wrap gap-2">
            {accountSync.accountId && accountSync.status !== "syncing" && accountSync.status !== "conflict" && (
              <Button variant="outline" onClick={() => void accountSync.retry()}>
                {accountSync.status === "error" ? "Retry account sync" : "Refresh account data"}
              </Button>
            )}
            {accountSync.status === "conflict" && (
              <>
                <Button onClick={accountSync.useAccountCopy}>Use account copy</Button>
                <Button variant="outline" onClick={accountSync.keepLocalCopy}>Save this device's copy to account</Button>
              </>
            )}
            {accountSync.legacyImportAvailable && accountSync.status !== "syncing" && accountSync.status !== "conflict" && (
              <Button variant="outline" onClick={() => void accountSync.restoreLegacyBackup()}>Import previous device profile</Button>
            )}
          </div>
          {accountSync.legacyImportAvailable && (
            <p className="text-xs text-muted-foreground">Your previous device profile is preserved. Importing it replaces your account collection with that device's saved collection.</p>
          )}
        </CardContent>
      </Card>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid h-auto w-full grid-cols-3">
          <TabsTrigger className="min-h-11" value="equipment">
            Equipment
          </TabsTrigger>
          <TabsTrigger className="min-h-11" value="characters">
            Characters
          </TabsTrigger>
          <TabsTrigger className="min-h-11" value="valuables">
            Valuables
          </TabsTrigger>
        </TabsList>
        <TabsContent value="equipment" className="space-y-4 pt-4">
          <Card>
            <CardContent className="space-y-3 p-3 sm:p-4">
              <div className="flex flex-col gap-3">
                <div className="relative min-w-0 flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="h-11 pl-9"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search equipment"
                  />
                </div>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {["ALL", ...categories].map((name) => (
                    <Button
                      key={name}
                      className="min-h-11 shrink-0"
                      variant={category === name ? "default" : "outline"}
                      onClick={() => {
                        setCategory(name);
                        setSelected([]);
                      }}
                    >
                      {name}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/20 p-2">
                <Button
                  className="min-h-11"
                  variant={ownedOnly ? "default" : "outline"}
                  onClick={() => setOwnedOnly((value) => !value)}
                >
                  {ownedOnly ? "Owned only" : "All equipment"}
                </Button>
                <span className="px-1 text-sm text-muted-foreground">
                  {selected.length} selected
                </span>
                <Input
                  aria-label="Bulk equipment level"
                  inputMode="numeric"
                  type="number"
                  min={1}
                  max={99}
                  value={bulkLevel}
                  onChange={(event) => setBulkLevel(event.target.value)}
                  className="h-11 w-24"
                />
                <Button
                  className="min-h-11"
                  variant="secondary"
                  disabled={!selected.length}
                  onClick={() => {
                    const parsed = bulkLevel.trim() ? Number(bulkLevel) : 1;
                    const level = Math.max(
                      1,
                      Math.min(
                        99,
                        Number.isFinite(parsed) ? Math.floor(parsed) : 1,
                      ),
                    );
                    setBulkLevel(String(level));
                    setProfile((previous) => ({
                      ...previous,
                      equipment: {
                        ...previous.equipment,
                        ...Object.fromEntries(
                          selected.map((name) => [name, level]),
                        ),
                      },
                    }));
                    setSelected([]);
                  }}
                >
                  Set selected level
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {visibleItems.map((item) => {
                  const level = profile.equipment[item.name];
                  const isSelected = selected.includes(item.name);
                  const icon = getEquipmentIcon(null, item.name);
                  return (
                    <article
                      key={item.name}
                      className={`relative min-w-0 rounded-lg border p-2 transition-colors ${isSelected ? "border-primary bg-primary/5" : "bg-card"}`}
                    >
                      <button
                        type="button"
                        className="absolute inset-0 z-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        aria-label={`${isSelected ? "Deselect" : "Select"} ${item.name}`}
                        onClick={() => {
                          if (!level) {
                            setEquipmentLevel(item.name, 1);
                            setSelected((old) =>
                              old.includes(item.name)
                                ? old
                                : [...old, item.name],
                            );
                          } else
                            setSelected((old) =>
                              old.includes(item.name)
                                ? old.filter((name) => name !== item.name)
                                : [...old, item.name],
                            );
                        }}
                      />
                      <div className="pointer-events-none relative z-[1] flex h-20 items-center justify-center rounded-md bg-muted/40">
                        {icon ? (
                          <EquipmentSprite
                            src={icon}
                            alt=""
                            className={`h-16 w-16 object-contain ${level ? "" : "opacity-50"}`}
                          />
                        ) : (
                          <span className="text-2xl">◇</span>
                        )}
                        {isSelected && (
                          <span
                            className="absolute left-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground shadow"
                            aria-hidden="true"
                          >
                            <Check className="h-4 w-4" />
                          </span>
                        )}
                        {level && (
                          <span className="absolute right-1 top-1 rounded bg-background/90 px-1.5 text-xs font-semibold">
                            Lv {level}
                          </span>
                        )}
                      </div>
                      <div className="relative z-[1] mt-2">
                        <div
                          className="line-clamp-2 min-h-10 text-xs font-medium"
                          title={item.name}
                        >
                          {item.name}
                        </div>
                        <div className="mt-1 text-[11px] text-muted-foreground">
                          {item.rankLabel} · {equipmentSlot(item)}
                        </div>
                        {level ? (
                          <div className="mt-2 flex items-center gap-1">
                            <span className="text-xs">Level</span>
                            <NumberEditor
                              value={level}
                              min={1}
                              max={99}
                              label={`${item.name} level`}
                              onCommit={(value) =>
                                setEquipmentLevel(item.name, value)
                              }
                              className="h-11 min-w-0 flex-1 px-2"
                            />
                            <Button
                              className="h-11 w-11 shrink-0 text-destructive hover:text-destructive"
                              size="icon"
                              variant="ghost"
                              title="Remove from collection"
                              onClick={(event) => {
                                event.stopPropagation();
                                if (
                                  window.confirm(
                                    `Remove ${item.name} from your collection?`,
                                  )
                                ) {
                                  setProfile((previous) => {
                                    const next = { ...previous.equipment };
                                    delete next[item.name];
                                    return { ...previous, equipment: next };
                                  });
                                  setSelected((old) =>
                                    old.filter((name) => name !== item.name),
                                  );
                                }
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : (
                          <div className="relative z-[2] mt-2">
                            <Button
                              className="h-11 w-full"
                              variant="secondary"
                              onClick={() => {
                                setEquipmentLevel(item.name, 1);
                                setSelected((old) =>
                                  old.includes(item.name)
                                    ? old
                                    : [...old, item.name],
                                );
                              }}
                            >
                              Unlock at Lv 1
                            </Button>
                          </div>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
              {!visibleItems.length && (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  No equipment matches this search.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="characters" className="space-y-3 pt-4">
          <Card>
            <CardContent className="flex flex-col gap-2 p-3 sm:flex-row sm:items-end">
              <label className="flex-1 space-y-1 text-sm">
                <span>New character job</span>
                <select
                  value={newJob}
                  onChange={(event) => setNewJob(event.target.value)}
                  className="h-11 w-full rounded-md border border-input bg-background px-3"
                >
                  {JOBS.map((job) => (
                    <option key={job.id} value={job.name}>
                      {job.name}
                    </option>
                  ))}
                </select>
              </label>
              <Button className="h-11" onClick={addCharacter}>
                <Plus className="mr-2 h-4 w-4" />
                Add character
              </Button>
            </CardContent>
          </Card>
          {!profile.characters.length && (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              Add a character to record its job rank and stat levels.
            </div>
          )}
          {profile.characters.map((character) => {
            const job = jobsData.jobs?.[character.jobName];
            const rankData = job?.ranks?.[character.rank];
            const ranks = Object.keys(job?.ranks ?? {});
            const stats = Object.entries(rankData?.stats ?? {})
              .map(
                ([label, data]) =>
                  [label, data, canonicalStatKey(label)] as const,
              )
              .filter(([, , key]) => STAT_SET.has(key));
            return (
              <Card key={character.id}>
                <CardContent className="space-y-4 p-3 sm:p-4">
                  <div className="flex flex-wrap items-end gap-2">
                    <label className="min-w-[11rem] flex-1 space-y-1 text-xs">
                      <span>Job</span>
                      <select
                        value={character.jobName}
                        onChange={(event) => {
                          const nextJob = jobsData.jobs?.[event.target.value];
                          const nextRank =
                            Object.keys(nextJob?.ranks ?? {})[0] ??
                            character.rank;
                          const nextStats =
                            nextJob?.ranks?.[nextRank]?.stats ?? {};
                          updateCharacter(character.id, {
                            jobName: event.target.value,
                            rank: nextRank,
                            statLevels: normalizeStatLevels(nextStats),
                          });
                        }}
                        className="h-11 w-full rounded-md border border-input bg-background px-3"
                      >
                        {JOBS.map((entry) => (
                          <option key={entry.id} value={entry.name}>
                            {entry.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="w-28 space-y-1 text-xs">
                      <span>Rank</span>
                      <select
                        value={character.rank}
                        onChange={(event) => {
                          const nextStats =
                            jobsData.jobs?.[character.jobName]?.ranks?.[
                              event.target.value
                            ]?.stats ?? {};
                          updateCharacter(character.id, {
                            rank: event.target.value,
                            statLevels: normalizeStatLevels(
                              nextStats,
                              character.statLevels,
                            ),
                          });
                        }}
                        className="h-11 w-full rounded-md border border-input bg-background px-3"
                      >
                        {ranks.map((rank) => (
                          <option key={rank}>{rank}</option>
                        ))}
                      </select>
                    </label>
                    <Button
                      className="h-11 text-destructive hover:text-destructive"
                      variant="outline"
                      onClick={() => {
                        if (
                          window.confirm(
                            `Delete ${character.jobName} character?`,
                          )
                        )
                          setProfile((previous) => ({
                            ...previous,
                            characters: previous.characters.filter(
                              (entry) => entry.id !== character.id,
                            ),
                          }));
                      }}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                    {stats.map(([label, data, stat]) => (
                      <label
                        key={stat}
                        className="space-y-1 rounded-md border p-2 text-xs"
                      >
                        <span className="block capitalize">{label}</span>
                        <span className="flex items-center gap-2">
                          <span className="text-muted-foreground">Level</span>
                          <NumberEditor
                            value={character.statLevels[stat] ?? 1}
                            min={1}
                            max={999}
                            label={`${character.jobName} ${label} level`}
                            onCommit={(value) =>
                              updateCharacter(character.id, {
                                statLevels: {
                                  ...character.statLevels,
                                  [stat]: value,
                                },
                              })
                            }
                            className="h-11 min-w-0"
                          />
                        </span>
                        {data.maxLevel && (
                          <span className="text-muted-foreground">
                            Job table cap: {data.maxLevel}
                          </span>
                        )}
                      </label>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>
        <TabsContent value="valuables" className="pt-4">
          <Card>
            <CardContent className="grid gap-3 p-3 sm:grid-cols-2 sm:p-4">
              {PLAYER_VALUABLES.map((valuable) => {
                const count = valuableCounts[valuable.key] ?? 0;
                return (
                  <div
                    key={valuable.key}
                    className="flex min-w-0 items-center gap-3 rounded-lg border p-3"
                  >
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded bg-muted/40">
                      <img
                        src={valuable.iconSrc}
                        alt=""
                        className="max-h-12 max-w-12 object-contain"
                        loading="lazy"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">{valuable.name}</div>
                      <div className="line-clamp-2 text-xs text-muted-foreground">
                        {valuable.description}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {WATER_KEYS.has(valuable.key) ? "Used" : "Acquired"}:{" "}
                        {count}
                      </div>
                    </div>
                    <NumberEditor
                      value={count}
                      label={`${valuable.name} count`}
                      onCommit={(value) =>
                        setValuableCounts((previous) => ({
                          ...previous,
                          [valuable.key]: value,
                        }))
                      }
                      className="w-20"
                    />
                  </div>
                );
              })}
            </CardContent>
          </Card>
          <p className="mt-3 text-xs text-muted-foreground">
            Valuable counts are shared with the Loadout Builder and Houses
            planner using your saved profile.
          </p>
        </TabsContent>
      </Tabs>
      {storageError && (
        <div
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
        >
          Saved data could not be written to this device: {storageError}
        </div>
      )}
      <p className="text-center text-xs text-muted-foreground">
        <Link href="/loadout" className="underline underline-offset-2">
          Open Loadout Builder
        </Link>{" "}
        ·{" "}
        <Link href="/houses" className="underline underline-offset-2">
          Open Houses planner
        </Link>
      </p>
    </main>
  );
}
