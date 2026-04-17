// app/api/broken-links/mark-resolved/route.ts

import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { domain_id, link_url } = body

    if (!domain_id || !link_url) {
      return NextResponse.json(
        { error: "Missing domain_id or link_url" },
        { status: 400 }
      )
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Atualizar broken_links para marcar como resolvido
    const { error: updateError } = await supabase
      .from("broken_links")
      .update({
        status_code: 200, // Marcar como resolvido (status 200)
        error: "Resolved",
      })
      .eq("domain_id", domain_id)
      .eq("link_url", link_url)
      .eq("user_id", user.id)

    if (updateError) {
      console.error("Erro ao atualizar broken_links:", updateError)
      return NextResponse.json(
        { error: updateError.message },
        { status: 400 }
      )
    }

    // Atualizar broken_link_occurrences para marcar como resolvido
    const { error: occurrenceError } = await supabase
      .from("broken_link_occurrences")
      .update({
        status_code: 200, // Marcar como resolvido
        server_response: "Resolved",
      })
      .eq("domain_id", domain_id)
      .eq("link_url", link_url)
      .eq("user_id", user.id)

    if (occurrenceError) {
      console.error("Erro ao atualizar broken_link_occurrences:", occurrenceError)
      // Não retornar erro aqui, pois a atualização em broken_links já foi feita
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Erro ao marcar como resolvido:", error)
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    )
  }
}
