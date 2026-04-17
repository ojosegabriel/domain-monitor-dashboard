

import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { domain_id, link_url, page_url } = body

    if (!domain_id || !link_url || !page_url) {
      return NextResponse.json(
        { error: "Missing domain_id, link_url, or page_url" },
        { status: 400 }
      )
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    
    const { error: occurrenceError } = await supabase
      .from("broken_link_occurrences")
      .update({
        status_code: 200, 
        server_response: "Resolved",
      })
      .eq("domain_id", domain_id)
      .eq("link_url", link_url)
      .eq("page_url", page_url)
      .eq("user_id", user.id)

    if (occurrenceError) {
      console.error("Erro ao atualizar broken_link_occurrences:", occurrenceError)
      return NextResponse.json(
        { error: occurrenceError.message },
        { status: 400 }
      )
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
