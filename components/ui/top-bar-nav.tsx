"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ROUTES } from "@/lib/routes";

const NAV_ITEMS = [
  { href: ROUTES.DASHBOARD, label: "Siparişler", matchExact: true },
  { href: ROUTES.PRICE_CHANGES, label: "Zamlananlar", matchExact: false },
] as const;

export function TopBarNav() {
  const pathname = usePathname();
  return (
    <nav className="flex items-center gap-1 text-sm">
      {NAV_ITEMS.map((item) => {
        const isActive = item.matchExact
          ? pathname === item.href
          : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={`rounded-md px-2.5 py-1.5 transition-colors ${
              isActive
                ? "bg-slate-100 font-medium text-slate-900"
                : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
