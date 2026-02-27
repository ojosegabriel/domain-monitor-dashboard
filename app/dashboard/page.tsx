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
    .order("created_at", { ascending: false })

  const { data: alerts } = await supabase
    .from("alerts")
    .select("*, domains(name, url)")
    .order("created_at", { ascending: false })
    .limit(20)

  return (
    <DashboardPage
      user={user}
      profile={profile}
      initialDomains={domains ?? []}
      initialAlerts={alerts ?? []}
    />
  )
}
