import type { ReactNode } from "react";
import { BottomNav } from "./BottomNav";

export function AppShell({
  title,
  right,
  children,
}: {
  title: string;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen pb-24 bg-background">
      <header className="sticky top-0 z-30 bg-background/90 backdrop-blur border-b border-border">
        <div className="max-w-md mx-auto px-4 h-14 flex items-center justify-between">
          <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
          <div className="flex items-center gap-2">{right}</div>
        </div>
      </header>
      <main className="max-w-md mx-auto px-4 py-4">{children}</main>
      <BottomNav />
    </div>
  );
}
