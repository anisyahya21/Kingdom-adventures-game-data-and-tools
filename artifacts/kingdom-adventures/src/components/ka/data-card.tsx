import type React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type DataCardProps = {
  title: React.ReactNode;
  action?: React.ReactNode;
  meta?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
};

export function DataCard({ title, action, meta, children, className, contentClassName }: DataCardProps) {
  return (
    <Card className={cn("flex flex-col", className)}>
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-sm font-semibold leading-tight">{title}</CardTitle>
          {action}
        </div>
        {meta}
      </CardHeader>
      <CardContent className={cn("px-4 pb-4", contentClassName)}>
        {children}
      </CardContent>
    </Card>
  );
}
