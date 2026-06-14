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
  info: 'text-blue-400',
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
    <Card className="border-zinc-800/80 bg-zinc-900/60 shadow-lg backdrop-blur-md transition-all duration-200 hover:-translate-y-0.5 hover:border-zinc-700">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
        <span className={cn('flex size-10 items-center justify-center rounded-xl bg-muted text-lg', colors[color])}>{icon}</span>
      </CardHeader>
      <CardContent className="flex items-baseline gap-2">
        <span className={cn('text-3xl font-bold tracking-tight', colors[color])}>{typeof value === 'number' ? displayValue : value}</span>
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
