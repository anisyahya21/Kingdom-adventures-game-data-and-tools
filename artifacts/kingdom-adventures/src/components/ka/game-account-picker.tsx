import { useEffect, useState } from "react";
import { fetchAuthSession, type AuthUser } from "@/lib/auth-session";
import { selectedGameAccount, selectGameAccount, gameAccountScope } from "@/lib/game-accounts";
import { useProfileAccountSync } from "@/lib/account-player-profile/sync";

/** Selection belongs to the current tool; it does not change other tools' choices. */
export function GameAccountPicker({ label = "Game account", onChange }: { label?: string; onChange?: (scope: string) => void }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [selected, setSelected] = useState("primary");
  const sync = useProfileAccountSync();
  useEffect(() => {
    let live = true;
    const refresh = () => void fetchAuthSession().then((session) => {
      if (!live) return;
      setUser(session.user || null);
      if (session.user) setSelected(selectedGameAccount(session.user.id, session.user.gameAccounts || []));
    }).catch(() => {});
    const onStorage = (event: StorageEvent) => { if (event.key?.startsWith("ka_game_account_choice:")) refresh(); };
    refresh();
    window.addEventListener("ka-auth-changed", refresh);
    window.addEventListener("storage", onStorage);
    return () => { live = false; window.removeEventListener("ka-auth-changed", refresh); window.removeEventListener("storage", onStorage); };
  }, []);
  if (!user || !user.gameAccounts || user.gameAccounts.length < 2) return null;
  const loading = sync.status === "syncing" || sync.accountId !== gameAccountScope(user.id, selected);
  return <div className="flex flex-wrap items-center gap-3">
    <label className="flex flex-wrap items-center gap-2 text-sm"><span className="font-medium">{label}</span>
      <select aria-label={label} className="h-10 max-w-full rounded-md border border-input bg-background px-3 text-sm" value={selected} disabled={loading || sync.status === "conflict"} onChange={(event) => { setSelected(event.target.value); onChange?.(gameAccountScope(user.id, event.target.value)); selectGameAccount(user.id, event.target.value); }}>
        {user.gameAccounts.map((account) => <option key={account.id} value={account.id}>{account.name}{account.gameId ? ` · ${account.gameId}` : ""}</option>)}
      </select>
    </label>
    {loading && <span role="status" className="text-xs text-muted-foreground">Loading saved collection…</span>}
  </div>;
}
