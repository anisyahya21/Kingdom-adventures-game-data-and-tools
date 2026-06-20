import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { ArrowLeft, Loader2, Menu, Moon, Search, Sun, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  fetchAuthSession,
  logoutAuthSession,
  startTelegramAuth,
  startTelegramFallbackAuth,
  updateAuthProfile,
  verifyTelegramFallbackAuth,
  type AuthSessionResponse,
  type TelegramFallbackStartResponse,
} from "@/lib/auth-session";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { buildGlobalSearchEntries } from "./global-search";
import { NAV_SECTIONS } from "./navigation";

export function SiteHeader() {
  const [pathname, navigate] = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [dark, setDark] = useState(() =>
    typeof window !== "undefined"
      ? localStorage.getItem("theme") === "dark" ||
        (!localStorage.getItem("theme") && window.matchMedia("(prefers-color-scheme: dark)").matches)
      : false,
  );
  const [authSession, setAuthSession] = useState<AuthSessionResponse>({ authenticated: false, guest: true });
  const [authLoading, setAuthLoading] = useState(true);
  const [authBusy, setAuthBusy] = useState(false);
  const [fallbackOpen, setFallbackOpen] = useState(false);
  const [fallbackData, setFallbackData] = useState<TelegramFallbackStartResponse | null>(null);
  const [fallbackBusy, setFallbackBusy] = useState(false);
  const [fallbackError, setFallbackError] = useState<string | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileName, setProfileName] = useState("");
  const [profileGameId, setProfileGameId] = useState("");
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const authPopupRef = useRef<Window | null>(null);
  const hasNavRef = useRef(false);
  const prevPathRef = useRef(pathname);

  useEffect(() => {
    if (prevPathRef.current !== pathname) {
      hasNavRef.current = true;
      prevPathRef.current = pathname;
    }
  }, [pathname]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("theme", dark ? "dark" : "light");
  }, [dark]);

  useEffect(() => {
    let mounted = true;
    setAuthLoading(true);
    fetchAuthSession()
      .then((session) => {
        if (mounted) setAuthSession(session);
      })
      .finally(() => {
        if (mounted) setAuthLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const refreshAuthSession = () => {
    setAuthLoading(true);
    return fetchAuthSession()
      .then((session) => setAuthSession(session))
      .finally(() => setAuthLoading(false));
  };

  const goBack = () => {
    if (hasNavRef.current) {
      window.history.back();
    } else {
      navigate("/");
    }
  };

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;

      if (menuRef.current && !menuRef.current.contains(target)) {
        setMenuOpen(false);
      }

      if (searchRef.current && !searchRef.current.contains(target)) {
        setSearchOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const searchEntries = useMemo(() => buildGlobalSearchEntries(), []);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return searchEntries.filter((entry) =>
      entry.label.toLowerCase().includes(q),
    ).slice(0, 8);
  }, [query, searchEntries]);

  useEffect(() => {
    function handleAuthMessage(event: MessageEvent) {
      const payload = event.data as { source?: string; type?: string } | null;
      if (!payload || payload.source !== "ka-auth") return;
      setAuthBusy(false);
      void refreshAuthSession();
    }

    window.addEventListener("message", handleAuthMessage);
    return () => window.removeEventListener("message", handleAuthMessage);
  }, []);

  const startPopupLogin = async () => {
    setAuthBusy(true);
    try {
      const started = await startTelegramAuth();
      const popup = window.open(
        started.widgetUrl,
        "ka-telegram-login",
        "popup=yes,width=540,height=720,resizable=yes,scrollbars=yes",
      );
      authPopupRef.current = popup;
      if (!popup) {
        window.location.href = started.widgetUrl;
        return;
      }

      const timer = window.setInterval(() => {
        if (!authPopupRef.current || authPopupRef.current.closed) {
          window.clearInterval(timer);
          authPopupRef.current = null;
          setAuthBusy(false);
          void refreshAuthSession();
        }
      }, 500);
    } catch {
      setAuthBusy(false);
    }
  };

  const startFallbackLogin = async () => {
    setFallbackOpen(true);
    setFallbackBusy(true);
    setFallbackError(null);
    try {
      const started = await startTelegramFallbackAuth();
      setFallbackData(started);
    } catch (error) {
      setFallbackData(null);
      setFallbackError(error instanceof Error ? error.message : "Code login is unavailable.");
    } finally {
      setFallbackBusy(false);
    }
  };

  const verifyFallbackLogin = async () => {
    if (!fallbackData?.state) return;
    setFallbackBusy(true);
    setFallbackError(null);
    try {
      await verifyTelegramFallbackAuth(fallbackData.state);
      await refreshAuthSession();
      setFallbackOpen(false);
      setFallbackData(null);
    } catch (error) {
      setFallbackError(error instanceof Error ? error.message : "Could not verify code.");
    } finally {
      setFallbackBusy(false);
    }
  };

  const logout = async () => {
    setAuthBusy(true);
    try {
      await logoutAuthSession();
      setAuthSession({ authenticated: false, guest: true });
    } finally {
      setAuthBusy(false);
    }
  };

  const openProfileDialog = () => {
    setProfileName(authSession.user?.displayName || "");
    setProfileGameId(authSession.user?.gameId || "");
    setProfileError(null);
    setProfileOpen(true);
  };

  const saveProfile = async () => {
    const normalizedName = profileName.trim();
    const normalizedGameId = profileGameId.trim();
    if (normalizedGameId && !/^\d{3},\d{3},\d{3}$/.test(normalizedGameId)) {
      setProfileError("Game ID must match 123,456,789 format.");
      return;
    }

    setProfileBusy(true);
    setProfileError(null);
    try {
      await updateAuthProfile({
        displayName: normalizedName,
        gameId: normalizedGameId,
      });
      await refreshAuthSession();
      setProfileOpen(false);
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : "Could not save profile.");
    } finally {
      setProfileBusy(false);
    }
  };

  return (
    <div className="fixed inset-x-0 top-0 z-[60] border-b border-border bg-background/90 backdrop-blur">
      <div className="w-full px-2 sm:px-4 h-14 flex items-center justify-between gap-3">
        <div className="flex items-center gap-0.5">
          {pathname !== "/" && (
            <Button variant="ghost" size="icon" className="h-11 w-11" onClick={goBack} title="Go back">
              <ArrowLeft className="w-[30px] h-[30px]" />
            </Button>
          )}

          <div ref={menuRef}>
            <Button variant="ghost" size="icon" className="h-11 w-11" onClick={() => setMenuOpen(!menuOpen)}>
              <Menu className="w-[30px] h-[30px]" />
            </Button>

            {menuOpen && (
              <div className="absolute left-4 top-full mt-2 z-50 w-72 max-h-[min(80vh,42rem)] overflow-y-auto">
                <Card>
                  <CardContent className="p-3 space-y-3">
                    {NAV_SECTIONS.map((section) => (
                      <div key={section.title} className="space-y-1.5">
                        <div className="px-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">
                          {section.title}
                        </div>
                        {section.primary && (
                          <button
                            onClick={() => {
                              navigate(section.primary!.href);
                              setMenuOpen(false);
                            }}
                            className="w-full text-left rounded-md border px-3 py-2 text-sm hover:bg-muted/40"
                          >
                            <span className="flex items-center gap-1.5">
                              {section.primary.label}
                              {section.primary.beta && (
                                <span className="text-[10px] font-semibold text-orange-400">BETA</span>
                              )}
                            </span>
                          </button>
                        )}
                        {section.note && (
                          <div className="px-1 text-[11px] leading-relaxed text-muted-foreground/75">
                            {section.note}
                          </div>
                        )}
                        {section.children && (
                          <div className="flex flex-wrap gap-1.5 px-0.5">
                            {section.children.map((link) => (
                              <button
                                key={`${section.title}-${link.href}-${link.label}`}
                                onClick={() => {
                                  navigate(link.href);
                                  setMenuOpen(false);
                                }}
                                className="rounded-md border px-2.5 py-1.5 text-[11px] hover:bg-muted/40"
                              >
                                <span className="flex items-center gap-1">
                                  {link.label}
                                  {link.beta && (
                                    <span className="text-[9px] font-semibold text-orange-400">BETA</span>
                                  )}
                                </span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        </div>

        <Link
          href="/"
          className="text-xl sm:text-2xl font-semibold truncate hover:opacity-80 transition-opacity"
          title="Go to home page"
        >
          Kingdom Adventurers
        </Link>

        <div className="flex items-center gap-0.5">
          {authLoading ? (
            <Button variant="ghost" className="h-11 px-3 text-xs" disabled>
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading
            </Button>
          ) : authSession.authenticated ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-11 px-3 text-xs" title="Open account menu" disabled={authBusy}>
                  {authBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {authSession.user?.displayName || "Account"}
                  {authSession.user?.isAdmin ? " (Admin)" : ""}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel className="text-xs text-muted-foreground">
                  {authSession.user?.telegramUsername ? `@${authSession.user.telegramUsername}` : "Signed in"}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={openProfileDialog}>Edit profile</DropdownMenuItem>
                <DropdownMenuItem onClick={() => void logout()}>Log out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <>
              <Button variant="ghost" className="h-11 px-3 text-xs" onClick={startFallbackLogin} disabled={fallbackBusy} title="Log in using bot code">
                {fallbackBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Log in
              </Button>
              <Button variant="ghost" className="h-11 px-2 text-[11px]" onClick={startPopupLogin} disabled={authBusy} title="Use Telegram popup login">
                {authBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Popup
              </Button>
            </>
          )}

          <Button variant="ghost" size="icon" className="h-11 w-11" onClick={() => setDark((d) => !d)} title={dark ? "Switch to light mode" : "Switch to dark mode"}>
            {dark ? <Sun className="w-[30px] h-[30px]" /> : <Moon className="w-[30px] h-[30px]" />}
          </Button>

          <div ref={searchRef}>
            <Button variant="ghost" size="icon" className="h-11 w-11" onClick={() => setSearchOpen(!searchOpen)}>
              <Search className="w-[30px] h-[30px]" />
            </Button>

            {searchOpen && (
              <div className="absolute right-4 top-full mt-2 z-50 w-[min(32rem,calc(100vw-2rem))]">
                <Card>
                  <CardContent className="p-3 space-y-3">
                    <div className="relative">
                      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" />
                      <Input
                        autoFocus
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search..."
                        className="pl-9 h-10 pr-9"
                      />

                      {query && (
                        <button
                          onClick={() => setQuery("")}
                          className="absolute right-3 top-1/2 -translate-y-1/2"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>

                    {filtered.map((entry) => (
                      <button
                        key={`${entry.subtitle}-${entry.label}`}
                        onClick={() => {
                          navigate(entry.href);
                          setSearchOpen(false);
                          setQuery("");
                        }}
                        className="block w-full text-left px-2 py-2 hover:bg-muted/40 rounded-md"
                      >
                        <div className="font-medium text-sm">{entry.label}</div>
                        <div className="text-xs opacity-70">{entry.subtitle}</div>
                      </button>
                    ))}
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        </div>
      </div>

      <Dialog open={fallbackOpen} onOpenChange={setFallbackOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Log in with bot code</DialogTitle>
            <DialogDescription>
              This path avoids Telegram phone confirmation popups. Send this command to the bot and verify.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 text-sm">
            {fallbackData ? (
              <>
                <div className="rounded-md border border-border/70 bg-muted/30 p-3 font-mono text-xs break-all">
                  {fallbackData.command}
                </div>
                <div className="flex flex-wrap gap-2">
                  <a href={fallbackData.botUrl} target="_blank" rel="noopener noreferrer">
                    <Button size="sm" variant="outline">Open Bot</Button>
                  </a>
                  {fallbackData.deepLinkUrl ? (
                    <a href={fallbackData.deepLinkUrl} target="_blank" rel="noopener noreferrer">
                      <Button size="sm" variant="outline">Open Bot with Code</Button>
                    </a>
                  ) : null}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      void navigator.clipboard?.writeText(fallbackData.command);
                    }}
                  >
                    Copy Command
                  </Button>
                  <Button size="sm" onClick={verifyFallbackLogin} disabled={fallbackBusy}>
                    {fallbackBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    I Sent It, Verify
                  </Button>
                </div>
              </>
            ) : (
              <div className="text-muted-foreground">Preparing login code...</div>
            )}

            {fallbackError ? (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
                {fallbackError}
              </div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit profile</DialogTitle>
            <DialogDescription>
              Set how your name appears and optionally add your game ID.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Displayed Name</div>
              <Input
                value={profileName}
                onChange={(event) => setProfileName(event.target.value)}
                maxLength={64}
                placeholder="Your name"
              />
            </div>

            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Game ID</div>
              <Input
                value={profileGameId}
                onChange={(event) => setProfileGameId(event.target.value)}
                placeholder="123,456,789"
              />
              <div className="text-[11px] text-muted-foreground">Format: 3 digits, comma, 3 digits, comma, 3 digits.</div>
            </div>

            {profileError ? (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
                {profileError}
              </div>
            ) : null}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setProfileOpen(false)} disabled={profileBusy}>Cancel</Button>
              <Button onClick={saveProfile} disabled={profileBusy}>
                {profileBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

