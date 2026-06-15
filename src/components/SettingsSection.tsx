'use client'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'

interface SettingsSectionProps {
  title: string
  description?: string
  children: React.ReactNode
  className?: string
}

export function SettingsSection({ title, description, children, className }: SettingsSectionProps) {
  return (
    <Card className={className}>
      <CardHeader className="border-b border-border/50 pb-5">
        <CardTitle className="text-lg tracking-tight">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

interface SettingsRowProps {
  label: string
  description?: string
  monoValue?: string | number
  children?: React.ReactNode
}

export function SettingsRow({ label, description, monoValue, children }: SettingsRowProps) {
  return (
    <div className="flex items-center justify-between gap-6 border-b border-border/60 py-4 first:pt-0 last:border-0 last:pb-0">
      <div className="min-w-0 space-y-1">
        <Label className="font-medium">{label}</Label>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
        {monoValue !== undefined && <Badge variant="outline" className="font-mono">{monoValue}</Badge>}
      </div>
      {children}
    </div>
  )
}
