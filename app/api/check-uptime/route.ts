import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  console.log("🚀 [INICIO] Verificação de domínios iniciada");
  
  const supabase = await createClient();

  try {
    // 1. Buscar todos os domínios
    console.log("📋 [BUSCA] Buscando domínios no banco...");
    const { data: domains, error: domainsError } = await supabase
      .from("domains")
      .select("*");

    if (domainsError) {
      console.error("❌ [ERRO] Erro ao buscar domínios:", domainsError);
      throw domainsError;
    }

    console.log(`✅ [SUCESSO] ${domains?.length || 0} domínios encontrados`);

    if (!domains || domains.length === 0) {
      console.log("⚠️ [AVISO] Nenhum domínio para verificar");
      return NextResponse.json({ 
        message: "Nenhum domínio para verificar",
        timestamp: new Date().toISOString()
      });
    }

    const results = [];

    // 2. Loop para verificar cada domínio
    for (const domain of domains) {
      console.log(`\n🔍 [VERIFICANDO] Domínio: ${domain.name} (${domain.url})`);
      
      let status = "online";
      let responseTime = 0;
      let sslExpiry: Date | null = null;

      try {
        // 2.1: Verificar se o site está online
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

        // 2.2: Verificar status HTTP
        if (!response.ok) {
          status = "offline";
          console.log(`   ❌ Status HTTP: ${response.status} (offline)`);
        } else {
          console.log(`   ✅ Status HTTP: ${response.status} (online)`);
        }

        // 2.3: Verificar SSL
        if (domain.url.startsWith("https://" )) {
          try {
            const urlObj = new URL(domain.url);
            const hostname = urlObj.hostname;

            const sslController = new AbortController();
            const sslTimeoutId = setTimeout(() => sslController.abort(), 5000);

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
                console.log(`   🔐 SSL válido até: ${sslExpiry.toLocaleDateString("pt-BR")}`);
              }
            }
          } catch (sslError) {
            console.log(`   ⚠️ SSL check falhou (continuando sem SSL info)`);
          }
        }
      } catch (error) {
        status = "offline";
        responseTime = 10000;
        console.log(`   ❌ Erro ao verificar: ${error instanceof Error ? error.message : String(error)}`);
      }

      // 3. Salvar o log de verificação
      console.log(`   💾 [SALVANDO] Log de verificação...`);
      const { error: logError } = await supabase.from("uptime_logs").insert({
        user_id: domain.user_id,
        domain_id: domain.id,
        status,
        response_time: responseTime,
        checked_at: new Date().toISOString(),
      });

      if (logError) {
        console.error(`   ❌ Erro ao salvar log:`, logError);
        continue;
      }
      console.log(`   ✅ Log salvo com sucesso`);

      // 3.1: Aguardar um pouco para o banco processar
      await new Promise((resolve) => setTimeout(resolve, 200));

      // 4. Recalcular uptime (últimas 24 horas)
      console.log(`   📊 [CALCULANDO] Uptime das últimas 24h...`);
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      
      const { data: allLogs, error: logsError } = await supabase
        .from("uptime_logs")
        .select("status")
        .eq("domain_id", domain.id)
        .gte("checked_at", twentyFourHoursAgo);

      if (logsError) {
        console.error(`   ❌ Erro ao buscar logs:`, logsError);
        continue;
      }

      let uptime = 100;
      if (allLogs && allLogs.length > 0) {
        const onlineCount = allLogs.filter((log) => log.status === "online").length;
        uptime = Math.round((onlineCount / allLogs.length) * 100);
        console.log(`   ✅ Uptime calculado: ${uptime}% (${onlineCount}/${allLogs.length})`);
      } else {
        console.log(`   ℹ️ Nenhum log nas últimas 24h, mantendo uptime em 100%`);
      }

      // 5. Atualizar o domínio
      console.log(`   🔄 [ATUALIZANDO] Domínio no banco...`);
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
        console.error(`   ❌ Erro ao atualizar domínio:`, updateError);
        continue;
      }
      console.log(`   ✅ Domínio atualizado`);

      // 6. Se o status é OFFLINE, verificar se precisa enviar alerta
      if (status === "offline") {
        console.log(`   🚨 [ALERTA] Domínio está offline! Verificando se precisa enviar notificação...`);
        
        // 6.1: Buscar o status anterior (últimas 2 verificações)
        const { data: previousLogs, error: prevError } = await supabase
          .from("uptime_logs")
          .select("status, checked_at")
          .eq("domain_id", domain.id)
          .order("checked_at", { ascending: false })
          .limit(2);

        if (prevError) {
          console.error(`   ❌ Erro ao buscar logs anteriores:`, prevError);
        } else {
          // Verificar se houve mudança de status (online -> offline)
          const hasStatusChange = previousLogs && previousLogs.length > 1 && previousLogs[1].status === "online";
          
          if (hasStatusChange) {
            console.log(`   ⚠️ Status mudou de ONLINE para OFFLINE! Enviando alerta...`);
            
            // 6.2: Buscar perfil do usuário para pegar o número do WhatsApp
            const { data: profile, error: profileError } = await supabase
              .from("profiles")
              .select("whatsapp_number")
              .eq("id", domain.user_id)
              .single();

            if (profileError) {
              console.error(`   ❌ Erro ao buscar perfil:`, profileError);
            } else {
              const whatsapp_number = profile?.whatsapp_number;
              const twilio_sid = process.env.TWILIO_ACCOUNT_SID;
              const twilio_token = process.env.TWILIO_AUTH_TOKEN;
              const twilio_from = process.env.TWILIO_WHATSAPP_FROM;

              if (!whatsapp_number || !twilio_sid || !twilio_token || !twilio_from) {
                console.log(`   ⚠️ Credenciais incompletas do Twilio`);
                console.log(`      - WhatsApp: ${whatsapp_number ? "✅" : "❌"}`);
                console.log(`      - SID: ${twilio_sid ? "✅" : "❌"}`);
                console.log(`      - Token: ${twilio_token ? "✅" : "❌"}`);
                console.log(`      - From: ${twilio_from ? "✅" : "❌"}`);
              } else {
                try {
                  console.log(`   📤 [ENVIANDO] Mensagem para ${whatsapp_number}...`);
                  
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
                    console.log(`   ✅ WhatsApp enviado com sucesso!`);
                    
                    // 6.3: Salvar o alerta no banco
                    const { error: alertError } = await supabase.from("alerts").insert({
                      user_id: domain.user_id,
                      domain_id: domain.id,
                      alert_type: "offline",
                      message: `${domain.name} ficou offline`,
                      sent_at: new Date().toISOString(),
                    });

                    if (alertError) {
                      console.error(`   ❌ Erro ao salvar alerta:`, alertError);
                    } else {
                      console.log(`   ✅ Alerta salvo no banco`);
                    }
                  } else {
                    const errorData = await response.json();
                    console.error(`   ❌ Erro ao enviar WhatsApp:`, errorData);
                  }
                } catch (twilioError) {
                  console.error(`   ❌ Erro na requisição Twilio:`, twilioError);
                }
              }
            }
          } else {
            console.log(`   ⏭️ Domínio já estava offline ou é primeira verificação. Pulando alerta...`);
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

    console.log(`\n✅ [CONCLUIDO] Verificação finalizada com sucesso`);
    console.log(`📊 Resultados: ${results.length} domínios verificados\n`);

    return NextResponse.json({
      success: true,
      message: "Verificação concluída",
      results,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ [ERRO GERAL]:", error);
    return NextResponse.json(
      { 
        error: "Erro ao verificar domínios", 
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}
