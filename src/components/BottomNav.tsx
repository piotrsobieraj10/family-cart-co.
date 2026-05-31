import { Link, useRouterState } from "@tanstack/react-router";
import { ListChecks, Plus, History, Home, Settings } from "lucide-react";

const items = [
  { to: "/", label: "Lista", icon: ListChecks },
  { to: "/add", label: "Dodaj", icon: Plus },
  { to: "/history", label: "Historia", icon: History },
  { to: "/household", label: "Dom", icon: Home },
  { to: "/settings", label: "Ustawienia", icon: Settings },
] as const;

export function BottomNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 bg-card/95 backdrop-blur border-t border-border pb-[env(safe-area-inset-bottom)]">
      <ul className="grid grid-cols-5 max-w-md mx-auto">
        {items.map(({ to, label, icon: Icon }) => {
          const active = pathname === to;
          const isAdd = to === "/add";
          return (
            <li key={to} className="flex">
              <Link
                to={to}
                className={`flex-1 flex flex-col items-center justify-center gap-1 py-2.5 text-[11px] font-medium transition-colors ${
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <span
                  className={`flex items-center justify-center ${
                    isAdd
                      ? "w-11 h-11 rounded-full bg-primary text-primary-foreground shadow-md -mt-5"
                      : "w-6 h-6"
                  }`}
                >
                  <Icon className={isAdd ? "w-6 h-6" : "w-5 h-5"} />
                </span>
                {!isAdd && <span>{label}</span>}
                {isAdd && <span className="text-primary">{label}</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}