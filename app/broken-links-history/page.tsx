"use client"

import { useEffect, useMemo, useState } from "react"
import { Search, Trash2, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { Domain } from "@/lib/types"

type BrokenLink = {
  id: string
  page_url: string
  link_url: string
  link_text: string | null
  status_code: number | null
  server_response: string
  is_resolved: boolean
  created_at: string
}

export function BrokenLinksHistoryPage({ domains }: { domains: Domain[] }) {
  const [selectedDomainId, setSelectedDomainId] = useState<string>(domains?.[0]?.id ?? "")
  const [loading, setLoading] = useState(false)
  const [links, setLinks] = useState<BrokenLink[]>([])
  const [search, setSearch] = useState("")
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "resolved">("active")
  const [deleting, setDeleting] = useState<string | null>(null)

  // ✅ Carregar broken links
  useEffect(() => {
    if (!selectedDomainId) return

    const fetchLinks = async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/domains/${selectedDomainId}/broken-links/history`)
        const data = await res.json()
        if (data.ok) {
          setLinks(data.results || [])
        }
      } catch (e) {
        console.error("Erro ao carregar broken links:", e)
      } finally {
        setLoading(false)
      }
    }

    fetchLinks()
  }, [selectedDomainId])

  // ✅ Filtrar links
  const filtered = useMemo(() => {
    let items = links

    // Filtrar por status
    if (filterStatus === "active") {
      items = items.filter(x => !x.is_resolved)
    } else if (filterStatus === "resolved") {
      items = items.filter(x => x.is_resolved)
    }

    // Filtrar por busca
    const q = search.trim().toLowerCase()
    if (q) {
      items = items.filter(x =>
        (x.link_url || "").toLowerCase().includes(q) ||
        (x.page_url || "").toLowerCase().includes(q) ||
        (x.link_text || "").toLowerCase().includes(q) ||
        (x.server_response || "").toLowerCase().includes(q)
      )
    }

    return items
  }, [links, search, filterStatus])

  // ✅ Deletar broken link
  async function deleteLink(linkId: string) {
    setDeleting(linkId)
    try {
      const res = await fetch(`/api/broken-link-occurrences/${linkId}`, {
        method: "DELETE",
      })

      if (res.ok) {
        setLinks(links.filter(x => x.id !== linkId))
      }
    } catch (e) {
      console.error("Erro ao deletar:", e)
    } finally {
      setDeleting(null)
    }
  }

  // ✅ Marcar como resolvido
  async function markResolved(linkId: string) {
    try {
      const res = await fetch(`/api/broken-link-occurrences/${linkId}/mark-fixed`, {
        method: "POST",
      })

      if (res.ok) {
        setLinks(
          links.map(x =>
            x.id === linkId ? { ...x, is_resolved: true } : x
          )
        )
      }
    } catch (e) {
      console.error("Erro ao marcar como resolvido:", e)
    }
  }

  const domainOptions = domains ?? []
  const activeCount = links.filter(x => !x.is_resolved).length
  const resolvedCount = links.filter(x => x.is_resolved).length

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-foreground">Broken Links History</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Visualize todos os broken links encontrados e marque como resolvido.
        </p>
      </div>

      {/* Filtros */}
      <Card className="border-border shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-semibold text-foreground">Filters</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-12">
          <div className="md:col-span-4">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Domain</label>
            <select
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
              value={selectedDomainId}
              onChange={(e) => setSelectedDomainId(e.target.value)}
            >
              {domainOptions.length === 0 && <option value="">No domains</option>}
              {domainOptions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} — {d.url}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-4">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Status</label>
            <select
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as any)}
            >
              <option value="all">All</option>
              <option value="active">Active ({activeCount})</option>
              <option value="resolved">Resolved ({resolvedCount})</option>
            </select>
          </div>

          <div className="md:col-span-4">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Search</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search broken links..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Estatísticas */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-border shadow-sm">
          <CardContent className="pt-6">
            <div className="text-xs text-muted-foreground">Total Broken Links</div>
            <div className="mt-1 text-2xl font-bold">{links.length}</div>
          </CardContent>
        </Card>
        <Card className="border-border shadow-sm">
          <CardContent className="pt-6">
            <div className="text-xs text-muted-foreground">Active</div>
            <div className="mt-1 text-2xl font-bold text-destructive">{activeCount}</div>
          </CardContent>
        </Card>
        <Card className="border-border shadow-sm">
          <CardContent className="pt-6">
            <div className="text-xs text-muted-foreground">Resolved</div>
            <div className="mt-1 text-2xl font-bold text-success">{resolvedCount}</div>
          </CardContent>
        </Card>
      </div>

      {/* Lista */}
      <Card className="border-border shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-semibold text-foreground">
            Broken Links ({filtered.length})
          </CardTitle>
        </CardHeader>

        <CardContent className="px-0 pb-0">
          <div className="hidden border-b border-border px-6 pb-3 md:grid md:grid-cols-12 md:gap-4">
            <p className="col-span-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">Link</p>
            <p className="col-span-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">Found on</p>
            <p className="col-span-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Response</p>
            <p className="col-span-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Status</p>
            <p className="col-span-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Actions</p>
          </div>

          <div className="divide-y divide-border">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12">
                <CheckCircle2 className="h-5 w-5 text-success" />
                <span className="mt-2 font-semibold text-foreground">No broken links found</span>
              </div>
            ) : (
              filtered.map((item) => (
                <div
                  key={item.id}
                  className={`grid grid-cols-1 gap-2 px-6 py-4 transition-colors hover:bg-muted/50 md:grid-cols-12 md:items-center md:gap-4 ${
                    item.is_resolved ? "opacity-50" : ""
                  }`}
                >
                  <div className="col-span-3 flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
                    <a
                      href={item.link_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="truncate text-sm font-medium text-foreground hover:underline break-all"
                      title={item.link_url}
                    >
                      {item.link_url}
                    </a>
                  </div>

                  <div className="col-span-3">
                    <a
                      href={item.page_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-muted-foreground hover:underline break-all"
                      title={item.page_url}
                    >
                      {item.page_url}
                    </a>
                  </div>

                  <div className="col-span-2">
                    <span className="text-sm text-muted-foreground">
                      {item.server_response}
                    </span>
                  </div>

                  <div className="col-span-2">
                    {item.is_resolved ? (
                      <div className="flex items-center gap-2 text-success">
                        <CheckCircle2 className="h-4 w-4" />
                        <span className="text-xs font-medium">Resolved</span>
                      </div>
                    ) : (
                      <span className="text-xs font-medium text-destructive">Active</span>
                    )}
                  </div>

                  <div className="col-span-2 flex items-center gap-2">
                    {!item.is_resolved && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => markResolved(item.id)}
                          className="text-xs"
                        >
                          Mark resolved
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => deleteLink(item.id)}
                          disabled={deleting === item.id}
                          className="text-destructive hover:text-destructive"
                        >
                          {deleting === item.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      </>
                    )}
                    {item.is_resolved && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => deleteLink(item.id)}
                        disabled={deleting === item.id}
                        className="text-destructive hover:text-destructive"
                      >
                        {deleting === item.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
