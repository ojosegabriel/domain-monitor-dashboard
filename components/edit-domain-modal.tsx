"use client"

import { useEffect, useState } from "react"
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
import type { Domain } from "@/lib/types"

interface EditDomainModalProps {
  domain: Domain | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onEdit: (id: string, name: string, url: string, checkInterval: number) => Promise<void>
}

export function EditDomainModal({ domain, open, onOpenChange, onEdit }: EditDomainModalProps) {
  const [name, setName] = useState("")
  const [url, setUrl] = useState("")
  const [interval, setInterval] = useState("5")
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (domain) {
      setName(domain.name)
      setUrl(domain.url)
      setInterval(domain.check_interval.toString())
    }
  }, [domain, open])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!domain || !name || !url) return

    setLoading(true)
    await onEdit(domain.id, name, url, parseInt(interval))
    setLoading(false)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-foreground">Edit Domain</DialogTitle>
          <DialogDescription>
            Update the details for your monitored domain.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-domain-name" className="text-foreground">Domain Name</Label>
            <Input
              id="edit-domain-name"
              placeholder="My Website"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-domain-url" className="text-foreground">URL</Label>
            <Input
              id="edit-domain-url"
              placeholder="https://example.com"
              value={url}
              onChange={(e ) => setUrl(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-check-interval" className="text-foreground">Check Interval</Label>
            <Select value={interval} onValueChange={setInterval}>
              <SelectTrigger id="edit-check-interval">
                <SelectValue placeholder="Select interval" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Every 1 minute</SelectItem>
                <SelectItem value="3">Every 3 minutes</SelectItem>
                <SelectItem value="5">Every 5 minutes</SelectItem>
                <SelectItem value="10">Every 10 minutes</SelectItem>
                <SelectItem value="15">Every 15 minutes</SelectItem>
                <SelectItem value="30">Every 30 minutes</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter className="gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="text-foreground">
              Cancel
            </Button>
            <Button type="submit" className="bg-primary text-primary-foreground hover:bg-primary/90" disabled={loading}>
              {loading ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
