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
      .select("*");

    if (domainsError) throw domainsError;

    const results = [];

    // 3. Loop para verificar cada domínio
    for (const domain of domains) {
      const startTime = Date.now();
      let status: "online" | "offline" = "offline";
      let responseTime = 0;
      let previousStatus = domain.status; // Guardar status anterior para comparação

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

      // 4. Registrar Log PRIMEIRO
      const { error: logError } = await supabase.from("uptime_logs").insert({
        user_id: domain.user_id,
        domain_id: domain.id,
        status,
        response_time: responseTime,
        checked_at: new Date().toISOString(),
      });

      if (logError) {
        console.error(`Error inserting log for ${domain.url}:`, logError);
      }

      // Aguardar um pouco para garantir que o log foi salvo no banco
      await new Promise(resolve => setTimeout(resolve, 100));

      // 5. CALCULAR UPTIME REAL baseado em TODOS os logs (incluindo o que acabou de ser salvo)
      const { data: allLogs, error: logsError } = await supabase
        .from("uptime_logs")
        .select("status")
        .eq("domain_id", domain.id);

      let uptimePercentage = 100;
      if (allLogs && allLogs.length > 0) {
        const onlineCount = allLogs.filter(log => log.status === "online").length;
        uptimePercentage = parseFloat(((onlineCount / allLogs.length) * 100).toFixed(1));
      }

      // 6. Atualizar o domínio com status, uptime real e tempo de resposta
      const { error: updateError } = await supabase.from("domains").update({ 
        status, 
        uptime: uptimePercentage,
        response_time: responseTime,
        last_checked_at: new Date().toISOString() 
      }).eq("id", domain.id);

      if (updateError) {
        console.error(`Error updating domain ${domain.url}:`, updateError);
      }

      // 7. CRIAR ALERTA APENAS SE O STATUS MUDOU
      let alertMessage = "";
      let alertType: "down" | "up" | "slow" = "down";
      let shouldSendWhatsApp = false;

      // Se mudou de ONLINE para OFFLINE
      if (previousStatus === "online" && status === "offline") {
        alertMessage = `🚨 Site fora do ar! O domínio ${domain.url} caiu.`;
        alertType = "down";
        shouldSendWhatsApp = true; // ✅ ENVIAR WHATSAPP APENAS NESTE CASO
      }
      // Se mudou de OFFLINE para ONLINE (recuperado)
      else if (previousStatus === "offline" && status === "online") {
        alertMessage = `✅ Site recuperado! O domínio ${domain.url} está online novamente.`;
        alertType = "up";
        shouldSendWhatsApp = false; // Não enviar WhatsApp para recuperação
      }
      // Se está muito lento (response time > 5s)
      else if (status === "online" && responseTime > 5000) {
        alertMessage = `⚠️ Site lento! O domínio ${domain.url} levou ${responseTime}ms para responder.`;
        alertType = "slow";
        shouldSendWhatsApp = false; // Não enviar WhatsApp para sites lentos
      }

      // 8. SALVAR ALERTA no banco de dados (apenas se houver mudança)
      if (alertMessage) {
        const { error: alertError } = await supabase.from("alerts").insert({
          user_id: domain.user_id,
          domain_id: domain.id,
          type: alertType,
          message: alertMessage,
          created_at: new Date().toISOString(),
        });

        if (alertError) {
          console.error(`Error inserting alert for ${domain.url}:`, alertError);
        }
      }

      // 9. ENVIAR WHATSAPP APENAS UMA VEZ (quando status muda de online para offline)
      if (shouldSendWhatsApp && domain.user_id) {
        // Buscar credenciais do Twilio
        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("whatsapp_number, twilio_sid, twilio_token, twilio_from")
          .eq("id", domain.user_id)
          .single();

        if (profile?.twilio_sid && profile?.twilio_token) {
          const p = profile;
          try {
            console.log(`🚀 Sending WhatsApp alert for ${domain.url}`);
            
            const auth = Buffer.from(`${p.twilio_sid}:${p.twilio_token}`).toString('base64');
            const whatsappTo = p.whatsapp_number.startsWith('whatsapp:') 
              ? p.whatsapp_number 
              : `whatsapp:${p.whatsapp_number}`;
            const whatsappFrom = p.twilio_from.startsWith('whatsapp:') 
              ? p.twilio_from 
              : `whatsapp:${p.twilio_from}`;

            const twilioResponse = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${p.twilio_sid}/Messages.json`, {
              method: 'POST',
              headers: {
                'Authorization': `Basic ${auth}`,
                'Content-Type': 'application/x-www-form-urlencoded'
              },
              body: new URLSearchParams({
                To: whatsappTo,
                From: whatsappFrom,
                Body: `🚨 *ALERTA TCC* 🚨\n\nO site *${domain.url}* caiu!\nVerificado em: ${new Date().toLocaleString('pt-BR')}\nUptime: ${uptimePercentage}%`
              }).toString()
            });

            if (!twilioResponse.ok) {
              const errorText = await twilioResponse.text();
              console.error(`❌ Twilio error for ${domain.url}:`, twilioResponse.status, errorText);
            } else {
              console.log(`✅ WhatsApp alert sent successfully for ${domain.url}`);
            }
          } catch (wsError) {
            console.error("❌ Erro ao enviar Twilio:", wsError);
          }
        } else {
          console.warn(`⚠️ Twilio credentials missing for user ${domain.user_id}`);
        }
      }

      results.push({ url: domain.url, status, uptime: uptimePercentage });
    }

    return NextResponse.json({ 
      message: "Check completed successfully", 
      results,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error("Error in check-uptime:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Mantemos o POST para compatibilidade com o botão manual do Dashboard
export async function POST(request: Request) {
  return GET(request);
}
