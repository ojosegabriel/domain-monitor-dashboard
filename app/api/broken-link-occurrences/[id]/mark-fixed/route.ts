
import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: occurrenceId } = await ctx.params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  
  const { error: updateError } = await supabase
    .from("broken_link_occurrences")
    .update({
      is_resolved: true,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", occurrenceId)
    .eq("user_id", user.id)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, message: "Marked as resolved" })
}
