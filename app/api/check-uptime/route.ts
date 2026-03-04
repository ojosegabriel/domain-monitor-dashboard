import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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
        if (domain.url.startsWith("https://")) {
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
        // Se não houver logs de 24h, usa o status atual
        uptime = status === "online" ? 100 : 0;
        console.log(`   ℹ️ Sem logs de 24h, usando status atual: ${uptime}%`);
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
      console.log(`   ✅ Domínio atualizado com sucesso`);

      // 6. Verificar se precisa enviar alerta WhatsApp
      console.log(`   📱 [WHATSAPP] Verificando se precisa enviar alerta...`);

      // 6.1: Buscar o perfil do usuário (COM TODAS AS CREDENCIAIS!)
      const { data: userProfile, error: profileError } = await supabase
        .from("profiles")
        .select("whatsapp_number, twilio_sid, twilio_token, twilio_from, whatsapp_apikey")
        .eq("id", domain.user_id)
        .single();

      if (profileError || !userProfile?.whatsapp_number) {
        console.log(`   ⚠️ Usuário não tem WhatsApp configurado, pulando alerta`);
        continue;
      }

      // 6.2: Verificar se o status mudou
      const { data: previousLogs } = await supabase
        .from("uptime_logs")
        .select("status")
        .eq("domain_id", domain.id)
        .order("checked_at", { ascending: false })
        .limit(2);

      // Se não há histórico anterior, não envia alerta
      if (!previousLogs || previousLogs.length < 2) {
        console.log(`   ⏭️ Sem histórico anterior, pulando alerta`);
        continue;
      }

      const previousStatus = previousLogs[1].status;
      const statusChanged = previousStatus !== status;

      if (statusChanged) {
        console.log(`   ✅ Status mudou de ${previousStatus} para ${status}, enviando alerta...`);

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
          continue;
        }

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
      } else {
        console.log(`   ⏭️ Status não mudou (${status}), pulando alerta`);
      }

      results.push({
        domain: domain.name,
        url: domain.url,
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
