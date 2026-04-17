"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Plus, Search, Menu, X, AlertTriangle, CheckCircle } from "lucide-react"
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
import BrokenLinksHistoryPage from "@/app/broken-links-history/page"
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
    console.log(`Domínio ${url} será verificado pelo GitHub Actions`)
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
    const fullUrl = url.startsWith("http") ? url : `https://${url}`

    try {
      const { data, error } = await supabase
        .from("domains")
        .insert({
          user_id: user.id,
          name,
          url: fullUrl,
          check_interval: checkInterval,
          status: "online",
          uptime: 0,
          response_time: 0,
        })
        .select()
        .single()

      if (error) {
        console.error("Erro completo:", JSON.stringify(error, null, 2))
        console.error("Mensagem:", error?.message)
        console.error("Detalhes:", error?.details)
        console.error("Hint:", error?.hint)
        return
      }

      if (data) {
        setDomains((prev) => [data, ...prev])
        checkDomainStatus(data.id, data.url)
      }
    } catch (err) {
      console.error("Erro inesperado ao adicionar domínio:", err)
    }
  }

  async function handleEditDomain(id: string, name: string, url: string, checkInterval: number) {
    const supabase = createClient()
    const fullUrl = url.startsWith("http") ? url : `https://${url}`

    try {
      const { data, error } = await supabase
        .from("domains")
        .update({ name, url: fullUrl, check_interval: checkInterval })
        .eq("id", id)
        .select()
        .single()
      
      if (error) {
        console.error("Erro ao editar domínio:", error)
        return
      }

      if (data) {
        setDomains((prev) => prev.map((d) => (d.id === id ? data : d)))
        checkDomainStatus(data.id, data.url)
      }
    } catch (err) {
      console.error("Erro inesperado ao editar domínio:", err)
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

  // Função auxiliar para verificar se o SSL está expirando em breve (próximos 30 dias)
  function isSSLExpiringSoon(expiryDate: string | null): boolean {
    if (!expiryDate) return false
    const expiry = new Date(expiryDate)
    const now = new Date()
    const daysUntilExpiry = (expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    return daysUntilExpiry <= 30 && daysUntilExpiry > 0
  }

  // Função auxiliar para verificar se o SSL já expirou
  function isSSLExpired(expiryDate: string | null): boolean {
    if (!expiryDate) return false
    const expiry = new Date(expiryDate)
    const now = new Date()
    return expiry.getTime() < now.getTime()
  }

  // Função auxiliar para formatar a data
  function formatDate(dateString: string | null): string {
    if (!dateString) return "N/A"
    const date = new Date(dateString)
    return date.toLocaleDateString("pt-BR", { year: "numeric", month: "long", day: "numeric" })
  }

  function renderContent() {
    switch (activeTab) {
      case "broken-links":
        return <BrokenLinksPage domains={domains} />

      case "broken-links-history":
        return <BrokenLinksHistoryPage />

      case "alerts":
        return <AlertHistory alerts={alerts} />

      case "settings":
        return <SettingsPage profile={profile} />

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

            {/* Card de SSL - Exibido se houver domínios com informações de SSL */}
            {selectedDomain && selectedDomain.ssl_expiry_date && (
              <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    {isSSLExpired(selectedDomain.ssl_expiry_date) ? (
                      <AlertTriangle className="h-6 w-6 text-red-500 flex-shrink-0 mt-1" />
                    ) : isSSLExpiringSoon(selectedDomain.ssl_expiry_date) ? (
                      <AlertTriangle className="h-6 w-6 text-yellow-500 flex-shrink-0 mt-1" />
                    ) : (
                      <CheckCircle className="h-6 w-6 text-green-500 flex-shrink-0 mt-1" />
                    )}
                    <div>
                      <h3 className="text-lg font-semibold text-foreground">SSL Certificate Status</h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {selectedDomain.name}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="rounded-md bg-muted/50 p-3">
                    <p className="text-xs font-medium text-muted-foreground">Expiry Date</p>
                    <p className="mt-1 text-sm font-semibold text-foreground">
                      {formatDate(selectedDomain.ssl_expiry_date)}
                    </p>
                  </div>

                  <div className="rounded-md bg-muted/50 p-3">
                    <p className="text-xs font-medium text-muted-foreground">Status</p>
                    <p className="mt-1 text-sm font-semibold">
                      {isSSLExpired(selectedDomain.ssl_expiry_date) ? (
                        <span className="text-red-500">🔴 Expired</span>
                      ) : isSSLExpiringSoon(selectedDomain.ssl_expiry_date) ? (
                        <span className="text-yellow-500">🟡 Expiring Soon (30 days)</span>
                      ) : (
                        <span className="text-green-500">🟢 Valid</span>
                      )}
                    </p>
                  </div>
                </div>

                {isSSLExpired(selectedDomain.ssl_expiry_date) && (
                  <div className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-800 border border-red-200">
                    ⚠️ Your SSL certificate has expired. Please renew it immediately to maintain secure connections.
                  </div>
                )}

                {isSSLExpiringSoon(selectedDomain.ssl_expiry_date) && (
                  <div className="mt-4 rounded-md bg-yellow-50 p-3 text-sm text-yellow-800 border border-yellow-200">
                    ⚠️ Your SSL certificate will expire soon. Please renew it before the expiry date.
                  </div>
                )}
              </div>
            )}

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
        className={`fixed inset-y-0 left-0 z-50 w-64 transform transition-transform duration-200 ease-in-out lg:relative lg:translate-x-0 ${
          mobileSidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <DashboardSidebar 
          activeTab={activeTab} 
          onTabChange={setActiveTab}
          onLogout={handleLogout}
        />
      </div>

      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b border-border bg-card px-4 py-3 sm:px-6 lg:hidden">
          <h1 className="text-lg font-semibold text-foreground">UptimeGuard</h1>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMobileSidebarOpen(!mobileSidebarOpen)}
            className="text-foreground"
          >
            {mobileSidebarOpen ? (
              <X className="h-5 w-5" />
            ) : (
              <Menu className="h-5 w-5" />
            )}
          </Button>
        </div>

        <div className="flex flex-1 flex-col overflow-y-auto">
          <div className="flex items-center justify-between border-b border-border bg-card px-4 py-4 sm:px-6">
            <div className="flex-1" />
            <div className="flex items-center gap-4">
              <span className="text-sm font-medium text-foreground">{displayName}</span>
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                {initials}
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
            {renderContent()}
          </div>
        </div>
      </div>

      <AddDomainModal
        open={addModalOpen}
        onOpenChange={setAddModalOpen}
        onAdd={handleAddDomain}
      />

      <EditDomainModal
        open={editModalOpen}
        onOpenChange={setEditModalOpen}
        domain={selectedDomain}
        onEdit={handleEditDomain}
      />
    </div>
  )
}
