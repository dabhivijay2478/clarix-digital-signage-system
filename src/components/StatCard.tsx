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
  compact?: boolean
}

const colors = {
  accent: 'text-primary',
  success: 'text-green-400',
  warning: 'text-amber-400',
  error: 'text-red-400',
  info: 'text-chart-2',
}

function StatCard({ icon, value, label, trend, color = 'accent', compact = false }: StatCardProps) {
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
    <Card className={cn('group relative overflow-hidden transition-all duration-200 hover:-translate-y-1 hover:border-primary/30 hover:shadow-xl hover:shadow-primary/5', compact ? 'min-h-24' : 'min-h-36')}>
      <div className={cn('absolute -right-8 -top-8 rounded-full opacity-10 blur-2xl', color === 'success' ? 'bg-green-400' : color === 'warning' ? 'bg-chart-1' : color === 'info' ? 'bg-chart-2' : color === 'error' ? 'bg-red-400' : 'bg-primary', compact ? 'size-20' : 'size-28')} />
      <CardHeader className="relative flex flex-row items-center justify-between pb-2">
        <span className={cn('font-semibold uppercase tracking-[0.14em] text-muted-foreground', compact ? 'text-[10px]' : 'text-xs')}>{label}</span>
        <span className={cn('flex items-center justify-center rounded-xl border border-border/60 bg-muted/70 transition-transform group-hover:scale-105', compact ? 'size-8 text-base' : 'size-10 text-lg', colors[color])}>{icon}</span>
      </CardHeader>
      <CardContent className="relative flex items-end justify-between gap-2">
        <span className={cn('font-bold tracking-[-0.05em]', compact ? 'text-2xl' : 'text-4xl', colors[color])}>{typeof value === 'number' ? displayValue : value}</span>
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
