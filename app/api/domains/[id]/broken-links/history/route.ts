import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id: domainId } = await ctx.params
    const supabase = await createClient()

    // Get the current user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
    }

    // Fetch broken link occurrences for this domain
    const { data: links, error } = await supabase
      .from("broken_link_occurrences")
      .select("*")
      .eq("user_id", user.id)
      .eq("domain_id", domainId)
      .order("checked_at", { ascending: false })

    if (error) {
      console.error("Supabase error:", error)
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      results: links || [],
    })
  } catch (error) {
    console.error("Error fetching broken links history:", error)
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 }
    )
  }
}
