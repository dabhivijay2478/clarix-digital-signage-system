'use client'

import { memo, useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface StatCardProps {
  icon: string
  value: string | number
  label: string
  trend?: { value: number; positive: boolean }
  color?: 'accent' | 'success' | 'warning' | 'error' | 'info'
  compact?: boolean
}

const colorStyles = {
  accent: {
    text: 'text-emerald-500',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/20',
    glow: 'shadow-emerald-500/10',
  },
  success: {
    text: 'text-emerald-500',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/20',
    glow: 'shadow-emerald-500/10',
  },
  warning: {
    text: 'text-amber-500',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/20',
    glow: 'shadow-amber-500/10',
  },
  error: {
    text: 'text-red-500',
    bg: 'bg-red-500/10',
    border: 'border-red-500/20',
    glow: 'shadow-red-500/10',
  },
  info: {
    text: 'text-blue-500',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/20',
    glow: 'shadow-blue-500/10',
  },
}

function StatCard({ icon, value, label, trend, color = 'accent', compact = false }: StatCardProps) {
  const [displayValue, setDisplayValue] = useState(value)
  const styles = colorStyles[color]

  useEffect(() => {
    if (typeof value !== 'number') {
      setDisplayValue(value)
      return
    }
    
    const started = performance.now()
    let frame = 0
    
    const tick = (now: number) => {
      const progress = Math.min((now - started) / 500, 1)
      const easeOut = 1 - Math.pow(1 - progress, 3)
      setDisplayValue(Math.round(value * easeOut))
      
      if (progress < 1) {
        frame = requestAnimationFrame(tick)
      }
    }
    
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [value])

  return (
    <Card 
      className={cn(
        'group relative overflow-hidden border-border bg-card transition-all duration-200',
        'hover:shadow-md hover:border-border/60',
        compact ? 'hover:-translate-y-0.5' : 'hover:-translate-y-1'
      )}
    >
      {/* Subtle background glow on hover */}
      <div className={cn(
        'absolute -right-2 -top-2 rounded-full opacity-0 blur-xl transition-opacity duration-300',
        styles.bg,
        compact ? 'size-12' : 'size-16',
        'group-hover:opacity-60'
      )} />
      
      <CardContent className={cn(
        'relative flex items-center gap-3',
        compact ? 'p-3' : 'p-4'
      )}>
        {/* Icon */}
        <div className={cn(
          'flex shrink-0 items-center justify-center rounded-lg border transition-colors duration-200',
          styles.bg,
          styles.border,
          compact ? 'size-9 text-base' : 'size-10 text-lg'
        )}>
          {icon}
        </div>
        
        {/* Content */}
        <div className="min-w-0 flex-1">
          <p className={cn(
            'font-medium text-muted-foreground truncate',
            compact ? 'text-xs' : 'text-sm'
          )}>
            {label}
          </p>
          <div className="flex items-baseline gap-2">
            <span className={cn(
              'font-bold tracking-tight',
              compact ? 'text-xl' : 'text-2xl',
              styles.text
            )}>
              {typeof value === 'number' ? displayValue : value}
            </span>
            {trend && (
              <span className={cn(
                'text-xs font-medium',
                trend.positive ? 'text-emerald-500' : 'text-red-500'
              )}>
                {trend.positive ? '+' : '-'}{trend.value}%
              </span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default memo(StatCard)
