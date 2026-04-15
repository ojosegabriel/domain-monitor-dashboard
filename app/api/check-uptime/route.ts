import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import * as tls from "tls";
import * as net from "net";

// ===== CONFIGURAÇÃO =====
const CONFIRMATION_THRESHOLD = 3;
const SSL_EXPIRY_WARNING_DAYS = 365; // Alertar 30 dias antes

// Função para verificar SSL usando tls.connect (forma correta!)
async function getSSLCertificateInfo(hostname: string): Promise<{ expiry: Date | null; status: string }> {
  return new Promise((resolve) => {
    try {
      // Criar conexão socket
      const socket = net.createConnection({ host: hostname, port: 443 });
      let timeoutHandle: NodeJS.Timeout | null = null;

      socket.on("connect", () => {
        // Fazer upgrade para TLS
        const tlsSocket = tls.connect(
          { socket: socket, servername: hostname, rejectUnauthorized: false },
          () => {
            try {
              // Limpar timeout
              if (timeoutHandle) clearTimeout(timeoutHandle);

              // Obter o certificado durante o handshake
              const cert = tlsSocket.getPeerCertificate();
              
              if (!cert || Object.keys(cert).length === 0) {
                console.log(`   ⚠️ Nenhum certificado encontrado para ${hostname}`);
                tlsSocket.destroy();
                resolve({ expiry: null, status: "not_found" });
                return;
              }

              // Obter a data de expiração
              const validTo = (cert as any).valid_to;
              
              if (!validTo) {
                console.log(`   ⚠️ Certificado sem data de expiração`);
                tlsSocket.destroy();
                resolve({ expiry: null, status: "invalid" });
                return;
              }

              const expiryDate = new Date(validTo);
              const now = new Date();
              
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

      // Timeout de 5 segundos
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

// Função para verificar se o SSL está expirando e enviar alerta
async function checkAndAlertSSLExpiry(
  supabase: any,
  domain: any,
  sslExpiry: Date | null,
  sslStatus: string
) {
  if (!sslExpiry || sslStatus !== "valid") {
    return; // Não verificar se não temos data ou SSL não é válido
  }

  const now = new Date();
  const daysUntilExpiry = Math.floor((sslExpiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  console.log(`   📅 SSL expira em ${daysUntilExpiry} dias`);

  // Verificar se está dentro da janela de alerta (30 dias)
  if (daysUntilExpiry <= SSL_EXPIRY_WARNING_DAYS && daysUntilExpiry > 0) {
    console.log(`   🔔 [SSL ALERT] SSL expirando em ${daysUntilExpiry} dias!`);

    // Verificar se já enviamos alerta hoje para este domínio
    const today = new Date().toISOString().split("T")[0];
    
    const { data: existingAlert, error: checkError } = await supabase
      .from("alerts")
      .select("id")
      .eq("domain_id", domain.id)
      .eq("alert_type", "ssl_expiry")
      .gte("sent_at", `${today}T00:00:00`)
      .single();

    if (existingAlert) {
      console.log(`   ⏭️ Alerta de SSL já enviado hoje, pulando...`);
      return;
    }

    // Buscar o perfil do usuário
    const { data: userProfile, error: profileError } = await supabase
      .from("profiles")
      .select("whatsapp_number, twilio_sid, twilio_token, twilio_from")
      .eq("id", domain.user_id)
      .single();

    if (profileError || !userProfile?.whatsapp_number) {
      console.log(`   ⚠️ Usuário não tem WhatsApp configurado, pulando alerta de SSL`);
      return;
    }

    // Converter para GMT-3 (Brasil)
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

    // Fallback para credenciais
    let twilio_sid = userProfile.twilio_sid || process.env.TWILIO_ACCOUNT_SID;
    let twilio_token = userProfile.twilio_token || process.env.TWILIO_AUTH_TOKEN;
    let twilio_from = userProfile.twilio_from || process.env.TWILIO_WHATSAPP_FROM;
    const whatsapp_number = userProfile.whatsapp_number;

    if (!twilio_sid || !twilio_token || !twilio_from) {
      console.log(`   ⚠️ Credenciais incompletas do Twilio para alerta SSL`);
      return;
    }

    try {
      // Garantir que From e To têm o prefixo whatsapp:
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
        
        // Salvar o alerta no banco
        await supabase.from("alerts").insert({
          user_id: domain.user_id,
          domain_id: domain.id,
          alert_type: "ssl_expiry",
          message: whatsappMessage,
          sent_at: new Date().toISOString(),
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
  
  // Verificar autenticação
  const secret = request.headers.get("x-cron-secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ✅ USAR SERVICE_ROLE_KEY AQUI!
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

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
      let sslStatus = "unknown";
      let sslCheckedAt: Date | null = null;

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

        // 2.3: Verificar SSL com tls.connect (forma correta!)
        if (domain.url.startsWith("https://")) {
          try {
            const urlObj = new URL(domain.url);
            const hostname = urlObj.hostname;

            console.log(`   🔍 Verificando SSL para: ${hostname}`);

            // Usar tls.connect para verificar SSL
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
        uptime = status === "online" ? 100 : 0;
        console.log(`   ℹ️ Sem logs de 24h, usando status atual: ${uptime}%`);
      }

      // ===== NOVO: SISTEMA DE CONFIRMAÇÃO DE ESTADO =====
      console.log(`   🔄 [CONFIRMAÇÃO] Verificando confirmação de estado...`);
      
      // 5.1: Buscar os últimos N checks para este domínio
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

      // 5.2: Verificar se todos os últimos N checks têm o mesmo status
      let confirmedStatus = domain.confirmed_status || "online";
      let shouldNotify = false;
      let notificationReason = "";
      let lastStatusChange = domain.last_status_change;
      let consecutiveChecks = domain.consecutive_checks || 0;

      if (recentLogs && recentLogs.length === CONFIRMATION_THRESHOLD) {
        // Verificar se todos os checks têm o mesmo status
        const allSameStatus = recentLogs.every((log) => log.status === status);
        
        if (allSameStatus && status !== confirmedStatus) {
          // Status mudou e foi confirmado por N checks consecutivos
          shouldNotify = true;
          confirmedStatus = status;
          lastStatusChange = new Date().toISOString();
          consecutiveChecks = CONFIRMATION_THRESHOLD;
          notificationReason = `Status confirmado após ${CONFIRMATION_THRESHOLD} checks consecutivos: ${status}`;
          console.log(`   ✅ ${notificationReason}`);
        } else if (!allSameStatus) {
          // Ainda há oscilação - não notifica
          console.log(`   ⏭️ Oscilação detectada (flapping) - aguardando confirmação`);
          console.log(`      Últimos checks: ${recentLogs.map((l) => l.status).reverse().join(" -> ")}`);
          consecutiveChecks = 0;
        } else {
          // Status é o mesmo que o confirmado - sem mudança
          console.log(`   ℹ️ Status mantém-se ${status} (sem mudança)`);
          consecutiveChecks = CONFIRMATION_THRESHOLD;
        }
      } else if (recentLogs && recentLogs.length > 0) {
        // Menos de N checks disponíveis - ainda em fase de coleta
        console.log(`   ⏳ Coletando dados para confirmação (${recentLogs.length}/${CONFIRMATION_THRESHOLD})`);
        consecutiveChecks = recentLogs.length;
      } else {
        // Primeiro check - não notifica
        console.log(`   ℹ️ Primeiro check - sem histórico para comparação`);
        consecutiveChecks = 1;
      }

      // 5. Atualizar o domínio com status confirmado
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

      // 6. Verificar se precisa enviar alerta WhatsApp (APENAS SE CONFIRMADO)
      if (shouldNotify) {
        console.log(`   📱 [WHATSAPP] Enviando alerta (status confirmado)...`);

        // 6.1: Buscar o perfil do usuário (COM TODAS AS CREDENCIAIS!)
        const { data: userProfile, error: profileError } = await supabase
          .from("profiles")
          .select("whatsapp_number, twilio_sid, twilio_token, twilio_from, whatsapp_apikey")
          .eq("id", domain.user_id)
          .single();

        if (profileError || !userProfile?.whatsapp_number) {
          console.log(`   ⚠️ Usuário não tem WhatsApp configurado, pulando alerta`);
        } else {
          const isNowOffline = status === "offline";
          
          // Converter para GMT-3 (Brasil) - America/Sao_Paulo
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

          // ✅ FALLBACK PARA TODAS AS CREDENCIAIS!
          let twilio_sid = userProfile.twilio_sid || process.env.TWILIO_ACCOUNT_SID;
          let twilio_token = userProfile.twilio_token || process.env.TWILIO_AUTH_TOKEN;
          let twilio_from = userProfile.twilio_from || process.env.TWILIO_WHATSAPP_FROM;
          const whatsapp_number = userProfile.whatsapp_number;

          // Log de onde as credenciais vieram
          if (userProfile.twilio_sid) console.log(`   ℹ️ Usando TWILIO_ACCOUNT_SID do banco`);
          else console.log(`   ℹ️ Usando TWILIO_ACCOUNT_SID da Vercel`);
          
          if (userProfile.twilio_token) console.log(`   ℹ️ Usando TWILIO_AUTH_TOKEN do banco`);
          else console.log(`   ℹ️ Usando TWILIO_AUTH_TOKEN da Vercel`);
          
          if (userProfile.twilio_from) console.log(`   ℹ️ Usando TWILIO_WHATSAPP_FROM do banco`);
          else console.log(`   ℹ️ Usando TWILIO_WHATSAPP_FROM da Vercel`);

          // Verificar se tem credenciais
          if (!twilio_sid || !twilio_token || !twilio_from) {
            console.log(`   ⚠️ Credenciais incompletas do Twilio (banco e Vercel)`);
          } else {
            try {
              // Garantir que From e To têm o prefixo whatsapp:
              const fromNumber = twilio_from.startsWith("whatsapp:") ? twilio_from : `whatsapp:${twilio_from}`;
              const toNumber = whatsapp_number.startsWith("whatsapp:") ? whatsapp_number : `whatsapp:${whatsapp_number}`;
              
              console.log(`   📤 Enviando WhatsApp: From=${fromNumber}, To=${toNumber}`);
              
              // Construir o body como string (não usar URLSearchParams que faz encoding)
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
                
                // Salvar o alerta no banco
                await supabase.from("alerts").insert({
                  user_id: domain.user_id,
                  domain_id: domain.id,
                  alert_type: isNowOffline ? "offline" : "online",
                  message: whatsappMessage,
                  sent_at: new Date().toISOString(),
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
        console.log(`   ⏭️ Sem notificação necessária (status não confirmado ou sem mudança)`);
      }

      // ===== NOVO: VERIFICAR ALERTA DE SSL EXPIRANDO =====
      console.log(`   🔔 [SSL EXPIRY] Verificando se SSL está expirando...`);
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
