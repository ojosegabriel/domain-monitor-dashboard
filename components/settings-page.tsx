"use client"

import { useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Switch } from "@/components/ui/switch"
import { Bell, Lock, User } from "lucide-react"

interface SettingsPageProps {
  profile: any
}

export function SettingsPage({ profile }: SettingsPageProps) {
  const [loading, setLoading] = useState(false)
  const [fullName, setFullName] = useState(profile?.full_name || "")
  const [whatsappNumber, setWhatsappNumber] = useState(profile?.whatsapp_number || "")
  const [twilioSid, setTwilioSid] = useState(profile?.twilio_sid || "")
  const [twilioToken, setTwilioToken] = useState(profile?.twilio_token || "")
  const [twilioFrom, setTwilioFrom] = useState(profile?.twilio_from || "")

  const supabase = createClient()

  async function handleUpdateProfile() {
    setLoading(true)
    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: fullName,
        whatsapp_number: whatsappNumber,
        twilio_sid: twilioSid,
        twilio_token: twilioToken,
        twilio_from: twilioFrom,
      })
      .eq("id", profile.id)

    if (!error) {
      alert("Configurações salvas com sucesso!")
    } else {
      alert("Erro ao salvar configurações")
    }
    setLoading(false)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Settings</h1>
        <p className="text-muted-foreground">Manage your account settings and notification preferences.</p>
      </div>

      <Tabs defaultValue="profile" className="space-y-4">
        <TabsList>
          <TabsTrigger value="profile" className="gap-2">
            <User className="h-4 w-4" />
            Profile
          </TabsTrigger>
          <TabsTrigger value="notifications" className="gap-2">
            <Bell className="h-4 w-4" />
            Notifications
          </TabsTrigger>
          <TabsTrigger value="security" className="gap-2">
            <Lock className="h-4 w-4" />
            Security
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Profile Information</CardTitle>
              <CardDescription>Update your personal details here.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Full Name</Label>
                <Input
                  id="name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Your full name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <Input id="email" value={profile?.email} disabled className="bg-muted" />
              </div>
              <Button onClick={handleUpdateProfile} disabled={loading}>
                {loading ? "Saving..." : "Save Changes"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="notifications" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>WhatsApp Alerts (Twilio)</CardTitle>
              <CardDescription>Configuração profissional de alertas via WhatsApp.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg bg-amber-50 dark:bg-amber-950 p-4 text-sm text-amber-800 dark:text-amber-200 mb-4">
                <p className="font-bold mb-2">Configuração Twilio Sandbox:</p>
                <ol className="list-decimal ml-4 space-y-1">
                  <li>Crie uma conta no <a href="https://twilio.com" target="_blank" className="underline">Twilio</a>.</li>
                  <li>Ative o Sandbox de WhatsApp no painel deles.</li>
                  <li>Envie o código de ativação do seu celular para o número do Twilio.</li>
                </ol>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Account SID</Label>
                  <Input
                    value={twilioSid}
                    onChange={(e) => setTwilioSid(e.target.value)}
                    placeholder="AC..."
                  />
                </div>
                <div className="space-y-2">
                  <Label>Auth Token</Label>
                  <Input
                    type="password"
                    value={twilioToken}
                    onChange={(e) => setTwilioToken(e.target.value)}
                    placeholder="token..."
                  />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Seu Número (Destino)</Label>
                  <Input
                    value={whatsappNumber}
                    onChange={(e) => setWhatsappNumber(e.target.value)}
                    placeholder="whatsapp:+55..."
                  />
                </div>
                <div className="space-y-2">
                  <Label>Número Twilio (Origem)</Label>
                  <Input
                    value={twilioFrom}
                    onChange={(e) => setTwilioFrom(e.target.value)}
                    placeholder="whatsapp:+1415..."
                  />
                </div>
              </div>
              <Button onClick={handleUpdateProfile} disabled={loading}>
                {loading ? "Saving..." : "Save Changes"}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Twilio Configuration</CardTitle>
              <CardDescription>Configure Twilio settings for WhatsApp integration.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">Configurar credenciais adicionais do Twilio se necessário.</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Password Security</CardTitle>
              <CardDescription>Change your password to keep your account secure.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="current">Current Password</Label>
                <Input id="current" type="password" placeholder="Current..." />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new">New Password</Label>
                <Input id="new" type="password" placeholder="New..." />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm">Confirm Password</Label>
                <Input id="confirm" type="password" placeholder="Confirm..." />
              </div>
              <Button variant="outline">Update Password</Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

export default SettingsPage
