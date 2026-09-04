"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Sidebar() {
  const pathname = usePathname();

  const items = [
    {
      name: "Overview",
      href: "/dashboard",
      icon: "⌂",
    },
    {
      name: "Refunds",
      href: "/dashboard",
      icon: "↻",
    },
  ];

  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-slate-200 bg-white lg:flex lg:flex-col">

      {/* Logo */}

      <div className="flex h-20 items-center border-b border-slate-100 px-6">

        <Link
          href="/dashboard"
          className="flex items-center gap-3"
        >

          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-950 text-sm font-bold text-white">
            R
          </div>

          <div>
            <p className="font-semibold tracking-tight text-slate-950">
              Refund Assister
            </p>

            <p className="text-xs text-slate-400">
              Refund management
            </p>
          </div>

        </Link>

      </div>

      {/* Navigation */}

      <div className="flex-1 px-4 py-6">

        <p className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">
          Workspace
        </p>

        <nav className="space-y-1">

          {items.map((item) => {

            const active =
              pathname === item.href ||
              (item.href === "/dashboard" &&
                pathname.startsWith("/refunds"));

            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                  active
                    ? "bg-slate-100 text-slate-950"
                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-950"
                }`}
              >

                <span className="flex w-5 justify-center text-base">
                  {item.icon}
                </span>

                {item.name}

              </Link>
            );
          })}

        </nav>

        <p className="mb-3 mt-8 px-3 text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">
          Account
        </p>

        <Link
          href="#"
          className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-500 transition hover:bg-slate-50 hover:text-slate-950"
        >
          <span className="flex w-5 justify-center">
            ⚙
          </span>

          Settings
        </Link>

      </div>

      {/* Bottom CTA */}

      <div className="border-t border-slate-100 p-4">

        <Link
          href="/refunds/new"
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
        >
          <span className="text-lg leading-none">
            +
          </span>

          New Refund
        </Link>

      </div>

    </aside>
  );
}