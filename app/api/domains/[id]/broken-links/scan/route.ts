import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import * as cheerio from "cheerio";

type Mode = "distinct" | "all";

function normalizeUrl(u: string) {
  const t = u.trim();
  if (t.startsWith("http://") || t.startsWith("https://")) return t;
  return `https://${t}`;
}

function isSkippable(raw: string) {
  const u = raw.trim().toLowerCase();
  return (
    !u ||
    u === "#" ||
    u.startsWith("mailto:") ||
    u.startsWith("tel:") ||
    u.startsWith("javascript:") ||
    u.startsWith("data:")
  );
}

function toAbs(base: string, raw: string) {
  try {
    return new URL(raw, base).toString();
  } catch {
    return null;
  }
}

function sameHost(a: string, b: string) {
  try {
    return new URL(a).host === new URL(b).host;
  } catch {
    return false;
  }
}

async function fetchText(url: string, ms = 10000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { cache: "no-store", signal: ctrl.signal });
    const text = await res.text();
    return { ok: true as const, status: res.status, text };
  } catch (e: any) {
    return {
      ok: false as const,
      status: 0,
      text: "",
      error:
        e?.name === "AbortError"
          ? `Timeout (${ms}ms)`
          : e?.message || "Fetch error",
    };
  } finally {
    clearTimeout(t);
  }
}

async function checkUrl(url: string, ms = 8000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    // HEAD primeiro, fallback GET
    let res: Response | null = null;
    try {
      res = await fetch(url, {
        method: "HEAD",
        cache: "no-store",
        signal: ctrl.signal,
      });
    } catch {
      res = await fetch(url, {
        method: "GET",
        cache: "no-store",
        signal: ctrl.signal,
      });
    }
    return {
      ok: true as const,
      status: res.status,
      serverResponse: `${res.status} ${res.statusText}`,
    };
  } catch (e: any) {
    const msg =
      e?.name === "AbortError" ? `Timeout (${ms}ms)` : e?.message || "Fetch error";
    return { ok: false as const, status: null as number | null, serverResponse: msg };
  } finally {
    clearTimeout(t);
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: domainId } = await ctx.params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const mode: Mode = body?.mode === "all" ? "all" : "distinct";
  const maxPages = Number(body?.maxPages || 50); // comece pequeno
  const maxLinks = Number(body?.maxLinks || 50);

  const { data: domain, error: domainError } = await supabase
    .from("domains")
    .select("id, url")
    .eq("id", domainId)
    .single();

  if (domainError || !domain) return NextResponse.json({ error: "Domain not found" }, { status: 404 });

  const startUrl = normalizeUrl(domain.url);

  // BFS crawl interno
  const queue: string[] = [startUrl];
  const seenPages = new Set<string>();
  const seenLinks = new Set<string>(); // pra distinct

  let pagesScanned = 0;
  let linksChecked = 0;
  let brokenFound = 0;

  // Para sua versão atual: vamos devolver o resultado na resposta,
  // e depois você decide se quer salvar no banco.
  const brokenPreview: Array<{
    page_url: string;
    link_url: string;
    link_text: string | null;
    status_code: number | null;
    server_response: string;
  }> = [];

  while (queue.length && pagesScanned < maxPages) {
    const pageUrl = queue.shift()!;
    if (seenPages.has(pageUrl)) continue;
    seenPages.add(pageUrl);

    const pageRes = await fetchText(pageUrl, 10000);
    pagesScanned++;

    if (!pageRes.ok || !pageRes.text) continue;

    const $ = cheerio.load(pageRes.text);

    // 1) descobrir novas páginas internas (links <a>)
    $("a[href]").each((_, el) => {
      const href = ($(el).attr("href") || "").trim();
      if (isSkippable(href)) return;

      const abs = toAbs(pageUrl, href);
      if (!abs) return;

      if (sameHost(abs, startUrl)) {
        if (/\.(pdf|docx?|xlsx?|pptx?|png|jpe?g|gif|svg|webp)(\?|#|$)/i.test(abs)) return;
        if (!seenPages.has(abs)) queue.push(abs);
      }
    });

    // 2) coletar links pra checar
    const found: Array<{ link_url: string; link_text: string | null }> = [];

    $("a[href]").each((_, el) => {
      const href = ($(el).attr("href") || "").trim();
      if (isSkippable(href)) return;
      const abs = toAbs(pageUrl, href);
      if (!abs) return;
      found.push({ link_url: abs, link_text: $(el).text().trim() || null });
    });

    $("img[src]").each((_, el) => {
      const src = ($(el).attr("src") || "").trim();
      if (isSkippable(src)) return;
      const abs = toAbs(pageUrl, src);
      if (!abs) return;
      found.push({ link_url: abs, link_text: null });
    });

    $("script[src]").each((_, el) => {
      const src = ($(el).attr("src") || "").trim();
      if (isSkippable(src)) return;
      const abs = toAbs(pageUrl, src);
      if (!abs) return;
      found.push({ link_url: abs, link_text: null });
    });

    $("link[href]").each((_, el) => {
      const href = ($(el).attr("href") || "").trim();
      if (isSkippable(href)) return;
      const abs = toAbs(pageUrl, href);
      if (!abs) return;
      found.push({ link_url: abs, link_text: null });
    });

    const limited = found.slice(0, maxLinks);

    for (const item of limited) {
      if (mode === "distinct") {
        if (seenLinks.has(item.link_url)) continue;
        seenLinks.add(item.link_url);
      }

      linksChecked++;
      const r = await checkUrl(item.link_url, 8000);
      const isBroken = !r.ok || (r.status !== null && r.status >= 400);

      if (isBroken) {
        brokenFound++;
        if (brokenPreview.length < 200) {
          brokenPreview.push({
            page_url: pageUrl,
            link_url: item.link_url,
            link_text: item.link_text,
            status_code: r.ok ? r.status : null,
            server_response: r.serverResponse,
          });
        }
      }
    }
  }

  return NextResponse.json({
    ok: true,
    domainId,
    startUrl,
    mode,
    pagesScanned,
    linksChecked,
    brokenFound,
    results: brokenPreview,
  });
}
