"use client"

import { Globe, Wifi, WifiOff, TrendingUp } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import type { Domain } from "@/lib/types"

interface SummaryCardsProps {
  domains: Domain[]
}

export function SummaryCards({ domains }: SummaryCardsProps) {
  const totalDomains = domains.length
  const onlineDomains = domains.filter((d) => d.status === "online").length
  const offlineDomains = domains.filter((d) => d.status === "offline").length
  const avgUptime = domains.length > 0
    ? (domains.reduce((sum, d) => sum + d.uptime, 0) / domains.length).toFixed(1)
    : "0"

  const cards = [
    {
      title: "Total Dominios",
      value: totalDomains,
      icon: Globe,
      iconBg: "bg-primary/10",
      iconColor: "text-primary",
    },
    {
      title: "Online",
      value: onlineDomains,
      icon: Wifi,
      iconBg: "bg-success/10",
      iconColor: "text-success",
    },
    {
      title: "Offline",
      value: offlineDomains,
      icon: WifiOff,
      iconBg: "bg-destructive/10",
      iconColor: "text-destructive",
    },
    {
      title: "Avg. Uptime",
      value: `${avgUptime}%`,
      icon: TrendingUp,
      iconBg: "bg-primary/10",
      iconColor: "text-primary",
    },
  ]

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => {
        const Icon = card.icon
        return (
          <Card key={card.title} className="border-border shadow-sm">
            <CardContent className="flex items-center gap-4 p-5">
              <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${card.iconBg}`}>
                <Icon className={`h-5 w-5 ${card.iconColor}`} />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">{card.title}</p>
                <p className="text-2xl font-bold text-foreground">{card.value}</p>
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
