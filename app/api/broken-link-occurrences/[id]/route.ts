// Arquivo 2: app/api/broken-link-occurrences/[id]/route.ts

import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: occurrenceId } = await ctx.params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  // ✅ Deletar a ocorrência
  const { error: deleteError } = await supabase
    .from("broken_link_occurrences")
    .delete()
    .eq("id", occurrenceId)
    .eq("user_id", user.id)

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, message: "Deleted" })
}
