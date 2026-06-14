'use client'

import { BarChart3 } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Cell, XAxis } from 'recharts'
import StatCard from '@/components/StatCard'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAnalytics } from '@/hooks/useAnalytics'

const chartConfig = { count: { label: 'Events', color: 'var(--primary)' } } satisfies ChartConfig
const eventColors: Record<string, string> = { Impression: '#6366f1', Play: '#60a5fa', Complete: '#4ade80' }

export default function AnalyticsPage() {
  const { summary, timeline, loading, timeRange, setTimeRange } = useAnalytics()
  const formatNumber = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}K` : n.toString()
  const rate = summary && summary.completions + summary.skips > 0 ? (summary.completions / (summary.completions + summary.skips)) * 100 : 0

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="page-title">Analytics</h1><p className="page-subtitle">Performance metrics and insights</p></div>
        <Tabs value={String(timeRange)} onValueChange={(value) => setTimeRange(Number(value))}><TabsList>{[7, 14, 30].map((days) => <TabsTrigger key={days} value={String(days)}>{days}d</TabsTrigger>)}</TabsList></Tabs>
      </div>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon="👁" value={summary ? formatNumber(summary.impressions) : '—'} label="Impressions" trend={{ value: 12, positive: true }} />
        <StatCard icon="▶" value={summary ? formatNumber(summary.plays) : '—'} label="Plays" color="info" />
        <StatCard icon="⏱" value={summary ? `${summary.avg_dwell_secs.toFixed(1)}s` : '—'} label="Avg Dwell Time" color="warning" />
        <StatCard icon="◔" value={summary ? `${summary.uptime_pct}%` : '—'} label="Uptime" color="success" />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Event Timeline</CardTitle></CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-72" /> : timeline.length === 0 ? (
              <div className="flex h-72 flex-col items-center justify-center rounded-lg border border-dashed text-muted-foreground"><BarChart3 className="mb-3 size-10 opacity-40" /><p>No data for this period</p></div>
            ) : (
              <ChartContainer config={chartConfig} className="h-72 w-full">
                <BarChart accessibilityLayer data={timeline.slice(0, 14)}>
                  <CartesianGrid vertical={false} /><XAxis dataKey="date" tickLine={false} axisLine={false} tickFormatter={(value) => String(value).slice(-2)} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="count" radius={4}>{timeline.slice(0, 14).map((entry, index) => <Cell key={index} fill={eventColors[entry.event_type] || '#a1a1aa'} />)}</Bar>
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Completion Rate</CardTitle></CardHeader>
          <CardContent className="space-y-6">
            <Progress value={rate} />
            <Table><TableBody>
              <TableRow><TableCell className="text-muted-foreground">Completed</TableCell><TableCell className="text-right font-bold text-green-400">{summary ? formatNumber(summary.completions) : '—'}</TableCell></TableRow>
              <TableRow><TableCell className="text-muted-foreground">Skipped</TableCell><TableCell className="text-right font-bold text-red-400">{summary ? formatNumber(summary.skips) : '—'}</TableCell></TableRow>
              <TableRow><TableCell className="text-muted-foreground">Rate</TableCell><TableCell className="text-right font-bold">{summary ? `${rate.toFixed(1)}%` : '—'}</TableCell></TableRow>
              <TableRow><TableCell className="text-muted-foreground">Total Events</TableCell><TableCell className="text-right font-bold">{summary ? formatNumber(summary.impressions + summary.plays + summary.completions + summary.skips) : '—'}</TableCell></TableRow>
            </TableBody></Table>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
