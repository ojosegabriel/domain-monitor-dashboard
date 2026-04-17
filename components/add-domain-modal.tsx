"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface AddDomainModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAdd: (name: string, url: string, checkInterval: number) => Promise<void>
}

export function AddDomainModal({ open, onOpenChange, onAdd }: AddDomainModalProps) {
  const [name, setName] = useState("")
  const [url, setUrl] = useState("")
  const [interval, setInterval] = useState("5")
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name || !url) return

    setLoading(true)
    await onAdd(name, url, parseInt(interval))
    setName("")
    setUrl("")
    setInterval("5")
    setLoading(false)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-foreground">Adicionar Novo Domínio</DialogTitle>
          <DialogDescription>
            Configure os detalhes do domínio que deseja monitorar, incluindo o nome, URL e intervalo de verificação.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="domain-name" className="text-foreground">Nome do Domínio</Label>
            <Input
              id="domain-name"
              placeholder="My Website"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="domain-url" className="text-foreground">URL</Label>
            <Input
              id="domain-url"
              placeholder="https://example.com"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="check-interval" className="text-foreground">Checar Intervalo</Label>
            <Select value={interval} onValueChange={setInterval}>
              <SelectTrigger id="check-interval">
                <SelectValue placeholder="Select interval" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">A cada 1 minuto</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter className="gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="text-foreground">
              Cancelar
            </Button>
            <Button type="submit" className="bg-primary text-primary-foreground hover:bg-primary/90" disabled={loading}>
              {loading ? "Adding..." : "Add Domain"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
