import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import * as cheerio from "cheerio"

type Mode = "distinct" | "all"

function normalizeUrl(u: string) {
  const t = u.trim()
  if (t.startsWith("http://") || t.startsWith("https://")) return t
  return `https://${t}`
}

function isSkippable(raw: string) {
  const u = raw.trim().toLowerCase()
  return (
    !u ||
    u === "#" ||
    u.startsWith("mailto:") ||
    u.startsWith("tel:") ||
    u.startsWith("javascript:") ||
    u.startsWith("data:")
  )
}

function toAbs(base: string, raw: string) {
  try {
    return new URL(raw, base).toString()
  } catch {
    return null
  }
}

function sameHost(a: string, b: string) {
  try {
    return new URL(a).host === new URL(b).host
  } catch {
    return false
  }
}

async function fetchText(url: string, ms = 10000) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), ms)
  try {
    const res = await fetch(url, { cache: "no-store", signal: ctrl.signal })
    const text = await res.text()
    return { ok: true as const, status: res.status, text }
  } catch (e: any) {
    return {
      ok: false as const,
      status: 0,
      text: "",
      error:
        e?.name === "AbortError"
          ? `Timeout (${ms}ms)`
          : e?.message || "Fetch error",
    }
  } finally {
    clearTimeout(t)
  }
}

async function checkUrl(url: string, ms = 8000) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), ms)
  try {
    let res: Response | null = null
    try {
      res = await fetch(url, {
        method: "HEAD",
        cache: "no-store",
        signal: ctrl.signal,
      })
    } catch {
      res = await fetch(url, {
        method: "GET",
        cache: "no-store",
        signal: ctrl.signal,
      })
    }
    return {
      ok: true as const,
      status: res.status,
      serverResponse: `${res.status} ${res.statusText}`,
    }
  } catch (e: any) {
    const msg =
      e?.name === "AbortError" ? `Timeout (${ms}ms)` : e?.message || "Fetch error"
    return { ok: false as const, status: null as number | null, serverResponse: msg }
  } finally {
    clearTimeout(t)
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: domainId } = await ctx.params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const mode: Mode = body?.mode === "all" ? "all" : "distinct"
  const maxPages = Number(body?.maxPages || 20)
  const maxLinks = Number(body?.maxLinks || 50)

  const { data: domain, error: domainError } = await supabase
    .from("domains")
    .select("id, url")
    .eq("id", domainId)
    .single()

  if (domainError || !domain) {
    return NextResponse.json({ error: "Domain not found" }, { status: 404 })
  }

  const startUrl = normalizeUrl(domain.url)

  // ✅ Criar registro de scan
  const { data: scan, error: scanError } = await supabase
    .from("broken_link_scans")
    .insert({
      domain_id: domainId,
      user_id: user.id,
      mode,
      max_pages: maxPages,
      max_links: maxLinks,
      status: "running",
    })
    .select()
    .single()

  if (scanError || !scan) {
    return NextResponse.json({ error: "Failed to create scan" }, { status: 500 })
  }

  // ✅ Buscar páginas já verificadas (para não rescanear)
  const { data: scannedPages } = await supabase
    .from("scanned_pages")
    .select("page_url")
    .eq("domain_id", domainId)
    .eq("user_id", user.id)

  const alreadyScanned = new Set((scannedPages || []).map(p => p.page_url))

  // ✅ Buscar cache de links já verificados
  const { data: cachedLinks } = await supabase
    .from("broken_links")
    .select("link_url, status_code, error")
    .eq("domain_id", domainId)

  const linkCache = new Map(
    (cachedLinks || []).map(item => [
      item.link_url,
      { status_code: item.status_code, error: item.error }
    ])
  )

  const queue: string[] = [startUrl]
  const seenPages = new Set<string>()
  const seenLinks = new Set<string>()

  let pagesScanned = 0
  let linksChecked = 0
  let brokenFound = 0
  let cacheHits = 0
  let skippedPages = 0

  const brokenPreview: Array<{
    page_url: string
    link_url: string
    link_text: string | null
    status_code: number | null
    server_response: string
  }> = []

  const linksToCheck: Array<{ link_url: string; link_text: string | null; page_url: string }> = []
  const pagesToRecord: string[] = []

  // ✅ Fase 1: Crawl das páginas
  while (queue.length && pagesScanned < maxPages) {
    const pageUrl = queue.shift()!
    if (seenPages.has(pageUrl)) continue
    seenPages.add(pageUrl)

    // ✅ Pular páginas já verificadas
    if (alreadyScanned.has(pageUrl)) {
      skippedPages++
      continue
    }

    const pageRes = await fetchText(pageUrl, 10000)
    pagesScanned++
    pagesToRecord.push(pageUrl)

    if (!pageRes.ok || !pageRes.text) continue

    const $ = cheerio.load(pageRes.text)

    // Descobrir novas páginas internas
    $("a[href]").each((_, el) => {
      const href = ($(el).attr("href") || "").trim()
      if (isSkippable(href)) return

      const abs = toAbs(pageUrl, href)
      if (!abs) return

      if (sameHost(abs, startUrl)) {
        if (/\.(pdf|docx?|xlsx?|pptx?|png|jpe?g|gif|svg|webp)(\?|#|$)/i.test(abs)) return
        if (!seenPages.has(abs)) queue.push(abs)
      }
    })

    // Coletar links para checar
    const found: Array<{ link_url: string; link_text: string | null }> = []

    $("a[href]").each((_, el) => {
      const href = ($(el).attr("href") || "").trim()
      if (isSkippable(href)) return
      const abs = toAbs(pageUrl, href)
      if (!abs) return
      found.push({ link_url: abs, link_text: $(el).text().trim() || null })
    })

    $("img[src]").each((_, el) => {
      const src = ($(el).attr("src") || "").trim()
      if (isSkippable(src)) return
      const abs = toAbs(pageUrl, src)
      if (!abs) return
      found.push({ link_url: abs, link_text: null })
    })

    $("script[src]").each((_, el) => {
      const src = ($(el).attr("src") || "").trim()
      if (isSkippable(src)) return
      const abs = toAbs(pageUrl, src)
      if (!abs) return
      found.push({ link_url: abs, link_text: null })
    })

    $("link[href]").each((_, el) => {
      const href = ($(el).attr("href") || "").trim()
      if (isSkippable(href)) return
      const abs = toAbs(pageUrl, href)
      if (!abs) return
      found.push({ link_url: abs, link_text: null })
    })

    const limited = found.slice(0, maxLinks)

    for (const item of limited) {
      if (mode === "distinct") {
        if (seenLinks.has(item.link_url)) continue
        seenLinks.add(item.link_url)
      }

      linksToCheck.push({ ...item, page_url: pageUrl })
    }
  }

  // ✅ Fase 2: Verificar links com paralelização
  const CONCURRENT_CHECKS = 5
  const occurrencesToInsert: any[] = []
  const linksToInsert: any[] = []

  for (let i = 0; i < linksToCheck.length; i += CONCURRENT_CHECKS) {
    const batch = linksToCheck.slice(i, i + CONCURRENT_CHECKS)

    const results = await Promise.all(
      batch.map(async (item) => {
        linksChecked++

        if (linkCache.has(item.link_url)) {
          const cached = linkCache.get(item.link_url)!
          cacheHits++
          const isBroken = cached.status_code ? cached.status_code >= 400 : false
          return {
            ...item,
            isBroken,
            status_code: cached.status_code,
            server_response: cached.error || "Cached",
            fromCache: true
          }
        }

        const r = await checkUrl(item.link_url, 8000)
        const isBroken = !r.ok || (r.status !== null && r.status >= 400)

        return {
          ...item,
          isBroken,
          status_code: r.ok ? r.status : null,
          server_response: r.serverResponse,
          fromCache: false
        }
      })
    )

    for (const result of results) {
      if (!result.fromCache) {
        linksToInsert.push({
          domain_id: domainId,
          user_id: user.id,
          page_url: result.page_url,
          link_url: result.link_url,
          status_code: result.status_code,
          error: result.server_response,
          checked_at: new Date().toISOString(),
        })
      }

      if (result.isBroken) {
        brokenFound++
        occurrencesToInsert.push({
          scan_id: scan.id,
          domain_id: domainId,
          user_id: user.id,
          page_url: result.page_url,
          link_url: result.link_url,
          link_text: result.link_text,
          status_code: result.status_code,
          server_response: result.server_response,
          checked_at: new Date().toISOString(),
          is_resolved: false,
        })

        if (brokenPreview.length < 200) {
          brokenPreview.push({
            page_url: result.page_url,
            link_url: result.link_url,
            link_text: result.link_text,
            status_code: result.status_code,
            server_response: result.server_response,
          })
        }
      }
    }
  }

  // ✅ Inserir links no cache
  if (linksToInsert.length > 0) {
    const { error: insertError } = await supabase
      .from("broken_links")
      .insert(linksToInsert)

    if (insertError) {
      console.error("Erro ao inserir em broken_links:", insertError)
    }
  }

  // ✅ Inserir ocorrências
  if (occurrencesToInsert.length > 0) {
    const { error: occurrenceInsertError } = await supabase
      .from("broken_link_occurrences")
      .insert(occurrencesToInsert)

    if (occurrenceInsertError) {
      console.error("Erro ao inserir em broken_link_occurrences:", occurrenceInsertError)
    }
  }

  // ✅ Registrar páginas verificadas
  if (pagesToRecord.length > 0) {
    const pagesToInsert = pagesToRecord.map(page_url => ({
      domain_id: domainId,
      user_id: user.id,
      page_url,
    }))

    const { error: pageError } = await supabase
      .from("scanned_pages")
      .upsert(pagesToInsert, { onConflict: "domain_id,page_url" })

    if (pageError) {
      console.error("Erro ao registrar páginas:", pageError)
    }
  }

  // ✅ Atualizar status do scan
  await supabase
    .from("broken_link_scans")
    .update({
      status: "finished",
      pages_scanned: pagesScanned,
      links_checked: linksChecked,
      broken_found: brokenFound,
      finished_at: new Date().toISOString(),
    })
    .eq("id", scan.id)

  return NextResponse.json({
    ok: true,
    domainId,
    startUrl,
    mode,
    pagesScanned,
    skippedPages,
    linksChecked,
    brokenFound,
    results: brokenPreview,
    scanId: scan.id,
    cacheHit: cacheHits,
  })
}
