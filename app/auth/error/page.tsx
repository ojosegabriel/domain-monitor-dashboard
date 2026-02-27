import { Activity, AlertTriangle } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import Link from "next/link"

export default function AuthErrorPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md text-center">
        <CardContent className="flex flex-col items-center gap-4 p-10">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
            <AlertTriangle className="h-8 w-8 text-destructive" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Authentication Error</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Something went wrong during authentication. Please try again.
          </p>
          <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
            <Activity className="h-4 w-4 text-primary" />
            <span className="font-medium text-foreground">UptimeGuard</span>
          </div>
          <Link
            href="/auth/login"
            className="mt-2 text-sm font-medium text-primary hover:underline"
          >
            Back to Sign In
          </Link>
        </CardContent>
      </Card>
    </div>
  )
}
