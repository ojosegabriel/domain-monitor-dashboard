import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import tls from 'tls';

// Função interna para checar SSL (Simples e Direta)
async function checkSSL(url: string): Promise<string | null> {
  try {
    const hostname = new URL(url).hostname;
    return new Promise((resolve) => {
      const socket = tls.connect(443, hostname, { servername: hostname, timeout: 5000 }, () => {
        const cert = socket.getPeerCertificate();
        socket.end();
        resolve(cert?.valid_to ? new Date(cert.valid_to).toISOString() : null);
      });
      socket.on('error', () => resolve(null));
      socket.on('timeout', () => { socket.destroy(); resolve(null); });
    });
  } catch { return null; }
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (process.env.NODE_ENV === 'production' && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createClient();

  try {
    const { data: domains, error: domainsError } = await supabase
      .from("domains")
      .select("*, profiles(whatsapp_number, twilio_sid, twilio_token, twilio_from)");

    if (domainsError) throw domainsError;

    for (const domain of domains) {
      const startTime = Date.now();
      let status: "online" | "offline" = "offline";
      let responseTime = 0;
      let sslExpiry: string | null = null;

      // 1. Check Uptime
      try {
        const response = await fetch(domain.url, { method: "GET", next: { revalidate: 0 }, signal: AbortSignal.timeout(10000) });
        responseTime = Date.now() - startTime;
        status = (response.status >= 200 && response.status < 300) ? "online" : "offline";
      } catch { status = "offline"; }

      // 2. Check SSL (Apenas se for HTTPS)
      if (domain.url.startsWith('https://' )) {
        sslExpiry = await checkSSL(domain.url);
      }

      // 3. Salvar no Banco
      await supabase.from("uptime_logs").insert({
        user_id: domain.user_id, domain_id: domain.id, status, response_time: responseTime, checked_at: new Date().toISOString()
      });

      await supabase.from("domains").update({ 
        status, response_time: responseTime, ssl_expiry_date: sslExpiry, last_checked_at: new Date().toISOString() 
      }).eq("id", domain.id);

      // 4. Alerta WhatsApp (Se offline ou SSL expirando em 7 dias)
      if (domain.profiles?.twilio_sid && domain.profiles?.twilio_token) {
        const p = domain.profiles;
        let msg = "";

        if (status === "offline") {
          msg = `🚨 *ALERTA TCC: SITE FORA* 🚨\n\nO site *${domain.url}* caiu!\nVerificado em: ${new Date().toLocaleString('pt-BR')}`;
        } else if (sslExpiry) {
          const days = Math.ceil((new Date(sslExpiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
          if (days <= 7 && days > 0) {
            msg = `🔒 *AVISO SSL* 🔒\n\nO certificado de *${domain.url}* expira em ${days} dias!\nData: ${new Date(sslExpiry).toLocaleDateString('pt-BR')}`;
          }
        }

        if (msg) {
          try {
            const auth = Buffer.from(`${p.twilio_sid}:${p.twilio_token}`).toString('base64');
            await fetch(`https://api.twilio.com/2010-04-01/Accounts/${p.twilio_sid}/Messages.json`, {
              method: 'POST',
              headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
              body: new URLSearchParams({
                To: p.whatsapp_number.startsWith('whatsapp:' ) ? p.whatsapp_number : `whatsapp:${p.whatsapp_number}`,
                From: p.twilio_from.startsWith('whatsapp:') ? p.twilio_from : `whatsapp:${p.twilio_from}`,
                Body: msg
              }).toString()
            });
          } catch (e) { console.error("Erro Twilio:", e); }
        }
      }
    }
    return NextResponse.json({ message: "Monitoramento SSL/Uptime concluído" });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) { return GET(request); }
