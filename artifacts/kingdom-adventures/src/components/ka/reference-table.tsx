
import type { ReactNode } from "react";
import { Link } from "wouter";
import { ArrowRight } from "lucide-react";

const toolCardClass = "group flex min-h-28 w-full items-center justify-between gap-4 rounded-lg border border-primary/35 bg-card px-4 py-3 text-left hover:border-primary hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function ReferenceToolCard({ label, description, href, onClick, disabled, icon }: {
  label: string; description?: string; href?: string; onClick?: () => void; disabled?: boolean; icon?: string;
}) {
  const content = <>
    {icon && <img src={icon} alt="" className="size-10 shrink-0 object-contain [image-rendering:pixelated]" />}
    <span className="flex-1"><span className="block font-semibold text-primary">{label}</span>
      {description && <span className="mt-1 block text-sm text-muted-foreground">{description}</span>}
    </span>
    <ArrowRight aria-hidden="true" className="size-4 shrink-0 text-primary" />
  </>;
  return href
    ? <Link href={href} className={toolCardClass}>{content}</Link>
    : <button type="button" onClick={onClick} disabled={disabled} className={toolCardClass + " disabled:opacity-50"}>{content}</button>;
}

export function ReferencePage({ title, actions, children }: {
  title: string;
  actions: { href: string; label: string; description?: string; icon?: string }[];
  children: ReactNode;
}) {
  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:py-8">
      <h1 className="mb-4 text-2xl font-semibold tracking-tight">{title}</h1>
      <nav aria-label={title + " tools"} className="mb-5 grid gap-3 sm:grid-cols-2">
        {actions.map((action) => <ReferenceToolCard key={action.href} {...action} />)}
      </nav>
      {children}
    </main>
  );
}

export const referenceSelectClass = "h-9 rounded-md border border-input bg-background px-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function ReferenceTable({ label, children, compact = false }: {
  label: string;
  children: ReactNode;
  compact?: boolean;
}) {
  return (
    <div
      role="region"
      aria-label={label}
      tabIndex={0}
      className="overflow-x-auto rounded-lg border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <table className={`w-full border-separate border-spacing-0 whitespace-nowrap text-left text-sm
        [&_td]:border-b [&_td]:border-border/60 [&_td]:px-3 [&_td]:py-2
        [&_th]:border-b [&_th]:border-border/60 [&_th]:px-3 [&_th]:py-2
        [&_thead_th]:sticky [&_thead_th]:top-0 [&_thead_th]:z-20 [&_thead_th]:bg-muted
        [&_tbody_tr]:bg-card [&_tbody_tr:nth-child(even)]:bg-muted/30
        [&_tbody_th]:sticky [&_tbody_th]:left-0 [&_tbody_th]:z-10 [&_tbody_th]:bg-card [&_tbody_th]:font-medium
        [&_thead_th:first-child]:left-0 [&_thead_th:first-child]:z-30
        ${compact ? "[&_td]:text-xs [&_th]:text-xs" : ""}`}>
        {children}
      </table>
    </div>
  );
}
