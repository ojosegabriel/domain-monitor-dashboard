"use client"

import { useEffect, useState } from "react"
import { MoreHorizontal, Pencil, Trash2, ExternalLink } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { Domain } from "@/lib/types"

interface DomainListProps {
  domains: Domain[]
  onDelete: (id: string) => void
  onEdit: (domain: Domain) => void
}


function formatDateSafe(isoString?: string | null) {
  if (!isoString) return "—"
  const d = new Date(isoString)
  if (Number.isNaN(d.getTime())) return "—"

  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  const hh = String(d.getHours()).padStart(2, "0")
  const min = String(d.getMinutes()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`
}

export function DomainList({ domains, onDelete, onEdit }: DomainListProps) {
  
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  if (!mounted) {
    return (
      <Card className="border-border shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-semibold text-foreground">Dominios Monitorados</CardTitle>
        </CardHeader>
        <CardContent className="px-6 pb-6">
          <p className="text-sm text-muted-foreground">Loading...</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-border shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-semibold text-foreground">Dominios Monitorados</CardTitle>
      </CardHeader>
      <CardContent className="px-0 pb-0">
        {/* Table header */}
        <div className="hidden border-b border-border px-6 pb-3 md:grid md:grid-cols-12 md:gap-4">
          <p className="col-span-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">Dominio</p>
          <p className="col-span-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">URL</p>
          <p className="col-span-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">Status</p>
          <p className="col-span-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Uptime</p>
          <p className="col-span-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Última Verificação</p>
          <p className="col-span-1 text-xs font-medium uppercase tracking-wider text-muted-foreground sr-only">Ações</p>
        </div>

        {/* Table rows */}
        <div className="divide-y divide-border">
          {domains.map((domain) => (
            <div
              key={domain.id}
              className="grid grid-cols-1 gap-2 px-6 py-4 transition-colors hover:bg-muted/50 md:grid-cols-12 md:items-center md:gap-4"
            >
              <div className="col-span-3 flex items-center gap-2">
                <div
                  className={`h-2 w-2 rounded-full ${
                    domain.status === "online" ? "bg-success" : "bg-destructive"
                  }`}
                />
                <span className="font-medium text-foreground">{domain.name}</span>
              </div>
              <div className="col-span-3 flex items-center gap-1">
                <span className="truncate text-sm text-muted-foreground">{domain.url}</span>
                <a
                  href={domain.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 text-muted-foreground hover:text-primary"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  <span className="sr-only">Visit {domain.name}</span>
                </a>
              </div>
              <div className="col-span-1">
                <Badge
                  className={
                    domain.status === "online"
                      ? "border-transparent bg-success/15 text-success hover:bg-success/20"
                      : "border-transparent bg-destructive/15 text-destructive hover:bg-destructive/20"
                  }
                >
                  {domain.status === "online" ? "Online" : "Offline"}
                </Badge>
              </div>
              <div className="col-span-2">
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full rounded-full ${
                        domain.uptime >= 99
                          ? "bg-success"
                          : domain.uptime >= 95
                            ? "bg-warning"
                            : "bg-destructive"
                      }`}
                      style={{ width: `${domain.uptime}%` }}
                    />
                  </div>
                  <span className="text-sm font-medium text-foreground">{domain.uptime}%</span>
                </div>
              </div>
              <div className="col-span-2">
                <span className="text-sm text-muted-foreground">
                  {formatDateSafe(domain.last_checked_at)}
                </span>
              </div>
              <div className="col-span-1 flex justify-end">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-foreground"
                    >
                      <MoreHorizontal className="h-4 w-4" />
                      <span className="sr-only">Actions for {domain.name}</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem className="gap-2" onClick={() => onEdit(domain)}>
                      <Pencil className="h-4 w-4" />
                      Editar
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="gap-2 text-destructive"
                      onClick={() => onDelete(domain.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                      Deletar
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          ))}
        </div>

        {domains.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12">
            <p className="text-sm text-muted-foreground">
              No domains found. Add your first domain to start monitoring.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
