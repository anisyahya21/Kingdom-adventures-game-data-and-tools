import type React from "react";
import { cn } from "@/lib/utils";
import { useLocation } from "wouter";
import { ToolIdentityArtwork, getToolArtworkKey } from "./tool-identity";

type PageHeaderProps = {
  icon?: React.ReactNode;
  title: React.ReactNode;
  children?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  artworkKey?: string;
};

export function PageHeader({ icon, title, children, actions, className, artworkKey }: PageHeaderProps) {
  const [location] = useLocation();
  const identity = artworkKey ?? getToolArtworkKey(location);
  return (
    <header className={cn("space-y-1", className)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {identity ? <span className="shrink-0" aria-hidden="true"><ToolIdentityArtwork artworkKey={identity} /></span> : icon && <span className="text-muted-foreground">{icon}</span>}
          <h1 className="text-xl font-bold tracking-tight">{title}</h1>
        </div>
        {actions}
      </div>
      {children && (
        <div className="max-w-4xl space-y-2 text-sm leading-relaxed text-muted-foreground">
          {children}
        </div>
      )}
    </header>
  );
}
