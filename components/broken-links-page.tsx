"use client"

import { useMemo, useState } from "react"
import { Search, Link as LinkIcon, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { Domain } from "@/lib/types"

type ScanMode = "distinct" | "all"

type BrokenItem = {
  page_url: string
  link_url: string
  link_text: string | null
  status_code: number | null
  server_response: string
}

type ScanResponse = {
  ok: true
  domainId: string
  startUrl: string
  mode: ScanMode
  pagesScanned: number
  linksChecked: number
  brokenFound: number
  results: BrokenItem[]
}

export function BrokenLinksPage({ domains }: { domains: Domain[] }) {
  const [selectedDomainId, setSelectedDomainId] = useState<string>(domains?.[0]?.id ?? "")
  const [mode, setMode] = useState<ScanMode>("distinct")
  const [maxPages, setMaxPages] = useState<number>(20)
  const [maxLinks, setMaxLinks] = useState<number>(50)

  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<ScanResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [search, setSearch] = useState("")

  const filtered = useMemo(() => {
    const items = data?.results ?? []
    const q = search.trim().toLowerCase()
    if (!q) return items
    return items.filter((x) =>
      (x.link_url || "").toLowerCase().includes(q) ||
      (x.page_url || "").toLowerCase().includes(q) ||
      (x.link_text || "").toLowerCase().includes(q) ||
      (x.server_response || "").toLowerCase().includes(q)
    )
  }, [data, search])

  async function runScan() {
    if (!selectedDomainId) return
    setLoading(true)
    setError(null)
    setData(null)

    try {
      const res = await fetch(`/api/domains/${selectedDomainId}/broken-links/scan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, maxPages, maxLinks }),
      })

      const json = await res.json().catch(() => null)

      if (!res.ok || !json?.ok) {
        setError(json?.error || `Erro ao escanear (status ${res.status})`)
        setLoading(false)
        return
      }

      setData(json as ScanResponse)
    } catch (e: any) {
      setError(e?.message || "Erro desconhecido")
    } finally {
      setLoading(false)
    }
  }

  const domainOptions = domains ?? []

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-foreground">Broken Links</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Escaneie páginas do seu site e encontre links quebrados (404/timeout/etc).
        </p>
      </div>

      {/* Controls */}
      <Card className="border-border shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-semibold text-foreground">Scan settings</CardTitle>
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

          <div className="md:col-span-3">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Mode</label>
            <select
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
              value={mode}
              onChange={(e) => setMode(e.target.value as ScanMode)}
            >
              <option value="distinct">Distinct (unique links)</option>
              <option value="all">All occurrences</option>
            </select>
          </div>

          <div className="md:col-span-2">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Max pages</label>
            <Input
              type="number"
              value={maxPages}
              onChange={(e) => setMaxPages(Number(e.target.value || 0))}
            />
          </div>

          <div className="md:col-span-2">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Max links/page</label>
            <Input
              type="number"
              value={maxLinks}
              onChange={(e) => setMaxLinks(Number(e.target.value || 0))}
            />
          </div>

          <div className="md:col-span-1 flex items-end">
            <Button
              onClick={runScan}
              disabled={loading || !selectedDomainId}
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Scanning
                </span>
              ) : (
                "Scan"
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Summary */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="border-border shadow-sm">
          <CardContent className="pt-6">
            <div className="text-xs text-muted-foreground">Pages scanned</div>
            <div className="mt-1 text-2xl font-bold">{data?.pagesScanned ?? "—"}</div>
          </CardContent>
        </Card>
        <Card className="border-border shadow-sm">
          <CardContent className="pt-6">
            <div className="text-xs text-muted-foreground">Links checked</div>
            <div className="mt-1 text-2xl font-bold">{data?.linksChecked ?? "—"}</div>
          </CardContent>
        </Card>
        <Card className="border-border shadow-sm">
          <CardContent className="pt-6">
            <div className="text-xs text-muted-foreground">Broken found</div>
            <div className="mt-1 text-2xl font-bold">{data?.brokenFound ?? "—"}</div>
          </CardContent>
        </Card>
        <Card className="border-border shadow-sm">
          <CardContent className="pt-6">
            <div className="text-xs text-muted-foreground">Start URL</div>
            <div className="mt-1 truncate text-sm text-foreground">{data?.startUrl ?? "—"}</div>
          </CardContent>
        </Card>
      </div>

      {/* Errors */}
      {error && (
        <Card className="border-border shadow-sm">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              <div>
                <div className="font-semibold">Scan failed</div>
                <div className="text-sm opacity-90">{error}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      <Card className="border-border shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-lg font-semibold text-foreground">
              Broken links list
            </CardTitle>

            <div className="relative max-w-sm flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search broken links..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
        </CardHeader>

        <CardContent className="px-0 pb-0">
          <div className="hidden border-b border-border px-6 pb-3 md:grid md:grid-cols-12 md:gap-4">
            <p className="col-span-4 text-xs font-medium uppercase tracking-wider text-muted-foreground">Broken link</p>
            <p className="col-span-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">Found on page</p>
            <p className="col-span-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">Link text</p>
            <p className="col-span-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Response</p>
          </div>

          <div className="divide-y divide-border">
            {filtered.map((item, idx) => (
              <div
                key={`${item.page_url}-${item.link_url}-${idx}`}
                className="grid grid-cols-1 gap-2 px-6 py-4 transition-colors hover:bg-muted/50 md:grid-cols-12 md:items-center md:gap-4"
              >
                <div className="col-span-4 flex items-center gap-2">
                  <LinkIcon className="h-4 w-4 text-muted-foreground" />
                  <a
                    href={item.link_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="truncate text-sm font-medium text-foreground hover:underline"
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
                    className="truncate text-sm text-muted-foreground hover:underline"
                    title={item.page_url}
                  >
                    {item.page_url}
                  </a>
                </div>

                <div className="col-span-3">
                  <span className="truncate text-sm text-muted-foreground" title={item.link_text ?? ""}>
                    {item.link_text || "—"}
                  </span>
                </div>

                <div className="col-span-2 flex items-center gap-2">
                  {item.status_code ? (
                    <AlertTriangle className="h-4 w-4 text-destructive" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-destructive" />
                  )}
                  <span className="text-sm text-muted-foreground">
                    {item.server_response}
                  </span>
                </div>
              </div>
            ))}

            {!loading && (data?.results?.length ?? 0) === 0 && (
              <div className="flex flex-col items-center justify-center py-12">
                <div className="flex items-center gap-2 text-foreground">
                  <CheckCircle2 className="h-5 w-5 text-success" />
                  <span className="font-semibold">No broken links found (in preview)</span>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  Rode um scan para ver resultados aqui.
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
