import { useEffect, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { startDiscordAuth, startTelegramAuth, unlinkAuthProvider, updateAuthProfile, type AuthSessionResponse, type GameAccount } from "@/lib/auth-session";

export function ProfileAccountSettings({ session }: { session: AuthSessionResponse }) {
  const user = session.user;
  const [name, setName] = useState("");
  const [accounts, setAccounts] = useState<GameAccount[]>([]);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    setName(user?.displayName || "");
    const next = user?.gameAccounts || [{ id: "primary", name: "Main account", gameId: user?.gameId || "" }];
    setAccounts(next);
    setDirty(false);
  }, [user]);
  const update = (id: string, patch: Partial<GameAccount>) => {
    setAccounts((previous) => previous.map((account) => account.id === id ? { ...account, ...patch } : account));
    setDirty(true); setMessage("");
  };
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setError(""); setMessage("");
    try { await action(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Please try again."); }
    finally { setBusy(false); }
  };
  const primary = accounts.find((account) => account.id === "primary");
  const providers = user?.linkedProviders;
  return <Card><CardContent className="space-y-5 p-4">
    <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); void run(async () => {
      if (!user) return;
      await updateAuthProfile({ displayName: name, gameId: primary?.gameId || "", gameAccounts: accounts, expectedUserId: user.id, accountsRevision: user.accountsRevision });
      setDirty(false); setMessage("Account details saved.");
      window.dispatchEvent(new CustomEvent("ka-auth-changed"));
    }); }}>
      <fieldset disabled={!session.authenticated || busy} className="space-y-3">
        <div className="grid items-start gap-4 sm:grid-cols-2">
          <label className="grid gap-1 text-sm"><span>Display name</span><Input className="h-11" value={name} maxLength={64} placeholder="Your name" onChange={(event) => { setName(event.target.value); setDirty(true); }} /></label>
          <label className="grid gap-1 text-sm"><span>Main Game ID</span><Input className="h-11" value={primary?.gameId || ""} maxLength={11} placeholder="123,456,789" inputMode="numeric" pattern="[0-9]{3},[0-9]{3},[0-9]{3}" aria-describedby="profile-game-id-hint" onChange={(event) => update("primary", { gameId: event.target.value })} /></label>
        </div>
        <p id="profile-game-id-hint" className="text-xs text-muted-foreground">Game IDs use 123,456,789 format.</p>
        {accounts.filter((account) => account.id !== "primary").map((account, index) => <div key={account.id} className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <label className="grid gap-1 text-sm"><span>Account {index + 2} name</span><Input className="h-11" required value={account.name} maxLength={64} onChange={(event) => update(account.id, { name: event.target.value })} /></label>
          <label className="grid gap-1 text-sm"><span>Game ID</span><Input className="h-11" value={account.gameId} maxLength={11} placeholder="123,456,789" inputMode="numeric" pattern="[0-9]{3},[0-9]{3},[0-9]{3}" onChange={(event) => update(account.id, { gameId: event.target.value })} /></label>
          <Button type="button" variant="outline" className="h-11" aria-label={`Remove ${account.name}`} onClick={() => { setAccounts((previous) => previous.filter((entry) => entry.id !== account.id)); setDirty(true); }}><Trash2 className="h-4 w-4" /><span className="sm:hidden">Remove account</span></Button>
        </div>)}
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" disabled={accounts.length >= 20} onClick={() => { setAccounts((previous) => [...previous, { id: crypto.randomUUID(), name: `Account ${previous.length + 1}`, gameId: "" }]); setDirty(true); }}><Plus className="mr-2 h-4 w-4" />Add game account</Button>
          <Button type="submit" disabled={!dirty}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save account details</Button>
        </div>
      </fieldset>
    </form>
    {session.authenticated ? <div className="space-y-3 border-t pt-4">
      <h2 className="font-semibold">Linked sign-ins</h2>
      {(["telegram", "discord"] as const).map((provider) => {
        const linked = providers?.[provider] ?? (provider === "telegram");
        const otherLinked = providers?.[provider === "telegram" ? "discord" : "telegram"];
        const username = provider === "telegram" ? user?.telegramUsername : user?.discordUsername;
        return <div key={provider} className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm"><span className="capitalize">{provider}</span><span className="ml-2 text-muted-foreground">{linked ? username ? `@${username}` : "Connected" : "Not connected"}</span></div>
          <Button type="button" variant="outline" disabled={busy || (linked && !otherLinked)} title={linked && !otherLinked ? "Link another sign-in before unlinking this one." : undefined} onClick={() => void run(async () => {
            if (linked && user) { await unlinkAuthProvider(provider, user.id); setMessage(`${provider === "telegram" ? "Telegram" : "Discord"} unlinked.`); }
            else if (provider === "discord") await startDiscordAuth(true);
            else { const started = await startTelegramAuth(true); window.location.assign(started.widgetUrl); }
          })}>{linked ? "Unlink" : "Link"}</Button>
        </div>;
      })}
      <p className="text-xs text-muted-foreground">Keep at least one sign-in connected.</p>
    </div> : <p className="text-sm text-muted-foreground">Log in using the account menu to save your game accounts across devices.</p>}
    {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </CardContent></Card>;
}
