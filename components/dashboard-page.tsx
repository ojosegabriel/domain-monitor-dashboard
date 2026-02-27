"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Plus, Search, Menu, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { DashboardSidebar } from "@/components/dashboard-sidebar"
import { SummaryCards } from "@/components/summary-cards"
import { DomainList } from "@/components/domain-list"
import { UptimeChart } from "@/components/uptime-chart"
import { AddDomainModal } from "@/components/add-domain-modal"
import { EditDomainModal } from "@/components/edit-domain-modal"
import { AlertHistory } from "@/components/alert-history"
import { SettingsPage } from "@/components/settings-page"
import { BrokenLinksPage } from "@/components/broken-links-page"
import type { Domain, Alert, Profile, UptimeDataPoint } from "@/lib/types"
import type { User } from "@supabase/supabase-js"
import { uptimeChartData } from "@/lib/mock-data"

interface DashboardPageProps {
  user: User
  profile: Profile | null
  initialDomains: Domain[]
  initialAlerts: Alert[]
}

export function DashboardPage({ user, profile, initialDomains, initialAlerts }: DashboardPageProps) {
  const [activeTab, setActiveTab] = useState("dashboard")
  const [domains, setDomains] = useState<Domain[]>(initialDomains)
  const [alerts] = useState<Alert[]>(initialAlerts)
  const [uptimeData, setUptimeData] = useState<UptimeDataPoint[]>([])
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [selectedDomain, setSelectedDomain] = useState<Domain | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const router = useRouter()

  // Efeito para verificar o status dos domínios ao carregar
  useEffect(() => {
    if (domains.length > 0) {
      domains.forEach((domain) => {
        checkDomainStatus(domain.id, domain.url)
      })
    }
    fetchUptimeStatus()
  }, [])

  async function fetchUptimeStatus() {
    try {
      const response = await fetch("/api/status/uptime-24h")
      const data = await response.json()
      if (Array.isArray(data)) {
        setUptimeData(data)
      }
    } catch (error) {
      console.error("Error fetching uptime status:", error)
    }
  }

  async function checkDomainStatus(domainId: string, url: string) {
    try {
      const response = await fetch("/api/check-uptime", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domainId, url }),
      })
      const data = await response.json()

      if (data.status) {
        setDomains((prev) =>
          prev.map((d) =>
            d.id === domainId ? { ...d, status: data.status, uptime: data.uptime, last_checked_at: data.last_check } : d

          )
        )
      }
    } catch (error) {
      console.error("Error checking domain status:", error)
    }
  }

  const filteredDomains = useMemo(() => {
    const q = searchQuery.toLowerCase()
    return domains.filter(
      (d) => d.name.toLowerCase().includes(q) || d.url.toLowerCase().includes(q)
    )
  }, [domains, searchQuery])

  const displayName = profile?.full_name || user.email || "User"
  const initials = displayName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)
    

  async function handleAddDomain(name: string, url: string, checkInterval: number) {
    const supabase = createClient()
    const fullUrl = url.startsWith("http" ) ? url : `https://${url}`

    const { data, error } = await supabase
      .from("domains")
      .insert({
        user_id: user.id,
        name,
        url: fullUrl,
        check_interval: checkInterval,
        status: "offline",
        uptime: 100,
        response_time: 0,
      })
      .select()
      .single()

    if (!error && data) setDomains((prev) => [data, ...prev])
    checkDomainStatus(data.id, data.url)
  }

  async function handleEditDomain(id: string, name: string, url: string, checkInterval: number) {
    const supabase = createClient()
    const fullUrl = url.startsWith("http") ? url : `https://${url}`

    const { data, error } = await supabase
      .from("domains")
      .update({ name, url: fullUrl, check_interval: checkInterval })
      .eq("id", id)
      .select()
      .single()
    
    if (!error && data) {
      setDomains((prev) => prev.map((d) => (d.id === id ? data : d)))
      checkDomainStatus(data.id, data.url)
    }
  }

  async function handleDeleteDomain(id: string) {
    const supabase = createClient()
    const { error } = await supabase.from("domains").delete().eq("id", id)
    if (!error) setDomains((prev) => prev.filter((d) => d.id !== id))
  }

  function openEditDomainModal(domain: Domain) {
    setSelectedDomain(domain)
    setEditModalOpen(true)
  }

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/auth/login")
  }

  function renderContent() {
    switch (activeTab) {
      case "broken-links":
        return <BrokenLinksPage domains={domains} />

      case "alerts":
        return <AlertHistory alerts={alerts} />

      case "settings":
        return <SettingsPage user={user} profile={profile} />

      case "dashboard":
      default:
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-foreground">Dashboard</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Overview of all your monitored domains and their status.
              </p>
            </div>

            <SummaryCards domains={domains} />

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative max-w-sm flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search domains..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>

              <Button
                onClick={() => setAddModalOpen(true)}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                <Plus className="mr-2 h-4 w-4" />
                Add Domain
              </Button>
            </div>

            <DomainList domains={filteredDomains} onDelete={handleDeleteDomain} onEdit={openEditDomainModal} />

            <UptimeChart data={uptimeChartData} />
          </div>
        )
    }
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {mobileSidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-[hsl(0,0%,0%)]/50 lg:hidden"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      <div
        className={`fixed inset-y-0 left-0 z-50 transform transition-transform lg:static lg:translate-x-0 ${
          mobileSidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <DashboardSidebar
          activeTab={activeTab}
          onTabChange={(tab) => {
            setActiveTab(tab)
            setMobileSidebarOpen(false)
          }}
          onLogout={handleLogout}
        />
      </div>

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-card px-4 lg:px-6">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="text-foreground lg:hidden"
              onClick={() => setMobileSidebarOpen(!mobileSidebarOpen)}
            >
              {mobileSidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              <span className="sr-only">Toggle sidebar</span>
            </Button>

            <span className="text-sm font-medium text-muted-foreground">
              {activeTab === "dashboard" && "Dashboard"}
              {activeTab === "broken-links" && "Broken Links"}
              {activeTab === "alerts" && "Alert History"}
              {activeTab === "settings" && "Settings"}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-muted-foreground sm:inline">{displayName}</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
              {initials}
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 lg:p-6">{renderContent()}</main>
      </div>

           <AddDomainModal open={addModalOpen} onOpenChange={setAddModalOpen} onAdd={handleAddDomain} />
      <EditDomainModal
        open={editModalOpen}
        onOpenChange={setEditModalOpen}
        domain={selectedDomain}
        onEdit={(id, name, url, checkInterval) => handleEditDomain(id, name, url, checkInterval)}
      />
    </div>
  )
}
