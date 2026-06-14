'use client'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'

interface SettingsSectionProps {
  title: string
  description?: string
  children: React.ReactNode
}

export function SettingsSection({ title, description, children }: SettingsSectionProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
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
    <div className="flex items-center justify-between gap-6 border-b border-border py-4 last:border-0">
      <div className="space-y-1">
        <Label>{label}</Label>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
        {monoValue !== undefined && <Badge variant="outline" className="font-mono">{monoValue}</Badge>}
      </div>
      {children}
    </div>
  )
}
