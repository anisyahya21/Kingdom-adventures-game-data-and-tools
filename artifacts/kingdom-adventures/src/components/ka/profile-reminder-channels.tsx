import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import type { ProfileNotificationProps } from "./profile-notifications";

export function ProfileReminderChannels(props: ProfileNotificationProps) {
  const { telegram, discord, channels } = props;
  return <div className="grid gap-3 sm:grid-cols-2">
    <section className="space-y-3 rounded-xl border bg-muted/15 p-4" aria-label="Telegram delivery">
      <div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary"><MessageCircle className="h-4 w-4" /></span><div className="min-w-0 flex-1"><h3 className="text-sm font-semibold">Telegram</h3><p className="mt-0.5 text-xs text-muted-foreground">{telegram.configured ? "Reminders in your Telegram chat" : "Delivery is not configured here"}</p></div><Switch aria-label="Telegram reminders" checked={channels.telegram} disabled={!telegram.configured} onCheckedChange={(on) => props.setChannel("telegram", on)} /></div>
      {telegram.configured && <div className="flex flex-wrap items-center gap-3 text-xs">
        {telegram.botUrl && <a href={telegram.botUrl} target="_blank" rel="noreferrer" className="font-medium text-primary hover:underline">Open reminder bot</a>}
        {channels.telegram && props.targets.telegramChatId && <Button size="sm" variant="ghost" onClick={props.testTelegram}>Send test</Button>}
      </div>}
      {channels.telegram && <details open className="text-xs"><summary className="cursor-pointer text-muted-foreground">Telegram setup</summary><div className="mt-3 flex flex-wrap items-end gap-2"><label className="grid flex-1 gap-1 text-muted-foreground">Chat ID<Input value={props.targets.telegramChatId} inputMode="numeric" placeholder="Your Telegram chat ID" onChange={(event) => props.setTelegramId(event.target.value)} /></label><a href={telegram.idHelperUrl} target="_blank" rel="noreferrer" className="py-2 text-primary hover:underline">Find my ID</a></div></details>}
    </section>
    <section className="space-y-3 rounded-xl border bg-muted/15 p-4" aria-label="Discord delivery">
      <div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary"><MessageCircle className="h-4 w-4" /></span><div className="min-w-0 flex-1"><h3 className="text-sm font-semibold">Discord</h3><p className="mt-0.5 text-xs text-muted-foreground">{discord.connected ? `Connected as ${discord.username || "Discord user"}` : discord.oauthConfigured ? "Reminders by direct message" : "Delivery is not configured here"}</p></div><Switch aria-label="Discord reminders" checked={channels.discord} disabled={!discord.connected} onCheckedChange={(on) => props.setChannel("discord", on)} /></div>
      {discord.connected ? <div className="flex flex-wrap items-center gap-3"><Button size="sm" variant="outline" onClick={props.testDiscord}>Send test</Button><Button size="sm" variant="ghost" className="text-muted-foreground" onClick={props.disconnectDiscord}>Disconnect delivery</Button></div> : discord.oauthConfigured ? <Button size="sm" variant="outline" onClick={props.connectDiscord}>Connect Discord</Button> : null}
      {discord.lastError && <p className="text-xs text-destructive">{discord.lastError}</p>}
    </section>
  </div>;
}
