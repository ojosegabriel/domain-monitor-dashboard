import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  // 1. Segurança: Verifica se a chamada tem o token correto
  const authHeader = request.headers.get("authorization");
  const tokenEsperado = `Bearer ${process.env.CRON_SECRET}`;

  if (process.env.NODE_ENV === "production" && authHeader !== tokenEsperado) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createClient();

  try {
    // 2. Buscar todos os domínios ativos para monitoramento
    const { data: domains, error: domainsError } = await supabase
      .from("domains")
      .select("*");

    if (domainsError) throw domainsError;
    if (!domains || domains.length === 0) {
      return NextResponse.json({ message: "Nenhum domínio para verificar" });
    }

    const results = [];

    // 3. Loop para verificar cada domínio
    for (const domain of domains) {
      let status = "online";
      let responseTime = 0;
      let sslExpiry: Date | null = null;

      try {
        // 3.1: Verificar se o site está online
        const startTime = Date.now();
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(domain.url, {
          method: "GET",
          signal: controller.signal,
          redirect: "follow",
        });

        clearTimeout(timeoutId);
        responseTime = Date.now() - startTime;

        // 3.2: Verificar status HTTP
        if (!response.ok) {
          status = "offline";
        }

        // 3.3: Verificar SSL (extrair data de expiração do certificado)
        if (domain.url.startsWith("https://")) {
          try {
            const urlObj = new URL(domain.url);
            const hostname = urlObj.hostname;

            // Usar a API do Supabase para verificar SSL
            const sslController = new AbortController();
            const sslTimeoutId = setTimeout(
              () => sslController.abort(),
              5000
            );

            const sslCheckResponse = await fetch(
              `https://ssl-api.com/api/v3/certinfo?host=${hostname}`,
              { signal: sslController.signal }
            );

            clearTimeout(sslTimeoutId);

            if (sslCheckResponse.ok) {
              const sslData = await sslCheckResponse.json();
              if (sslData.certs && sslData.certs[0]) {
                const certInfo = sslData.certs[0];
                sslExpiry = new Date(certInfo.not_after * 1000);
              }
            }
          } catch (sslError) {
            // Se falhar, continua sem SSL info
            console.log(`SSL check failed for ${domain.url}:`, sslError);
          }
        }
      } catch (error) {
        status = "offline";
        responseTime = 10000; // Timeout
        console.log(`Erro ao verificar ${domain.url}:`, error);
      }

      // 4. Salvar o log de verificação
      const { error: logError } = await supabase.from("uptime_logs").insert({
        user_id: domain.user_id,
        domain_id: domain.id,
        status,
        response_time: responseTime,
        checked_at: new Date().toISOString(),
      });

      if (logError) {
        console.error("Erro ao salvar log:", logError);
        continue;
      }

      // 4.1: IMPORTANTE - Aguardar um pouco para o banco processar o log
      await new Promise((resolve) => setTimeout(resolve, 200));

      // 5. Recalcular uptime DEPOIS de salvar o log
      const { data: allLogs, error: logsError } = await supabase
        .from("uptime_logs")
        .select("status")
        .eq("domain_id", domain.id);

      if (logsError) {
        console.error("Erro ao buscar logs:", logsError);
        continue;
      }

      // 5.1: Calcular uptime baseado em TODOS os logs
      let uptime = 100;
      if (allLogs && allLogs.length > 0) {
        const onlineCount = allLogs.filter((log) => log.status === "online")
          .length;
        uptime = Math.round((onlineCount / allLogs.length) * 100);
      }

      // 6. Atualizar o domínio com o novo uptime
      const { error: updateError } = await supabase
        .from("domains")
        .update({
          status,
          uptime,
          response_time: responseTime,
          last_checked_at: new Date().toISOString(),
          ssl_expiry_date: sslExpiry ? sslExpiry.toISOString() : null,
        })
        .eq("id", domain.id);

      if (updateError) {
        console.error("Erro ao atualizar domínio:", updateError);
        continue;
      }

      // 7. Se o status mudou para OFFLINE, enviar alerta
      if (status === "offline" && domain.status !== "offline") {
        // 7.1: Verificar se já existe alerta recente para este domínio
        const { data: recentAlerts, error: alertCheckError } = await supabase
          .from("alerts")
          .select("*")
          .eq("domain_id", domain.id)
          .eq("type", "down")
          .gte("created_at", new Date(Date.now() - 3600000).toISOString()); // Últimas 1 hora

        if (!alertCheckError && recentAlerts && recentAlerts.length === 0) {
          // 7.2: Salvar alerta no banco
          const alertMessage = `⚠️ Site ${domain.name} ficou OFFLINE!\nURL: ${domain.url}\nHorário: ${new Date().toLocaleString("pt-BR")}`;

          const { error: alertError } = await supabase
            .from("alerts")
            .insert({
              user_id: domain.user_id,
              domain_id: domain.id,
              type: "down",
              message: alertMessage,
              created_at: new Date().toISOString(),
            });

          if (alertError) {
            console.error("Erro ao salvar alerta:", alertError);
          } else {
            console.log(`✅ Alerta criado para ${domain.name}`);
          }

          // 7.3: Enviar WhatsApp (se configurado)
          const { data: profileData, error: profileError } = await supabase
            .from("profiles")
            .select("whatsapp_number, twilio_sid, twilio_token, twilio_from")
            .eq("id", domain.user_id)
            .single();

          if (!profileError && profileData) {
            const { whatsapp_number, twilio_sid, twilio_token, twilio_from } =
              profileData;

            if (whatsapp_number && twilio_sid && twilio_token && twilio_from) {
              try {
                const whatsappMessage = `⚠️ *ALERTA: Site Offline*\n\n🔴 ${domain.name} ficou offline!\n\n📍 URL: ${domain.url}\n⏰ ${new Date().toLocaleString("pt-BR")}\n\nVerifique seu dashboard para mais detalhes.`;

                const response = await fetch(
                  `https://api.twilio.com/2010-04-01/Accounts/${twilio_sid}/Messages.json`,
                  {
                    method: "POST",
                    headers: {
                      Authorization: `Basic ${Buffer.from(
                        `${twilio_sid}:${twilio_token}`
                      ).toString("base64")}`,
                      "Content-Type": "application/x-www-form-urlencoded",
                    },
                    body: new URLSearchParams({
                      From: twilio_from,
                      To: whatsapp_number,
                      Body: whatsappMessage,
                    }).toString(),
                  }
                );

                if (response.ok) {
                  console.log(
                    `✅ WhatsApp enviado para ${domain.name}`
                  );
                } else {
                  const errorData = await response.json();
                  console.error(
                    `❌ Erro ao enviar WhatsApp: ${JSON.stringify(errorData)}`
                  );
                }
              } catch (twilioError) {
                console.error("Erro ao enviar WhatsApp:", twilioError);
              }
            }
          }
        }
      }

      results.push({
        domain: domain.name,
        status,
        uptime,
        responseTime,
        sslExpiry: sslExpiry ? sslExpiry.toISOString() : null,
      });
    }

    return NextResponse.json({
      success: true,
      message: "Verificação concluída",
      results,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Erro geral:", error);
    return NextResponse.json(
      { error: "Erro ao verificar domínios", details: String(error) },
      { status: 500 }
    );
  }
}
