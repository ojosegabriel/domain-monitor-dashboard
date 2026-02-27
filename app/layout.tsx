import type { Metadata } from 'next'
import { Inter } from 'next/font/google'

import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })

export const metadata: Metadata = {
  title: 'UptimeGuard - Domain Monitoring',
  description: 'Professional SaaS uptime monitoring dashboard for your domains',
}

// Arquivo: app/layout.tsx

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt-BR">
      <body 
        className={`${inter.variable} font-sans antialiased`}
        suppressHydrationWarning // Adicione esta linha aqui
      >
        {children}
      </body>
    </html>
  )
}


