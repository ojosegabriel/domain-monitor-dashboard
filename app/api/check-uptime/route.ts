import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  // 1. Segurança: Verifica se a chamada veio do Cron da Vercel ou se é um teste manual
  const authHeader = request.headers.get('authorization');
  if (process.env.NODE_ENV === 'production' && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createClient();

  try {
    // 2. Buscar todos os domínios ativos para monitoramento
    const { data: domains, error: domainsError } = await supabase
      .from("domains")
      .select("*, profiles(whatsapp_number, twilio_sid, twilio_token, twilio_from)");

    if (domainsError) throw domainsError;

    const results = [];

    // 3. Loop para verificar cada domínio
    for (const domain of domains) {
      const startTime = Date.now();
      let status: "online" | "offline" = "offline";
      let responseTime = 0;

      try {
        const response = await fetch(domain.url, {
          method: "GET",
          next: { revalidate: 0 }, // Força a não usar cache
          headers: { "User-Agent": "DomainMonitor/1.0" },
          signal: AbortSignal.timeout(10000) // 10s timeout
        });
        
        responseTime = Date.now() - startTime;
        status = (response.status >= 200 && response.status < 300) ? "online" : "offline";
      } catch (err) {
        status = "offline";
      }

      // 4. Registrar Log e Atualizar Domínio
      await supabase.from("uptime_logs").insert({
        user_id: domain.user_id,
        domain_id: domain.id,
        status,
        response_time: responseTime,
        checked_at: new Date().toISOString(),
      });

      await supabase.from("domains").update({ 
        status, 
        response_time: responseTime,
        last_checked_at: new Date().toISOString() 
      }).eq("id", domain.id);

      // 5. Se estiver OFFLINE, dispara o WhatsApp usando os dados do Profile
      if (status === "offline" && domain.profiles?.twilio_sid) {
        const p = domain.profiles;
        try {
          const auth = Buffer.from(`${p.twilio_sid}:${p.twilio_token}`).toString('base64');
          await fetch(`https://api.twilio.com/2010-04-01/Accounts/${p.twilio_sid}/Messages.json`, {
            method: 'POST',
            headers: {
              'Authorization': `Basic ${auth}`,
              'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
              To: p.whatsapp_number.startsWith('whatsapp:' ) ? p.whatsapp_number : `whatsapp:${p.whatsapp_number}`,
              From: p.twilio_from.startsWith('whatsapp:') ? p.twilio_from : `whatsapp:${p.twilio_from}`,
              Body: `🚨 *ALERTA TCC* 🚨\n\nO site *${domain.url}* caiu!\nVerificado em: ${new Date().toLocaleString('pt-BR')}`
            }).toString()
          });
        } catch (wsError) {
          console.error("Erro Twilio:", wsError);
        }
      }

      results.push({ url: domain.url, status });
    }

    return NextResponse.json({ message: "Check completed", results });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Mantemos o POST para compatibilidade com o botão manual do Dashboard
export async function POST(request: Request) {
  return GET(request);
}
