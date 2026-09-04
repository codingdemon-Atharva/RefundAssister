import Sidebar from "@/src/components/Sidebar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#f7f8fa]">

      <Sidebar />

      <div className="lg:pl-64">

        {/* Top Navigation */}

        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200 bg-white/95 px-6 backdrop-blur">

          <div>
            <p className="text-sm font-medium text-slate-500">
              Refund Assister
            </p>
          </div>

          <div className="flex items-center gap-5">

            {/* Notification */}

            <button
              className="relative text-slate-400 transition hover:text-slate-700"
              aria-label="Notifications"
            >
              <span className="text-lg">
                ♢
              </span>

              <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-blue-500" />
            </button>

            {/* Profile */}

            <div className="flex items-center gap-2">

              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-950 text-xs font-semibold text-white">
                A
              </div>

              <span className="hidden text-sm font-medium text-slate-700 sm:block">
                Atharva
              </span>

              <span className="text-xs text-slate-400">
                ▼
              </span>

            </div>

          </div>

        </header>

        {children}

      </div>

    </div>
  );
}