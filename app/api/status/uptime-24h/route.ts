import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // pegar logs só das últimas 24h
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data: logs, error } = await supabase
      .from("uptime_logs")
      .select("status, checked_at")
      .eq("user_id", user.id)
      .gte("checked_at", twentyFourHoursAgo)
      .order("checked_at", { ascending: true });

    if (error) throw error;

    const stats: Record<string, { total: number; online: number }> = {};
    const now = new Date();
    
    // cria as 24h mesmo se não tiver dado (senão o gráfico quebra)
    for (let i = 23; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 60 * 60 * 1000);
      const hourKey = `${String(d.getHours()).padStart(2, "0")}:00`;
      stats[hourKey] = { total: 0, online: 0 };
    }

    // agrupa os logs por hora
    logs?.forEach((log) => {
      const date = new Date(log.checked_at);
      const hourKey = `${String(date.getHours()).padStart(2, "0")}:00`;
      
      if (stats[hourKey]) {
        stats[hourKey].total++;
        if (log.status === "online") {
          stats[hourKey].online++;
        }
      }
    });

    // monta no formato que o gráfico usa
    const chartData = Object.entries(stats).map(([hour, data]) => ({
      hour,
      uptime: data.total > 0
        ? parseFloat(((data.online / data.total) * 100).toFixed(1))
        : 100,
    }));

    return NextResponse.json(chartData);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}