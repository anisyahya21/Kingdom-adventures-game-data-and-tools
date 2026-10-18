import type { ReactNode } from "react";

/** Keep help in the document even when collapsed; expanding never fetches it. */
export function ToolHelp({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details data-tool-help className="rounded-md border border-border bg-muted/10 text-sm">
      <summary className="cursor-pointer rounded-md px-3 py-2 font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">
        {title}
      </summary>
      <div className="space-y-2 px-3 pb-3 leading-relaxed text-muted-foreground">{children}</div>
    </details>
  );
}
