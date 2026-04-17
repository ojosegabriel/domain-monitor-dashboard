"use client"

import { Activity, LayoutDashboard, Link2Off, Bell, Settings, LogOut, History } from "lucide-react"
import { cn } from "@/lib/utils"

interface DashboardSidebarProps {
  activeTab: string
  onTabChange: (tab: string) => void
  onLogout: () => void
}

const navItems = [
  { id: "dashboard", label: "Home", icon: LayoutDashboard },
  { id: "broken-links", label: "Broken Links", icon: Link2Off },
  { id: "broken-links-history", label: "Broken Links History", icon: History },
  { id: "alerts", label: "Alert History", icon: Bell },
  { id: "settings", label: "Settings", icon: Settings },
]

export function DashboardSidebar({ activeTab, onTabChange, onLogout }: DashboardSidebarProps) {
  return (
    <aside className="flex h-screen w-64 flex-col bg-[hsl(215,28%,14%)] text-[hsl(210,20%,80%)]">
      {/* Logo */}
      <div className="flex items-center gap-3 px-6 py-6">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[hsl(217,72%,50%)]">
          <Activity className="h-5 w-5 text-[hsl(0,0%,100%)]" />
        </div>
        <span className="text-lg font-bold tracking-tight text-[hsl(0,0%,100%)]">UptimeGuard</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4">
        <ul className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive = activeTab === item.id

            return (
              <li key={item.id}>
                <button
                  onClick={() => onTabChange(item.id)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-[hsl(217,72%,50%)] text-[hsl(0,0%,100%)]"
                      : "text-[hsl(210,20%,70%)] hover:bg-[hsl(215,25%,20%)] hover:text-[hsl(0,0%,100%)]"
                  )}
                >
                  <Icon className="h-4.5 w-4.5" />
                  {item.label}
                </button>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* Footer */}
      <div className="border-t border-[hsl(215,20%,22%)] px-3 py-4">
        <button
          onClick={onLogout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-[hsl(210,20%,60%)] transition-colors hover:bg-[hsl(215,25%,20%)] hover:text-[hsl(0,0%,100%)]"
        >
          <LogOut className="h-4.5 w-4.5" />
          Logout
        </button>
      </div>
    </aside>
  )
}
