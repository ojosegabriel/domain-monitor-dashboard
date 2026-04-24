import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import * as tls from "tls";
import * as net from "net";

const CONFIRMATION_THRESHOLD = 3;
const SSL_EXPIRY_WARNING_DAYS = 365; 


async function getSSLCertificateInfo(hostname: string): Promise<{ expiry: Date | null; status: string }> {
  return new Promise((resolve) => {
    try {
      // Abre a conexão via socket na porta padrão de HTTPS
      const socket = net.createConnection({ host: hostname, port: 443 });
      let timeoutHandle: NodeJS.Timeout | null = null;

      socket.on("connect", () => {
        // Inicia o handshake TLS para capturar os dados do certificado
        const tlsSocket = tls.connect(
          { socket: socket, servername: hostname, rejectUnauthorized: false },
          () => {
            try {
              if (timeoutHandle) clearTimeout(timeoutHandle);

              const cert = tlsSocket.getPeerCertificate();
              
              if (!cert || Object.keys(cert).length === 0) {
                console.log(`   ⚠️ Nenhum certificado encontrado para ${hostname}`);
                tlsSocket.destroy();
                resolve({ expiry: null, status: "not_found" });
                return;
              }

              const validTo = (cert as any).valid_to;
              
              if (!validTo) {
                console.log(`   ⚠️ Certificado sem data de expiração`);
                tlsSocket.destroy();
                resolve({ expiry: null, status: "invalid" });
                return;
              }

              const expiryDate = new Date(validTo);
              const now = new Date();
              
              // Define o status com base na data atual
              if (expiryDate > now) {
                console.log(`   🔐 SSL válido até: ${expiryDate.toLocaleDateString("pt-BR")}`);
                tlsSocket.destroy();
                resolve({ expiry: expiryDate, status: "valid" });
              } else {
                console.log(`   ⚠️ SSL EXPIRADO em: ${expiryDate.toLocaleDateString("pt-BR")}`);
                tlsSocket.destroy();
                resolve({ expiry: expiryDate, status: "expired" });
              }
            } catch (error) {
              console.log(`   ⚠️ Erro ao processar certificado: ${error instanceof Error ? error.message : String(error)}`);
              tlsSocket.destroy();
              resolve({ expiry: null, status: "error" });
            }
          }
        );

        tlsSocket.on("error", (error) => {
          if (timeoutHandle) clearTimeout(timeoutHandle);
          console.log(`   ⚠️ Erro na conexão TLS: ${error instanceof Error ? error.message : String(error)}`);
          tlsSocket.destroy();
          resolve({ expiry: null, status: "error" });
        });
      });

      socket.on("error", (error) => {
        if (timeoutHandle) clearTimeout(timeoutHandle);
        console.log(`   ⚠️ Erro na conexão socket: ${error instanceof Error ? error.message : String(error)}`);
        socket.destroy();
        resolve({ expiry: null, status: "error" });
      });

      // Evita que o processo fique travado se o servidor não responder
      timeoutHandle = setTimeout(() => {
        console.log(`   ⚠️ Timeout na verificação SSL`);
        socket.destroy();
        resolve({ expiry: null, status: "timeout" });
      }, 5000);
    } catch (error) {
      console.log(`   ⚠️ Erro geral SSL: ${error instanceof Error ? error.message : String(error)}`);
      resolve({ expiry: null, status: "error" });
    }
  });
}

async function checkAndAlertSSLExpiry(
  supabase: any,
  domain: any,
  sslExpiry: Date | null,
  sslStatus: string
) {
  if (!sslExpiry || sslStatus !== "valid") {
    return; 
  }

  const now = new Date();
  const daysUntilExpiry = Math.floor((sslExpiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  console.log(`   📅 SSL expira em ${daysUntilExpiry} dias`);

  // Dispara o fluxo de alerta se estiver chegando perto do vencimento
  if (daysUntilExpiry <= SSL_EXPIRY_WARNING_DAYS && daysUntilExpiry > 0) {
    console.log(`   🔔 [SSL ALERT] SSL expirando em ${daysUntilExpiry} dias!`);

    // Controle de frequência: apenas um alerta por dia para não floodar o cliente
    const today = new Date().toISOString().split("T")[0];
    
    const { data: existingAlert, error: checkError } = await supabase
      .from("alerts")
      .select("id")
      .eq("domain_id", domain.id)
      .eq("alert_type", "ssl_expiry")
      .gte("created_at", `${today}T00:00:00`)
      .single();

    if (existingAlert) {
      console.log(`   ⏭️ Alerta de SSL já enviado hoje, pulando...`);
      return;
    }

    const { data: userProfile, error: profileError } = await supabase
      .from("profiles")
      .select("whatsapp_number, twilio_sid, twilio_token, twilio_from")
      .eq("id", domain.user_id)
      .single();

    if (profileError || !userProfile?.whatsapp_number) {
      console.log(`   ⚠️ Usuário não tem WhatsApp configurado, pulando alerta de SSL`);
      return;
    }

    const horarioBrasil = new Date().toLocaleString("pt-BR", { 
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });

    const dataExpiracaoBrasil = sslExpiry.toLocaleDateString("pt-BR");

    const whatsappMessage = `⚠️ ATENÇÃO SSL: Seu certificado SSL do domínio "${domain.name}" expira em ${daysUntilExpiry} dias!\n\nURL: ${domain.url}\nData de Expiração: ${dataExpiracaoBrasil}\nHorário do Alerta: ${horarioBrasil}\n\nRenove seu certificado em breve!`;

    // fallback para variáveis de ambiente caso o usuário não tenha configurado as credenciais do Twilio
    let twilio_sid = userProfile.twilio_sid || process.env.TWILIO_ACCOUNT_SID;
    let twilio_token = userProfile.twilio_token || process.env.TWILIO_AUTH_TOKEN;
    let twilio_from = userProfile.twilio_from || process.env.TWILIO_WHATSAPP_FROM;
    const whatsapp_number = userProfile.whatsapp_number;

    if (!twilio_sid || !twilio_token || !twilio_from) {
      console.log(`   ⚠️ Credenciais incompletas do Twilio para alerta SSL`);
      return;
    }

    try {
      const fromNumber = twilio_from.startsWith("whatsapp:") ? twilio_from : `whatsapp:${twilio_from}`;
      const toNumber = whatsapp_number.startsWith("whatsapp:") ? whatsapp_number : `whatsapp:${whatsapp_number}`;
      
      console.log(`   📤 Enviando alerta SSL WhatsApp...`);
      
      const bodyParams = new URLSearchParams();
      bodyParams.append("From", fromNumber);
      bodyParams.append("To", toNumber);
      bodyParams.append("Body", whatsappMessage);
      
      const response = await fetch("https://api.twilio.com/2010-04-01/Accounts/" + twilio_sid + "/Messages.json", {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${twilio_sid}:${twilio_token}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: bodyParams.toString(),
      });

      if (response.ok) {
        console.log(`   ✅ Alerta SSL enviado com sucesso!`);
        
        await supabase.from("alerts").insert({
          user_id: domain.user_id,
          domain_id: domain.id,
          alert_type: "ssl_expiry",
          message: whatsappMessage,
          created_at: new Date().toISOString(),
        });
      } else {
        const errorData = await response.json();
        console.error(`   ❌ Erro ao enviar alerta SSL:`, errorData);
      }
    } catch (error) {
      console.error(`   ❌ Erro ao enviar alerta SSL:`, error);
    }
  } else if (daysUntilExpiry <= 0) {
    console.log(`   🚨 SSL JÁ EXPIROU! Renove imediatamente!`);
  }
}

export async function GET(request: Request) {
  console.log("🚀 [INICIO] Verificação de domínios iniciada");
  
  const secret = request.headers.get("x-cron-secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
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

    // Laço de repetição para verificar cada domínio individualmente
    for (const domain of domains) {
      console.log(`\n🔍 [VERIFICANDO] Domínio: ${domain.name} (${domain.url})`);
      
      let status = "online";
      let responseTime = 0;
      let sslExpiry: Date | null = null;
      let sslStatus = "unknown";
      let sslCheckedAt: Date | null = null;

      try {
        // Teste de disponibilidade com timeout de 10s para não travar a fila
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

        if (!response.ok) {
          status = "offline";
          console.log(`   ❌ Status HTTP: ${response.status} (offline)`);
        } else {
          console.log(`   ✅ Status HTTP: ${response.status} (online)`);
        }

        if (domain.url.startsWith("https://")) {
          try {
            const urlObj = new URL(domain.url);
            const hostname = urlObj.hostname;

            console.log(`   🔍 Verificando SSL para: ${hostname}`);

            const sslInfo = await getSSLCertificateInfo(hostname);
            
            if (sslInfo.expiry) {
              sslExpiry = sslInfo.expiry;
              sslStatus = sslInfo.status;
              sslCheckedAt = new Date();
            } else {
              sslStatus = sslInfo.status;
              sslCheckedAt = new Date();
            }
          } catch (sslError) {
            console.log(`   ⚠️ SSL check falhou: ${sslError instanceof Error ? sslError.message : String(sslError)}`);
            sslStatus = "error";
          }
        }
      } catch (error) {
        status = "offline";
        responseTime = 10000;
        console.log(`   ❌ Erro ao verificar: ${error instanceof Error ? error.message : String(error)}`);
      }

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

      await new Promise((resolve) => setTimeout(resolve, 200));

      // calculua a barra de uptime das últimas 24h para mostrar no dashboard e definir se o status mudou de fato ou é só um check isolado (flapping)
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
        uptime = status === "online" ? 100 : 0;
        console.log(`   ℹ️ Sem logs de 24h, usando status atual: ${uptime}%`);
      }

      // Confirmação de status para evitar alerta falso (flapping)
      console.log(`   🔄 [CONFIRMAÇÃO] Verificando confirmação de estado...`);
      
      const { data: recentLogs, error: recentLogsError } = await supabase
        .from("uptime_logs")
        .select("status")
        .eq("domain_id", domain.id)
        .order("checked_at", { ascending: false })
        .limit(CONFIRMATION_THRESHOLD);

      if (recentLogsError) {
        console.error(`   ❌ Erro ao buscar logs recentes:`, recentLogsError);
        continue;
      }

      let confirmedStatus = domain.confirmed_status || "online";
      let shouldNotify = false;
      let notificationReason = "";
      let lastStatusChange = domain.last_status_change;
      let consecutiveChecks = domain.consecutive_checks || 0;

      if (recentLogs && recentLogs.length === CONFIRMATION_THRESHOLD) {
        const allSameStatus = recentLogs.every((log) => log.status === status);
        
        if (allSameStatus && status !== confirmedStatus) {
          // status mudou e foi confirmado por 3 checks consecutivos, então atualiza o status confirmado e dispara o alerta
          shouldNotify = true;
          confirmedStatus = status;
          lastStatusChange = new Date().toISOString();
          consecutiveChecks = CONFIRMATION_THRESHOLD;
          notificationReason = `Status confirmado após ${CONFIRMATION_THRESHOLD} checks consecutivos: ${status}`;
          console.log(`   ✅ ${notificationReason}`);
        } else if (!allSameStatus) {
          // como o flapping é detectado, reseta a contagem e mantém o status anterior
          console.log(`   ⏭️ Oscilação detectada (flapping) - aguardando confirmação`);
          console.log(`      Últimos checks: ${recentLogs.map((l) => l.status).reverse().join(" -> ")}`);
          consecutiveChecks = 0;
        } else {
          console.log(`   ℹ️ Status mantém-se ${status} (sem mudança)`);
          consecutiveChecks = CONFIRMATION_THRESHOLD;
        }
      } else if (recentLogs && recentLogs.length > 0) {
        console.log(`   ⏳ Coletando dados para confirmação (${recentLogs.length}/${CONFIRMATION_THRESHOLD})`);
        consecutiveChecks = recentLogs.length;
      } else {
        console.log(`   ℹ️ Primeiro check - sem histórico para comparação`);
        consecutiveChecks = 1;
      }

      // att o a interface com os dados atualizados.
      console.log(`   🔄 [ATUALIZANDO] Domínio no banco...`);
      const { error: updateError } = await supabase
        .from("domains")
        .update({
          status,
          confirmed_status: confirmedStatus,
          uptime,
          response_time: responseTime,
          last_checked_at: new Date().toISOString(),
          ssl_expiry_date: sslExpiry ? sslExpiry.toISOString() : null,
          ssl_status: sslStatus,
          ssl_checked_at: sslCheckedAt ? sslCheckedAt.toISOString() : null,
          last_status_change: lastStatusChange,
          consecutive_checks: consecutiveChecks,
        })
        .eq("id", domain.id);

      if (updateError) {
        console.error(`   ❌ Erro ao atualizar domínio:`, updateError);
        continue;
      }
      console.log(`   ✅ Domínio atualizado com sucesso`);

      // Envia o alerta só se o status for confirmado
      if (shouldNotify) {
        console.log(`   📱 [WHATSAPP] Enviando alerta (status confirmado)...`);

        const { data: userProfile, error: profileError } = await supabase
          .from("profiles")
          .select("whatsapp_number, twilio_sid, twilio_token, twilio_from, whatsapp_apikey")
          .eq("id", domain.user_id)
          .single();

        if (profileError || !userProfile?.whatsapp_number) {
          console.log(`   ⚠️ Usuário não tem WhatsApp configurado, pulando alerta`);
        } else {
          const isNowOffline = status === "offline";
          
          const horarioBrasil = new Date().toLocaleString("pt-BR", { 
            timeZone: "America/Sao_Paulo",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit"
          });
          
          const whatsappMessage = isNowOffline
            ? `🚨 ALERTA: Seu domínio "${domain.name}" ficou OFFLINE!\n\nURL: ${domain.url}\nHorário: ${horarioBrasil}`
            : `✅ ALERTA RESOLVIDO: Seu domínio "${domain.name}" voltou ONLINE!\n\nURL: ${domain.url}\nHorário: ${horarioBrasil}`;

          let twilio_sid = userProfile.twilio_sid || process.env.TWILIO_ACCOUNT_SID;
          let twilio_token = userProfile.twilio_token || process.env.TWILIO_AUTH_TOKEN;
          let twilio_from = userProfile.twilio_from || process.env.TWILIO_WHATSAPP_FROM;
          const whatsapp_number = userProfile.whatsapp_number;

          if (!twilio_sid || !twilio_token || !twilio_from) {
            console.log(`   ⚠️ Credenciais incompletas do Twilio`);
          } else {
            try {
              const fromNumber = twilio_from.startsWith("whatsapp:") ? twilio_from : `whatsapp:${twilio_from}`;
              const toNumber = whatsapp_number.startsWith("whatsapp:") ? whatsapp_number : `whatsapp:${whatsapp_number}`;
              
              const bodyParams = new URLSearchParams();
              bodyParams.append("From", fromNumber);
              bodyParams.append("To", toNumber);
              bodyParams.append("Body", whatsappMessage);
              
              const response = await fetch("https://api.twilio.com/2010-04-01/Accounts/" + twilio_sid + "/Messages.json", {
                method: "POST",
                headers: {
                  Authorization: `Basic ${Buffer.from(`${twilio_sid}:${twilio_token}`).toString("base64")}`,
                  "Content-Type": "application/x-www-form-urlencoded",
                },
                body: bodyParams.toString(),
              });

              if (response.ok) {
                console.log(`   ✅ WhatsApp enviado com sucesso!`);
                await supabase.from("alerts").insert({
                  user_id: domain.user_id,
                  domain_id: domain.id,
                  alert_type: isNowOffline ? "offline" : "online",
                  message: whatsappMessage,
                  created_at: new Date().toISOString(),
                });
              } else {
                const errorData = await response.json();
                console.error(`   ❌ Erro ao enviar WhatsApp:`, errorData);
              }
            } catch (whatsappError) {
              console.error(`   ❌ Erro ao enviar WhatsApp:`, whatsappError);
            }
          }
        }
      } else {
        console.log(`   ⏭️ Sem notificação necessária`);
      }

      await checkAndAlertSSLExpiry(supabase, domain, sslExpiry, sslStatus);

      results.push({
        domain: domain.name,
        url: domain.url,
        status,
        confirmedStatus,
        uptime,
        responseTime,
        sslExpiry: sslExpiry ? sslExpiry.toISOString() : null,
        sslStatus,
        notified: shouldNotify,
      });
    }

    console.log(`\n✅ [CONCLUIDO] Verificação finalizada com sucesso`);

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