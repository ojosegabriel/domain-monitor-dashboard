"use client"

import { Bell } from "lucide-react"
import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"

interface NotificationBellProps {
  userId: string
}

export function NotificationBell({ userId }: NotificationBellProps) {
  const [unreadCount, setUnreadCount] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const supabase = createClient()
  const router = useRouter()

  useEffect(() => {
    // Buscar alertas não lidos
    const fetchUnreadAlerts = async () => {
      try {
        const { data, error } = await supabase
          .from("alerts")
          .select("id", { count: "exact" })
          .eq("user_id", userId)
          .eq("is_read", false)
          .is("deleted_at", null)

        if (!error && data) {
          setUnreadCount(data.length)
        }
      } catch (err) {
        console.error("Erro ao buscar alertas não lidos:", err)
      } finally {
        setIsLoading(false)
      }
    }

    fetchUnreadAlerts()

    // Subscribe para atualizações em tempo real
    const subscription = supabase
      .channel(`alerts-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "alerts",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          // Recarregar contagem quando houver mudanças
          fetchUnreadAlerts()
        }
      )
      .subscribe()

    return () => {
      subscription.unsubscribe()
    }
  }, [userId, supabase])

  return (
    <button
      onClick={() => router.push("/dashboard?tab=alerts")}
      className="relative inline-flex items-center justify-center p-2 rounded-lg hover:bg-muted transition-colors"
      aria-label="Notificações"
    >
      <Bell className="h-5 w-5 text-foreground" />
      
      {/* Badge com número de notificações não lidas */}
      {unreadCount > 0 && (
        <span className="absolute top-0 right-0 inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-white transform translate-x-1/2 -translate-y-1/2 bg-red-600 rounded-full">
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      )}
    </button>
  )
}
