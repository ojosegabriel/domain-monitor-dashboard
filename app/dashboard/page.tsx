import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { DashboardPage } from "@/components/dashboard-page"

export default async function DashboardRoute() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect("/auth/login")
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single()

  const { data: domains } = await supabase
    .from("domains")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })

  // ✅ CORRIGIDO: Filtrar apenas alertas não lidos e não deletados
  const { data: alerts } = await supabase
    .from("alerts")
    .select("*, domains(name, url)")
    .eq("user_id", user.id)
    .eq("is_read", false)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(50)

  return (
    <DashboardPage
      user={user}
      profile={profile}
      initialDomains={domains ?? []}
      initialAlerts={alerts ?? []}
    />
  )
}
