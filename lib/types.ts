export interface Domain {
  id: string
  user_id: string
  name: string
  url: string
  status: "online" | "offline"
  uptime: number
  response_time: number
  check_interval: number
  last_checked_at: string
  created_at: string
}

export interface Alert {
  id: string
  user_id: string
  domain_id: string
  type: "down" | "up" | "slow"
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
  created_at: string
}

export interface UptimeDataPoint {
  hour: string
  uptime: number
}
