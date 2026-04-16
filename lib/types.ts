export interface Domain {
  id: string
  user_id: string
  name: string
  url: string
  status: "online" | "offline"
  confirmed_status?: "online" | "offline"
  uptime: number
  response_time: number
  check_interval: number
  last_checked_at: string
  ssl_expiry_date: string | null
  ssl_status?: string
  ssl_checked_at?: string
  last_status_change?: string
  consecutive_checks?: number
  created_at: string
}

export interface Alert {
  id: string
  user_id: string
  domain_id: string
  alert_type: "offline" | "online" | "ssl_expiry" | "down" | "up" | "slow"
  type?: "down" | "up" | "slow" // Para compatibilidade com código antigo
  message: string
  created_at: string
  domains?: {
    name: string
    url: string
  }
}

export interface Profile {
  id: string
  full_name: string | null
  email: string | null
  whatsapp_number?: string
  twilio_sid?: string
  twilio_token?: string
  twilio_from?: string
  created_at: string
}

export interface UptimeDataPoint {
  hour: string
  uptime: number
}

export interface BrokenLink {
  id: string
  domain_id: string
  url: string
  status_code: number
  created_at: string
}

export interface BrokenLinkOccurrence {
  id: string
  broken_link_id: string
  scan_id: string
  found_at: string
  created_at: string
}

export interface BrokenLinkScan {
  id: string
  domain_id: string
  started_at: string
  completed_at: string | null
  total_links: number
  broken_links_found: number
  status: "pending" | "in_progress" | "completed" | "failed"
  created_at: string
}
