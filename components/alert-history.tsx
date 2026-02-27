"use client"

import { AlertTriangle, CheckCircle2, Clock } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import type { Alert } from "@/lib/types"

interface AlertHistoryProps {
  alerts: Alert[]
}

function formatDate(isoString: string) {
  const date = new Date(isoString)
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
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
          <CardTitle className="text-lg font-semibold text-foreground">Recent Alerts</CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          {alerts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <CheckCircle2 className="mb-3 h-8 w-8 text-success" />
              <p className="text-sm text-muted-foreground">No alerts yet. All domains are looking good!</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {alerts.map((alert) => (
                <div key={alert.id} className="flex items-start gap-4 px-6 py-4 transition-colors hover:bg-muted/50">
                  <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                    alert.type === "down" || alert.type === "slow" ? "bg-destructive/10" : "bg-success/10"
                  }`}>
                    {alert.type === "down" || alert.type === "slow" ? (
                      <AlertTriangle className="h-4 w-4 text-destructive" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4 text-success" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">{alert.domains?.name ?? "Unknown"}</span>
                      <Badge
                        className={
                          alert.type === "down" || alert.type === "slow"
                            ? "border-transparent bg-destructive/15 text-destructive"
                            : "border-transparent bg-success/15 text-success"
                        }
                      >
                        {alert.type === "down" ? "Down" : alert.type === "slow" ? "Slow" : "Recovered"}
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
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
