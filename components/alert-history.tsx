"use client"

import { AlertTriangle, CheckCircle2, Clock, AlertCircle } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import type { Alert } from "@/lib/types"

interface AlertHistoryProps {
  alerts: Alert[]
}

function formatDate(isoString: string) {
  const date = new Date(isoString)
  return date.toLocaleString("pt-BR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

// Função para mapear alert_type para badge e ícone
function getAlertTypeInfo(alertType: string) {
  switch (alertType) {
    case "offline":
    case "down":
      return {
        label: "Offline",
        color: "bg-destructive/15 text-destructive",
        icon: AlertTriangle,
      }
    case "online":
    case "up":
      return {
        label: "Online",
        color: "bg-success/15 text-success",
        icon: CheckCircle2,
      }
    case "ssl_expiry":
      return {
        label: "SSL Expiring",
        color: "bg-warning/15 text-warning",
        icon: AlertCircle,
      }
    case "slow":
      return {
        label: "Slow",
        color: "bg-yellow-500/15 text-yellow-600",
        icon: AlertTriangle,
      }
    default:
      return {
        label: "Alert",
        color: "bg-muted/15 text-muted-foreground",
        icon: AlertCircle,
      }
  }
}

export function AlertHistory({ alerts }: AlertHistoryProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-foreground">Alert History</h2>
        <p className="mt-1 text-sm text-muted-foreground">Review recent alerts and incidents for your monitored domains.</p>
      </div>
      <Card className="border-border shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-semibold text-foreground">
            Recent Alerts ({alerts.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          {alerts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <CheckCircle2 className="mb-3 h-8 w-8 text-success" />
              <p className="text-sm text-muted-foreground">No alerts yet. All domains are looking good!</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {alerts.map((alert) => {
                // ✅ CORRIGIDO: Usar alert_type ao invés de type
                const alertType = alert.alert_type || alert.type || "alert"
                const typeInfo = getAlertTypeInfo(alertType)
                const IconComponent = typeInfo.icon

                return (
                  <div 
                    key={alert.id} 
                    className="flex items-start gap-4 px-6 py-4 transition-colors hover:bg-muted/50"
                  >
                    <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                      alertType === "offline" || alertType === "down" || alertType === "slow" 
                        ? "bg-destructive/10" 
                        : alertType === "ssl_expiry"
                        ? "bg-warning/10"
                        : "bg-success/10"
                    }`}>
                      <IconComponent className={`h-4 w-4 ${
                        alertType === "offline" || alertType === "down" || alertType === "slow"
                          ? "text-destructive"
                          : alertType === "ssl_expiry"
                          ? "text-warning"
                          : "text-success"
                      }`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-foreground">
                          {alert.domains?.name ?? "Unknown Domain"}
                        </span>
                        <Badge className={typeInfo.color}>
                          {typeInfo.label}
                        </Badge>
                      </div>
                      <p className="mt-0.5 text-sm text-muted-foreground">{alert.message}</p>
                      {alert.domains?.url && (
                        <p className="mt-1 text-xs text-muted-foreground">{alert.domains.url}</p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {formatDate(alert.created_at)}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
