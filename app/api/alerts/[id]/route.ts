import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    // Aguardar os params (Next.js 16+)
    const { id } = await ctx.params
    
    console.log("📍 ID recebido:", id)
    
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    console.log("👤 Usuário:", user?.id)

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { action } = body // "read" ou "delete"

    console.log("🎯 Ação:", action)

    if (action === "read") {
      // Marcar como lido
      const { error } = await supabase
        .from("alerts")
        .update({ is_read: true })
        .eq("id", id)
        .eq("user_id", user.id)

      if (error) {
        console.error("❌ Erro ao marcar como lido:", error)
        return NextResponse.json({ error: error.message }, { status: 400 })
      }

      console.log("✅ Alerta marcado como lido")
      return NextResponse.json({ success: true, message: "Alerta marcado como lido" })
    } else if (action === "delete") {
      // Soft delete
      const { error } = await supabase
        .from("alerts")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id)
        .eq("user_id", user.id)

      if (error) {
        console.error("❌ Erro ao deletar alerta:", error)
        return NextResponse.json({ error: error.message }, { status: 400 })
      }

      console.log("✅ Alerta deletado")
      return NextResponse.json({ success: true, message: "Alerta deletado" })
    } else {
      return NextResponse.json({ error: "Ação inválida" }, { status: 400 })
    }
  } catch (error) {
    console.error("❌ Erro na rota de alertas:", error)
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    )
  }
}
