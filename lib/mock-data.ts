export interface Domain {
  id: string
  name: string
  url: string
  status: "online" | "offline"
  lastCheck: string
  uptime: number
  checkInterval: number
}

export const mockDomains: Domain[] = [
  {
    id: "1",
    name: "Google",
    url: "https://google.com",
    status: "online",
    lastCheck: "2026-02-12T14:30:00Z",
    uptime: 99.98,
    checkInterval: 5,
  },
  {
    id: "2",
    name: "GitHub",
    url: "https://github.com",
    status: "online",
    lastCheck: "2026-02-12T14:29:00Z",
    uptime: 99.95,
    checkInterval: 5,
  },
  {
    id: "3",
    name: "Vercel",
    url: "https://vercel.com",
    status: "online",
    lastCheck: "2026-02-12T14:28:00Z",
    uptime: 99.99,
    checkInterval: 10,
  },
  {
    id: "4",
    name: "My Blog",
    url: "https://meublog.com.br",
    status: "offline",
    lastCheck: "2026-02-12T14:25:00Z",
    uptime: 87.4,
    checkInterval: 3,
  },
  {
    id: "5",
    name: "API Server",
    url: "https://api.minhaempresa.com",
    status: "online",
    lastCheck: "2026-02-12T14:30:00Z",
    uptime: 99.7,
    checkInterval: 1,
  },
  {
    id: "6",
    name: "E-commerce",
    url: "https://loja.minhaempresa.com",
    status: "offline",
    lastCheck: "2026-02-12T14:20:00Z",
    uptime: 92.1,
    checkInterval: 5,
  },
  {
    id: "7",
    name: "Landing Page",
    url: "https://landing.minhaempresa.com",
    status: "online",
    lastCheck: "2026-02-12T14:30:00Z",
    uptime: 99.5,
    checkInterval: 15,
  },
  {
    id: "8",
    name: "Docs Portal",
    url: "https://docs.minhaempresa.com",
    status: "online",
    lastCheck: "2026-02-12T14:29:00Z",
    uptime: 98.8,
    checkInterval: 10,
  },
]

export const uptimeChartData = [
  { hour: "00:00", uptime: 100 },
  { hour: "01:00", uptime: 100 },
  { hour: "02:00", uptime: 99.5 },
  { hour: "03:00", uptime: 100 },
  { hour: "04:00", uptime: 98.2 },
  { hour: "05:00", uptime: 100 },
  { hour: "06:00", uptime: 100 },
  { hour: "07:00", uptime: 99.8 },
  { hour: "08:00", uptime: 97.5 },
  { hour: "09:00", uptime: 100 },
  { hour: "10:00", uptime: 100 },
  { hour: "11:00", uptime: 99.9 },
  { hour: "12:00", uptime: 100 },
  { hour: "13:00", uptime: 95.0 },
  { hour: "14:00", uptime: 100 },
  { hour: "15:00", uptime: 100 },
  { hour: "16:00", uptime: 99.7 },
  { hour: "17:00", uptime: 100 },
  { hour: "18:00", uptime: 98.5 },
  { hour: "19:00", uptime: 100 },
  { hour: "20:00", uptime: 100 },
  { hour: "21:00", uptime: 99.3 },
  { hour: "22:00", uptime: 100 },
  { hour: "23:00", uptime: 100 },
]
