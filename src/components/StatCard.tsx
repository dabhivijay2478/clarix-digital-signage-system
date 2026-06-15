'use client'

import { memo, useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface StatCardProps {
  icon: string
  value: string | number
  label: string
  trend?: { value: number; positive: boolean }
  color?: 'accent' | 'success' | 'warning' | 'error' | 'info'
}

const colors = {
  accent: 'text-primary',
  success: 'text-green-400',
  warning: 'text-amber-400',
  error: 'text-red-400',
  info: 'text-chart-2',
}

function StatCard({ icon, value, label, trend, color = 'accent' }: StatCardProps) {
  const [displayValue, setDisplayValue] = useState(value)

  useEffect(() => {
    if (typeof value !== 'number') return
    const started = performance.now()
    let frame = 0
    const tick = (now: number) => {
      const progress = Math.min((now - started) / 500, 1)
      setDisplayValue(Math.round(value * progress))
      if (progress < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [value])

  return (
    <Card className="group relative min-h-36 overflow-hidden transition-all duration-200 hover:-translate-y-1 hover:border-primary/30 hover:shadow-xl hover:shadow-primary/5">
      <div className={cn('absolute -right-10 -top-10 size-28 rounded-full opacity-10 blur-2xl', color === 'success' ? 'bg-green-400' : color === 'warning' ? 'bg-chart-1' : color === 'info' ? 'bg-chart-2' : color === 'error' ? 'bg-red-400' : 'bg-primary')} />
      <CardHeader className="relative flex flex-row items-center justify-between pb-2">
        <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</span>
        <span className={cn('flex size-10 items-center justify-center rounded-xl border border-border/60 bg-muted/70 text-lg transition-transform group-hover:scale-105', colors[color])}>{icon}</span>
      </CardHeader>
      <CardContent className="relative flex items-end justify-between gap-2">
        <span className={cn('text-4xl font-bold tracking-[-0.05em]', colors[color])}>{typeof value === 'number' ? displayValue : value}</span>
        {trend && (
          <Badge variant="outline" className={trend.positive ? 'border-green-500/30 text-green-400' : 'border-red-500/30 text-red-400'}>
            {trend.positive ? '+' : '-'}{trend.value}%
          </Badge>
        )}
      </CardContent>
    </Card>
  )
}

export default memo(StatCard)
