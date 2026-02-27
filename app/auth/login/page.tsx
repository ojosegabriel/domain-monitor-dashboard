"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Activity, Mail, Lock, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import Link from "next/link"

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setLoading(true)

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    router.push("/dashboard")
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="flex w-full max-w-4xl overflow-hidden rounded-2xl shadow-xl">
        {/* Left panel */}
        <div className="hidden flex-col justify-between bg-[hsl(215,28%,14%)] p-10 text-[hsl(0,0%,100%)] md:flex md:w-1/2">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[hsl(217,72%,50%)]">
                <Activity className="h-5 w-5 text-[hsl(0,0%,100%)]" />
              </div>
              <span className="text-xl font-bold tracking-tight">UptimeGuard</span>
            </div>
          </div>
          <div className="space-y-6">
            <h2 className="text-balance text-3xl font-bold leading-tight">
              Monitor your domains with confidence.
            </h2>
            <p className="text-pretty text-base leading-relaxed text-[hsl(210,20%,70%)]">
              Real-time uptime monitoring, instant alerts, and detailed analytics for all your websites and APIs.
            </p>
            <div className="flex gap-8">
              <div>
                <p className="text-2xl font-bold">99.9%</p>
                <p className="text-sm text-[hsl(210,20%,60%)]">Avg. Uptime</p>
              </div>
              <div>
                <p className="text-2xl font-bold">{"< 30s"}</p>
                <p className="text-sm text-[hsl(210,20%,60%)]">Alert Speed</p>
              </div>
              <div>
                <p className="text-2xl font-bold">24/7</p>
                <p className="text-sm text-[hsl(210,20%,60%)]">Monitoring</p>
              </div>
            </div>
          </div>
          <p className="text-sm text-[hsl(210,20%,50%)]">
            UptimeGuard 2026. All rights reserved.
          </p>
        </div>

        {/* Right panel */}
        <Card className="flex w-full flex-col justify-center border-0 shadow-none md:w-1/2">
          <CardHeader className="px-8 pb-2 pt-10 md:px-12">
            <div className="mb-6 flex items-center gap-3 md:hidden">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
                <Activity className="h-4 w-4 text-primary-foreground" />
              </div>
              <span className="text-lg font-bold tracking-tight text-foreground">UptimeGuard</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Sign In</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Enter your credentials to access the dashboard
            </p>
          </CardHeader>
          <CardContent className="px-8 pb-10 pt-4 md:px-12">
            <form onSubmit={handleSubmit} className="space-y-5">
              {error && (
                <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                  {error}
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-medium text-foreground">
                  Email
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10"
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-medium text-foreground">
                  Password
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10"
                    required
                  />
                </div>
              </div>
              <Button
                type="submit"
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                size="lg"
                disabled={loading}
              >
                {loading ? "Signing in..." : "Sign In"}
                {!loading && <ArrowRight className="ml-2 h-4 w-4" />}
              </Button>
            </form>
            <p className="mt-6 text-center text-sm text-muted-foreground">
              {"Don't have an account? "}
              <Link href="/auth/sign-up" className="font-medium text-primary hover:underline">
                Sign up
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
