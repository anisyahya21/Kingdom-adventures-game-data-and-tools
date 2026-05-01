import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { ArrowLeft, Menu, Moon, Search, Sun, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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

  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);
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
          Kingdom Adventures
        </Link>

        <div className="flex items-center gap-0.5">
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
    </div>
  );
}
