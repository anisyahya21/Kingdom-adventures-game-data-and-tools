import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "wouter";
import { BookOpenText, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { localSharedData } from "@/lib/local-shared-data";
import { SHOP_RECORDS, getShopHref } from "@/lib/shop-utils";
import {
  PLAYTHROUGH_GUIDE_DOC_ID,
  PLAYTHROUGH_GUIDE_LOCAL_URL,
  PLAYTHROUGH_GUIDE_SECTION_OVERLAYS,
} from "@/lib/playthrough-guide";

type GuideSection = {
  id: string;
  title: string;
  level: 1 | 2;
  lines: string[];
};

type ParsedGuide = {
  imageMap: Record<string, string>;
  sections: GuideSection[];
};

type GuideLink = {
  label: string;
  href: string;
};

type ProtectedPhrase = {
  phrase: string;
  blockedLabels: string[];
};

type MarkdownLinkMatch = {
  label: string;
  url: string;
  start: number;
  end: number;
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildGuideLinks(): GuideLink[] {
  const shared = localSharedData as {
    jobs?: Record<string, unknown>;
    overrides?: Record<string, unknown>;
    skills?: Record<string, unknown>;
  };

  const links = new Map<string, string>();

  const add = (label: string, href: string) => {
    const key = label.trim().toLowerCase();
    if (!key || links.has(key)) return;
    links.set(key, href);
  };

  const blockedAutoLabels = new Set([
    "important",
    "miner",
    "mover",
    "research",
    "royal",
  ]);

  Object.keys(shared.jobs ?? {}).forEach((name) => {
    if (blockedAutoLabels.has(name.trim().toLowerCase())) return;
    add(name, `/jobs/${encodeURIComponent(name)}`);
  });

  Object.keys(shared.skills ?? {}).forEach((name) => {
    if (blockedAutoLabels.has(name.trim().toLowerCase())) return;
    add(name, "/skills");
  });

  Object.keys(shared.overrides ?? {}).forEach((name) => {
    if (/^[FSABCDE]\s*\/\s*/i.test(name)) {
      add(name, `/equipment-stats?search=${encodeURIComponent(name)}`);
    }
  });

  SHOP_RECORDS.forEach((shop) => {
    const href = getShopHref(shop.title);
    if (href) {
      add(shop.title, href);
      add(shop.title.toLowerCase(), href);
    }

    if (shop.owner) {
      add(shop.owner, `/jobs/${encodeURIComponent(shop.owner)}`);
    }
  });

  [
    "Port",
    "Legendary Cave",
    "Kairo Room",
    "Job Center",
  ].forEach((facilityName) => {
    add(
      facilityName,
      `/houses?tab=facilities&facilityTab=map&search=${encodeURIComponent(facilityName)}`,
    );
  });

  add("Master Smithy", "/houses?tab=facilities&facilityTab=map");
  add("Novel", `/equipment-stats?search=${encodeURIComponent("F/ Novel")}`);
  add("Weapon Shop", "/shops/weapon-shop");
  add("Weapons Shop", "/shops/weapon-shop");
  add("Armor Shop", "/shops/armor-shop");
  add("Accessory Shop", "/shops/accessory-shop");
  add("Acc shop", "/shops/accessory-shop");
  add("Furniture shop", "/shops/furniture-shop");
  add("Item shop", "/shops/item-shop");
  add("Skill shop", "/shops/skill-shop");
  add("Restaurant", "/shops/restaurant");
  add("Item", "/shops/item-shop");
  add("Armor", "/shops/armor-shop");
  add("Weekly Conquest", "/weekly-conquest");
  add("Friend Post Office", "/houses?tab=facilities&facilityTab=map&search=Friend%20Post%20Office");
  add("Wooden Stick", "/equipment-stats?search=Wooden%20Stick");
  add("Magic Pendant", "/equipment-stats?search=Magic%20Pendant");
  add("Leather Armor", "/equipment-stats?search=Leather%20Armor");
  add("Mage's Hat", "/equipment-stats?search=Mage%27s%20Hat");
  add("Mage’s Hat", "/equipment-stats?search=Mage%E2%80%99s%20Hat");
  add("Lightning Staff", "/equipment-stats?search=Lightning%20Staff");
  add("Ninja Headband", "/equipment-stats?search=Ninja%20Headband");
  add("Craftsmanship V", "/skills");
  add("Stove", "/houses?tab=facilities&search=Stove");
  add("Simple Stove", "/houses?tab=facilities&search=Simple%20Stove");
  add("Bonfire", "/houses?tab=facilities&search=Bonfire");
  add("Kitchen Shelf", "/houses?tab=facilities&search=Kitchen%20Shelf");
  add("Cooking Counter", "/houses?tab=facilities&search=Cooking%20Counter");

  return Array.from(links.entries())
    .map(([label, href]) => ({ label, href }))
    .sort((a, b) => b.label.length - a.label.length);
}

const GUIDE_LINKS = buildGuideLinks();
const PROTECTED_PHRASES: ProtectedPhrase[] = [
  { phrase: "Royal Room", blockedLabels: ["royal"] },
  { phrase: "Master Smithy", blockedLabels: ["smithy"] },
  { phrase: "Friend Post Office", blockedLabels: ["friend", "post", "office"] },
  { phrase: "Weekly Conquest", blockedLabels: ["weekly", "conquest"] },
  { phrase: "Weapon Shop", blockedLabels: ["weapon"] },
  { phrase: "Armor Shop", blockedLabels: ["armor"] },
  { phrase: "Item Shop", blockedLabels: ["item"] },
  { phrase: "Weapon Sample", blockedLabels: ["weapon"] },
  { phrase: "Armor Sample", blockedLabels: ["armor"] },
  { phrase: "Accessory Sample", blockedLabels: ["accessory"] },
  { phrase: "Skill Sample", blockedLabels: ["skill"] },
  { phrase: "Mage's Potion", blockedLabels: ["mage"] },
  { phrase: "Mage’s Potion", blockedLabels: ["mage"] },
];
const GUIDE_LINK_PATTERN =
  GUIDE_LINKS.length > 0
    ? new RegExp(`(^|[^A-Za-z0-9/])(${GUIDE_LINKS.map((link) => escapeRegex(link.label)).join("|")})(?=$|[^A-Za-z0-9])`, "gi")
    : null;

function parseGuide(markdown: string): ParsedGuide {
  const normalized = markdown.replace(/\r/g, "");
  const imageMap: Record<string, string> = {};

  for (const match of normalized.matchAll(/^\[image(?<id>\d+)\]:\s*<data:image\/(?<ext>[a-zA-Z0-9.+-]+);base64,[^>]+>/gm)) {
    const id = match.groups?.id;
    const rawExt = match.groups?.ext;
    if (!id || !rawExt) continue;
    const ext = rawExt === "jpeg" ? "jpg" : rawExt;
    imageMap[`image${id}`] = `/guides/images/image${id}.${ext}`;
  }

    // 1. Parse explicit image definitions (local markdown)
    const cleaned = normalized.replace(/^\[image\d+\]:\s*<data:image\/[^>]+$/gm, "");

    // 2. Auto-map missing image refs to .png if not defined (for Google Doc markdown)
    const referencedImages = Array.from(normalized.matchAll(/!\[\]\[(image\d+)\]/g)).map((m) => m[1]);
    for (const imageId of referencedImages) {
      if (!imageMap[imageId]) {
        imageMap[imageId] = `/guides/images/${imageId}.png`;
      }
    }

  const lines = cleaned.split("\n");
  const sections: GuideSection[] = [];
  let current: GuideSection | null = null;

  for (const rawLine of lines) {
    const line = rawLine.replace(/\\!/g, "!").replace(/\\#/g, "#");
    const headingMatch = line.match(/^(#{1,2})\s+(.+)$/);

    if (headingMatch) {
      const level = headingMatch[1].length as 1 | 2;
      const title = headingMatch[2].trim();
      current = {
        id: slugify(title),
        title,
        level,
        lines: [],
      };
      sections.push(current);
      continue;
    }

    if (!current) {
      current = {
        id: "overview",
        title: "Overview",
        level: 1,
        lines: [],
      };
      sections.push(current);
    }

    current.lines.push(line);
  }

  return {
    imageMap,
    sections: sections.filter((section) => section.lines.join("").trim() || section.title),
  };
}

function renderInlineContent(text: string) {
  const markdownLinks = Array.from(text.matchAll(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g)).map((match) => ({
    label: match[1],
    url: match[2],
    start: match.index ?? 0,
    end: (match.index ?? 0) + match[0].length,
  })) as MarkdownLinkMatch[];

  if (!GUIDE_LINK_PATTERN && markdownLinks.length === 0) return text;

  const parts: ReactNode[] = [];
  let lastIndex = 0;

  const pushMarkdownLinkAwareText = (segment: string, segmentStart: number) => {
    if (!GUIDE_LINK_PATTERN) {
      parts.push(segment);
      return;
    }

    let innerLastIndex = 0;
    for (const match of segment.matchAll(GUIDE_LINK_PATTERN)) {
      const prefix = match[1] ?? "";
      const fullMatch = match[2];
      const rawMatchStart = match.index ?? 0;
      const matchIndex = rawMatchStart + prefix.length;
      const absoluteMatchIndex = segmentStart + matchIndex;
      const lowerLabel = fullMatch.toLowerCase();
      const href = GUIDE_LINKS.find((link) => link.label.toLowerCase() === lowerLabel)?.href;

      if (!href) continue;

      const blockedByPhrase = PROTECTED_PHRASES.some(({ phrase, blockedLabels }) => {
        if (!blockedLabels.includes(lowerLabel)) return false;
        const phraseIndex = segment.toLowerCase().indexOf(phrase.toLowerCase());
        return phraseIndex !== -1 && matchIndex >= phraseIndex && matchIndex < phraseIndex + phrase.length;
      });

      if (blockedByPhrase) continue;

      if (rawMatchStart > innerLastIndex) {
        parts.push(segment.slice(innerLastIndex, rawMatchStart));
      }

      if (prefix) parts.push(prefix);

      parts.push(
        <a
          key={`${fullMatch}-${absoluteMatchIndex}`}
          href={href}
          className="font-medium text-primary underline underline-offset-4"
        >
          {fullMatch}
        </a>,
      );

      innerLastIndex = rawMatchStart + prefix.length + fullMatch.length;
    }

    if (innerLastIndex < segment.length) {
      parts.push(segment.slice(innerLastIndex));
    }
  };

  for (const mdLink of markdownLinks) {
    if (mdLink.start > lastIndex) {
      pushMarkdownLinkAwareText(text.slice(lastIndex, mdLink.start), lastIndex);
    }

    parts.push(
      <a
        key={`${mdLink.label}-${mdLink.start}`}
        href={mdLink.url}
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium text-primary underline underline-offset-4"
      >
        {mdLink.label}
      </a>,
    );
    lastIndex = mdLink.end;
  }

  if (lastIndex < text.length) {
    pushMarkdownLinkAwareText(text.slice(lastIndex), lastIndex);
  }

  return parts.length > 0 ? parts : text;
}

function renderLine(line: string, index: number, imageMap: Record<string, string>) {
  const trimmed = line.trim();

  if (!trimmed) {
    return <div key={index} className="h-2" />;
  }

  const imageRefs = Array.from(trimmed.matchAll(/!\[\]\[(image\d+)\]/g)).map((match) => match[1]);
  if (imageRefs.length > 0) {
    return (
      <div key={index} className="flex flex-wrap gap-3 py-2">
        {imageRefs.map((imageId) => {
          const src = imageMap[imageId];
          if (!src) return null;
          return (
            <a
              key={imageId}
              href={src}
              target="_blank"
              rel="noopener noreferrer"
              className="block overflow-hidden rounded-xl border border-border bg-muted/20 shadow-sm"
            >
              <img
                src={src}
                alt={imageId}
                className="max-h-80 w-auto max-w-full object-contain"
                loading="lazy"
              />
            </a>
          );
        })}
      </div>
    );
  }

  if (/^[-*]\s+/.test(trimmed)) {
    return (
      <li key={index} className="ml-5 list-disc text-sm leading-7 text-foreground/95">
        {renderInlineContent(trimmed.replace(/^[-*]\s+/, ""))}
      </li>
    );
  }

  if (/^\d+\)\s+/.test(trimmed) || /^\d+\.\s+/.test(trimmed)) {
    return (
      <li key={index} className="ml-5 list-decimal text-sm leading-7 text-foreground/95">
        {renderInlineContent(trimmed.replace(/^\d+[.)]\s+/, ""))}
      </li>
    );
  }

  return (
    <p key={index} className="text-sm leading-7 text-foreground/95 whitespace-pre-wrap">
      {renderInlineContent(trimmed)}
    </p>
  );
}

export default function PlaythroughGuidePage() {
  const [markdown, setMarkdown] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadGuide() {
      try {
        setLoading(true);
        setError(null);
        // Try to fetch Google Doc as markdown (exported)
        const googleDocUrl = `https://docs.google.com/document/d/${PLAYTHROUGH_GUIDE_DOC_ID}/export?format=md`;
        let fetchedMarkdown = "";
        let usedGoogleDoc = false;
        try {
          const response = await fetch(googleDocUrl);
          if (response.ok) {
            const text = await response.text();
            // Only use if it contains markdown headings and image refs
            if (/^#|^##|!\[\]\[image\d+\]/m.test(text)) {
              fetchedMarkdown = text;
              usedGoogleDoc = true;
            }
          }
        } catch {}

        if (!usedGoogleDoc) {
          // Fallback to local markdown
          const fallback = await fetch(PLAYTHROUGH_GUIDE_LOCAL_URL);
          if (!fallback.ok) throw new Error(`Guide request failed with ${fallback.status}`);
          fetchedMarkdown = await fallback.text();
        }
        if (!cancelled) {
          setMarkdown(fetchedMarkdown);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load guide");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadGuide();

    return () => {
      cancelled = true;
    };
  }, []);

  const parsedGuide = useMemo(() => parseGuide(markdown), [markdown]);
  const sections = parsedGuide.sections;
  const toc = sections.filter((section) => section.level <= 2);

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <BookOpenText className="w-5 h-5 text-muted-foreground" />
          <h1 className="text-xl font-bold tracking-tight">Playthrough Guide by Jaza</h1>
        </div>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Website-styled first pass of the community playthrough guide. This version is intentionally text-first so we
          can keep the page stable while we build the later live Google Doc source.
        </p>
        <div className="flex flex-wrap gap-2">
          <a
            href={`https://docs.google.com/document/d/${PLAYTHROUGH_GUIDE_DOC_ID}/edit`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button variant="outline" className="gap-2">
              <ExternalLink className="w-4 h-4" />
              Open Google Doc
            </Button>
          </a>
        </div>
      </div>

      {loading ? (
        <Card>
          <CardContent className="flex items-center gap-3 py-10 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading guide...
          </CardContent>
        </Card>
      ) : error ? (
        <Card>
          <CardContent className="py-10 space-y-2">
            <div className="font-medium">Could not load the guide.</div>
            <p className="text-sm text-muted-foreground">{error}</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
            <aside className="hidden lg:block lg:w-72 lg:shrink-0 lg:self-start lg:sticky lg:top-20">
              <Card className="max-h-[calc(100vh-7rem)] overflow-hidden flex flex-col">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Table of Contents</CardTitle>
                  <CardDescription className="text-xs">
                    Generated from the guide headings so we can preserve structure as the source changes later.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-1 overflow-y-auto flex-1 min-h-0">
                  {toc.map((section) => (
                    <a
                      key={section.id}
                      href={`#${section.id}`}
                      className={`block rounded-md px-2 py-1.5 text-sm hover:bg-muted/50 ${
                        section.level === 2 ? "ml-3 text-muted-foreground" : ""
                      }`}
                    >
                      {section.title}
                    </a>
                  ))}
                </CardContent>
              </Card>
            </aside>

            <div className="min-w-0 flex-1 space-y-4">
              {sections.map((section) => {
                const overlay = PLAYTHROUGH_GUIDE_SECTION_OVERLAYS[section.title];
                return (
                  <Card key={section.id} id={section.id}>
                    <CardContent className="p-5 md:p-7 space-y-4">
                      {section.level === 1 ? (
                        <h2 className="text-2xl font-bold tracking-tight">{section.title}</h2>
                      ) : (
                        <h3 className="text-xl font-semibold tracking-tight">{section.title}</h3>
                      )}

                      {overlay ? (
                        <Card className="border-primary/20 bg-primary/5">
                          <CardHeader className="pb-2">
                            <CardTitle className="text-sm">{overlay.title}</CardTitle>
                            <CardDescription className="text-xs leading-relaxed">
                              {overlay.description}
                            </CardDescription>
                          </CardHeader>
                          <CardContent>
                            <Link href={overlay.href}>
                              <Button size="sm" variant="outline">{overlay.cta}</Button>
                            </Link>
                          </CardContent>
                        </Card>
                      ) : null}

                      <div className="space-y-2">
                        {section.lines.map((line, index) => renderLine(line, index, parsedGuide.imageMap))}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
          <div className="lg:hidden">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Table of Contents</CardTitle>
                <CardDescription className="text-xs">
                  Generated from the guide headings so we can preserve structure as the source changes later.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-1">
                {toc.map((section) => (
                  <a
                    key={`mobile-${section.id}`}
                    href={`#${section.id}`}
                    className={`block rounded-md px-2 py-1.5 text-sm hover:bg-muted/50 ${
                      section.level === 2 ? "ml-3 text-muted-foreground" : ""
                    }`}
                  >
                    {section.title}
                  </a>
                ))}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
