import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { domainId, url } = await request.json();

  if (!domainId || !url) {
    return NextResponse.json({ error: "Missing domainId or url" }, { status: 400 });
  }

  try {
    const startTime = Date.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

    let status: "online" | "offline" = "offline";
    let responseTime = 0;
    
    try {
      const response = await fetch(url, {
        method: "GET",
        signal: controller.signal,
        cache: "no-store",
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; DomainMonitor/1.0;)",
        },
      });
      
      responseTime = Date.now() - startTime;
      // Consideramos offline se o status não for 2xx (ex: 404, 500, etc)
      status = (response.status >= 200 && response.status < 300) ? "online" : "offline";
    } catch (err: any) {
      // Se cair aqui, é um erro de rede (DNS, Timeout, Conexão Recusada)
      console.error(`Network error for ${url}:`, err.message);
      status = "offline";
    } finally {
      clearTimeout(timeoutId);
    }

    const last_check = new Date().toISOString();

    // 1. Registrar o log de uptime
    await supabase.from("uptime_logs").insert({
      user_id: user.id,
      domain_id: domainId,
      status,
      response_time: responseTime,
      checked_at: last_check,
    });

    // 2. Calcular o uptime real (baseado em todos os logs existentes para o domínio)
    const { data: allLogs } = await supabase
      .from("uptime_logs")
      .select("status")
      .eq("domain_id", domainId);

    let uptime = 100;
    if (allLogs && allLogs.length > 0) {
      const onlineCount = allLogs.filter(l => l.status === "online").length;
      uptime = parseFloat(((onlineCount / allLogs.length) * 100).toFixed(1));
    }

    // 3. Atualizar o status e o uptime real no banco de dados
    const { error: updateError } = await supabase
      .from("domains")
      .update({ 
        status, 
        uptime,
        response_time: responseTime,
        last_checked_at: last_check 
      })
      .eq("id", domainId)
      .eq("user_id", user.id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }
    
    if (status === "offline") {
      const { data: profile } = await supabase
        .from("profiles")
        .select("whatsapp_number, twilio_sid, twilio_token, twilio_from")
        .eq("id", user.id)
        .single();

      if (profile?.twilio_sid && profile?.twilio_token && profile?.whatsapp_number) {
        try {
          const auth = Buffer.from(`${profile.twilio_sid}:${profile.twilio_token}`).toString('base64');
          const body = new URLSearchParams({
            To: profile.whatsapp_number.startsWith('whatsapp:') ? profile.whatsapp_number : `whatsapp:${profile.whatsapp_number}`,
            From: profile.twilio_from.startsWith('whatsapp:') ? profile.twilio_from : `whatsapp:${profile.twilio_from}`,
            Body: `🚨 *ALERTA: Domínio Offline* 🚨\n\nO site *${url}* está fora do ar!\nVerificado em: ${new Date(last_check).toLocaleString()}`
          });

          await fetch(`https://api.twilio.com/2010-04-01/Accounts/${profile.twilio_sid}/Messages.json`, {
            method: 'POST',
            headers: {
              'Authorization': `Basic ${auth}`,
              'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: body.toString( )
          });
          console.log("Twilio WhatsApp alert sent!");
        } catch (wsError) {
          console.error("Failed to send Twilio alert:", wsError);
        }
      }
    }


    return NextResponse.json({ status, last_check, uptime, response_time: responseTime });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
