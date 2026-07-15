'use client'

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts'
import { TrendingUp, Factory, Activity } from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from '@/components/ui/chart'
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

/* ─── Static data (fake API response) ───────────────────────────────────── */
const FAKE_DATA = {
  monthlyProduction: [
    { Date: '01-07-2026', FSL: 423,  PSL1: 263, PSL2: 1030 },
    { Date: '02-07-2026', FSL: 95,   PSL1: 118, PSL2: 1068 },
    { Date: '03-07-2026', FSL: 582,  PSL1: 182, PSL2: 1009 },
    { Date: '04-07-2026', FSL: 545,  PSL1: 20,  PSL2: 968  },
    { Date: '05-07-2026', FSL: 539,  PSL1: 0,   PSL2: 1682 },
    { Date: '06-07-2026', FSL: 406,  PSL1: 244, PSL2: 1035 },
    { Date: '07-07-2026', FSL: 434,  PSL1: 153, PSL2: 857  },
    { Date: '08-07-2026', FSL: 282,  PSL1: 178, PSL2: 1199 },
    { Date: '09-07-2026', FSL: 42,   PSL1: 434, PSL2: 920  },
    { Date: '10-07-2026', FSL: 507,  PSL1: 216, PSL2: 1259 },
    { Date: '11-07-2026', FSL: 504,  PSL1: 127, PSL2: 843  },
    { Date: '12-07-2026', FSL: 529,  PSL1: 118, PSL2: 519  },
    { Date: '13-07-2026', FSL: 408,  PSL1: 142, PSL2: 1145 },
    { Date: '14-07-2026', FSL: 328,  PSL1: 0,   PSL2: 408  },
    { Date: '15-07-2026', FSL: 0,    PSL1: 0,   PSL2: 0    },
    { Date: '16-07-2026', FSL: 0,    PSL1: 0,   PSL2: 0    },
    { Date: '17-07-2026', FSL: 0,    PSL1: 0,   PSL2: 0    },
    { Date: '18-07-2026', FSL: 0,    PSL1: 0,   PSL2: 0    },
    { Date: '19-07-2026', FSL: 0,    PSL1: 0,   PSL2: 0    },
    { Date: '20-07-2026', FSL: 0,    PSL1: 0,   PSL2: 0    },
    { Date: '21-07-2026', FSL: 0,    PSL1: 0,   PSL2: 0    },
    { Date: '22-07-2026', FSL: 0,    PSL1: 0,   PSL2: 0    },
    { Date: '23-07-2026', FSL: 0,    PSL1: 0,   PSL2: 0    },
    { Date: '24-07-2026', FSL: 0,    PSL1: 0,   PSL2: 0    },
    { Date: '25-07-2026', FSL: 0,    PSL1: 0,   PSL2: 0    },
    { Date: '26-07-2026', FSL: 0,    PSL1: 0,   PSL2: 0    },
    { Date: '27-07-2026', FSL: 0,    PSL1: 0,   PSL2: 0    },
    { Date: '28-07-2026', FSL: 0,    PSL1: 0,   PSL2: 0    },
    { Date: '29-07-2026', FSL: 0,    PSL1: 0,   PSL2: 0    },
    { Date: '30-07-2026', FSL: 0,    PSL1: 0,   PSL2: 0    },
    { Date: '31-07-2026', FSL: 0,    PSL1: 0,   PSL2: 0    },
  ],
  Planingdata: [
    { LINE: 'FSL',  ABP: 14000, MONTHLY_PLAN: 14000, UPD_TIME: '2026-07-14T11:00:31.197Z' },
    { LINE: 'PSL1', ABP: 0,     MONTHLY_PLAN: 5200,  UPD_TIME: '2026-07-14T11:00:31.197Z' },
    { LINE: 'PSL2', ABP: 29000, MONTHLY_PLAN: 28000, UPD_TIME: '2026-07-14T11:00:31.197Z' },
  ],
  TodayLiveData: [
    { Date: '14-07-2026', FSL: 328, PSL1: 0, PSL2: 408 },
  ],
}

/* ─── Chart config (shadcn) ──────────────────────────────────────────────── */
const chartConfig: ChartConfig = {
  FSL:  { label: 'FSL',  color: 'hsl(239 84% 67%)' },
  PSL1: { label: 'PSL1', color: 'hsl(38 92% 50%)' },
  PSL2: { label: 'PSL2', color: 'hsl(142 71% 45%)' },
}

/* ─── Helpers ────────────────────────────────────────────────────────────── */
type LineKey = 'FSL' | 'PSL1' | 'PSL2'

function getPlan(line: string) {
  return FAKE_DATA.Planingdata.find((p) => p.LINE === line)
}

function calcActual(key: LineKey) {
  return FAKE_DATA.monthlyProduction.reduce((s, d) => s + d[key], 0)
}

function workingDays() {
  return FAKE_DATA.monthlyProduction.filter(
    (d) => d.FSL > 0 || d.PSL1 > 0 || d.PSL2 > 0
  ).length
}

function remainingDays() {
  return FAKE_DATA.monthlyProduction.filter(
    (d) => d.FSL === 0 && d.PSL1 === 0 && d.PSL2 === 0
  ).length
}

const WD = workingDays()
const RD = remainingDays()

const tableRows = (['FSL', 'PSL1', 'PSL2'] as LineKey[]).map((line) => {
  const lp        = getPlan(line)
  const abp       = lp?.ABP ?? 0
  const plan      = lp?.MONTHLY_PLAN ?? 0
  const actual    = calcActual(line)
  const prodRate  = WD > 0 ? Math.round(actual / WD) : 0
  const askRate   = RD > 0 ? Math.round((plan - actual) / RD) : 0
  const forecast  = actual + prodRate * RD
  return { line, abp, plan, actual, prodRate, askRate, forecast }
})

const totals = tableRows.reduce(
  (a, r) => ({
    abp: a.abp + r.abp, plan: a.plan + r.plan, actual: a.actual + r.actual,
    prodRate: a.prodRate + r.prodRate, askRate: a.askRate + r.askRate,
    forecast: a.forecast + r.forecast,
  }),
  { abp: 0, plan: 0, actual: 0, prodRate: 0, askRate: 0, forecast: 0 }
)

const chartData = FAKE_DATA.monthlyProduction
  .filter((d) => d.FSL > 0 || d.PSL1 > 0 || d.PSL2 > 0)
  .map((d) => ({
    date: d.Date.slice(0, 5),
    FSL: d.FSL, PSL1: d.PSL1, PSL2: d.PSL2,
  }))

const [, mm, yyyy] = FAKE_DATA.monthlyProduction[0].Date.split('-')
const monthLabel = `${new Date(`${yyyy}-${mm}-01`).toLocaleString('en-US', { month: 'short' })}'${yyyy.slice(2)}`

const today = FAKE_DATA.TodayLiveData[0]

const LINE_COLORS: Record<LineKey, string> = {
  FSL:  'hsl(239 84% 67%)',
  PSL1: 'hsl(38 92% 50%)',
  PSL2: 'hsl(142 71% 45%)',
}

function AskRateBadge({ value, isPlayer = false }: { value: number; isPlayer?: boolean }) {
  if (value < 0) {
    return (
      <span className={cn(
        'inline-flex items-center justify-center rounded px-2.5 py-0.5 text-xs font-bold',
        isPlayer && 'text-lg text-black'
      )}
        style={{ background: '#ffe600', color: '#1a1a1a', minWidth: 56 }}>
        {value}
      </span>
    )
  }
  return (
    <Badge variant="outline"
      className={cn(
        'border-green-500/30 bg-green-500/10 text-green-500 font-bold px-2.5',
        isPlayer && 'text-lg text-black'
      )}>
      +{value}
    </Badge>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   Reusable Production Dashboard component
═══════════════════════════════════════════════════════════════════════════ */
interface ProductionDashboardProps {
  mode?: 'application' | 'player'
}

export function ProductionDashboard({ mode = 'application' }: ProductionDashboardProps) {
  const isPlayer = mode === 'player'

  return (
    <div
      className={cn(
        'space-y-6 pb-8',
        isPlayer && 'production-player-surface min-h-full bg-white text-slate-950'
      )}
    >
      {!isPlayer && (
        <>
          {/* ── Page header ── */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-3">
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary shadow-[0_8px_24px_rgba(16,185,129,0.22)]"
              >
                <Factory size={20} color="#fff" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight">Production Summary</h1>
                <p className="text-xs text-muted-foreground">
                  Monthly production overview · {monthLabel}
                </p>
              </div>
            </div>
          </div>

          {/* ── Today Live cards ── */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {(['FSL', 'PSL1', 'PSL2'] as LineKey[]).map((line) => (
              <Card
                key={line}
                className="relative overflow-hidden border border-border/60 bg-card/80 shadow-sm"
                style={{ borderTopColor: LINE_COLORS[line], borderTopWidth: 3 }}
              >
                <CardContent className="p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="mb-1 text-[11px] font-bold uppercase tracking-widest"
                        style={{ color: LINE_COLORS[line] }}>
                        Today · {line}
                      </p>
                      <p className="text-4xl font-extrabold leading-none text-foreground">
                        {today[line].toLocaleString()}
                      </p>
                      <p className="mt-1.5 text-[11px] text-muted-foreground">MT produced today</p>
                    </div>
                    <div className="rounded-lg p-2" style={{ background: `${LINE_COLORS[line]}18` }}>
                      <Activity size={18} style={{ color: LINE_COLORS[line] }} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      {/* ── Summary Table ── */}
      <Card className={cn(isPlayer && 'border-slate-200 bg-white text-slate-950 shadow-sm backdrop-blur-none')}>
        <CardHeader className={cn('pb-3', isPlayer && 'border-b border-slate-200 pb-5')}>
          <CardTitle className={cn('flex items-center gap-2 text-base', isPlayer && 'text-3xl text-black')}>
            <TrendingUp className={cn('h-4 w-4 text-primary', isPlayer && 'h-7 w-7 text-black')} />
            Production Summary — {monthLabel}
          </CardTitle>
          <CardDescription className={cn('text-xs', isPlayer && 'text-lg text-black')}>
            ABP · Monthly Plan · Actual vs Target with Asking Rate &amp; Forecast
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className={cn('hover:bg-transparent border-b bg-muted/40', isPlayer && 'border-slate-200 bg-slate-50')}>
                {['Lines', 'ABP', 'Plan', 'Actual', 'Production Rate', 'Asking Rate', 'Forecast'].map((h) => (
                  <TableHead key={h}
                    className={cn(
                      'h-11 px-4 text-center text-[11px] font-bold uppercase tracking-wider text-muted-foreground',
                      isPlayer && 'h-16 text-base text-black'
                    )}>
                    {h}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {tableRows.map((row) => (
                <TableRow key={row.line} className={cn(isPlayer && 'border-slate-200 hover:bg-slate-50')}>
                  <TableCell className={cn('px-4 py-3 text-center', isPlayer && 'py-6 text-xl text-black')}>
                    <span className="inline-flex items-center gap-1.5 font-bold"
                      style={{ color: isPlayer ? '#000000' : LINE_COLORS[row.line as LineKey] }}>
                      <span className="h-2 w-2 rounded-full"
                        style={{ background: LINE_COLORS[row.line as LineKey] }} />
                      {row.line}
                    </span>
                  </TableCell>
                  <TableCell className={cn('px-4 py-3 text-center text-muted-foreground', isPlayer && 'py-6 text-xl text-black')}>{row.abp.toLocaleString()}</TableCell>
                  <TableCell className={cn('px-4 py-3 text-center text-muted-foreground', isPlayer && 'py-6 text-xl text-black')}>{row.plan.toLocaleString()}</TableCell>
                  <TableCell className={cn('px-4 py-3 text-center font-semibold text-foreground', isPlayer && 'py-6 text-xl text-black')}>{row.actual.toLocaleString()}</TableCell>
                  <TableCell className={cn('px-4 py-3 text-center text-muted-foreground', isPlayer && 'py-6 text-xl text-black')}>{row.prodRate}</TableCell>
                  <TableCell className={cn('px-4 py-3 text-center', isPlayer && 'py-6 text-xl text-black')}><AskRateBadge value={row.askRate} isPlayer={isPlayer} /></TableCell>
                  <TableCell className={cn('px-4 py-3 text-center font-semibold text-primary', isPlayer && 'py-6 text-xl text-black')}>{row.forecast.toLocaleString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow className={cn('bg-muted/60 font-bold', isPlayer && 'border-slate-200 bg-slate-100 text-slate-950')}>
                <TableCell className={cn('px-4 py-3 text-center text-foreground font-extrabold', isPlayer && 'py-6 text-xl text-black')}>Total</TableCell>
                <TableCell className={cn('px-4 py-3 text-center', isPlayer && 'py-6 text-xl text-black')}>{totals.abp.toLocaleString()}</TableCell>
                <TableCell className={cn('px-4 py-3 text-center', isPlayer && 'py-6 text-xl text-black')}>{totals.plan.toLocaleString()}</TableCell>
                <TableCell className={cn('px-4 py-3 text-center text-foreground', isPlayer && 'py-6 text-xl text-black')}>{totals.actual.toLocaleString()}</TableCell>
                <TableCell className={cn('px-4 py-3 text-center', isPlayer && 'py-6 text-xl text-black')}>{totals.prodRate}</TableCell>
                <TableCell className={cn('px-4 py-3 text-center', isPlayer && 'py-6 text-xl text-black')}><AskRateBadge value={totals.askRate} isPlayer={isPlayer} /></TableCell>
                <TableCell className={cn('px-4 py-3 text-center text-primary', isPlayer && 'py-6 text-xl text-black')}>{totals.forecast.toLocaleString()}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </CardContent>
      </Card>

      {/* ── Production Trend Chart ── */}
      <Card className={cn(isPlayer && 'border-slate-200 bg-white text-slate-950 shadow-sm backdrop-blur-none')}>
        <CardHeader>
          <CardTitle className={cn('text-center text-base underline decoration-primary/40 underline-offset-4', isPlayer && 'text-3xl text-black no-underline')}>
            Production trend {monthLabel} (MT)
          </CardTitle>
          <CardDescription className={cn('text-center text-xs', isPlayer && 'text-lg text-black')}>
            Daily production quantities for FSL, PSL1 and PSL2
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartConfig} className={cn('h-[360px] w-full', isPlayer && 'h-[420px] text-lg text-black')}>
            <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" className={cn('stroke-border/40', isPlayer && 'stroke-slate-200')} />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: isPlayer ? 16 : 11, fill: isPlayer ? '#000000' : undefined }}
                label={{ value: 'Date', position: 'insideBottom', offset: -12, fontSize: isPlayer ? 16 : 12, fontWeight: 600, fill: isPlayer ? '#000000' : undefined }}
                height={46}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: isPlayer ? 16 : 11, fill: isPlayer ? '#000000' : undefined }}
                label={{ value: 'Qty', angle: -90, position: 'insideLeft', offset: 12, fontSize: isPlayer ? 16 : 12, fontWeight: 600, fill: isPlayer ? '#000000' : undefined }}
              />
              <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
              <ChartLegend content={<ChartLegendContent className={cn(isPlayer && 'text-base font-semibold text-black')} />} />
              <Line type="monotone" dataKey="FSL"  stroke="var(--color-FSL)"  strokeWidth={2.5} dot={{ r: 4, strokeWidth: 0, fill: 'var(--color-FSL)'  }} activeDot={{ r: 6 }} name="FSL"  />
              <Line type="monotone" dataKey="PSL1" stroke="var(--color-PSL1)" strokeWidth={2.5} dot={{ r: 4, strokeWidth: 0, fill: 'var(--color-PSL1)' }} activeDot={{ r: 6 }} name="PSL1" />
              <Line type="monotone" dataKey="PSL2" stroke="var(--color-PSL2)" strokeWidth={2.5} dot={{ r: 4, strokeWidth: 0, fill: 'var(--color-PSL2)' }} activeDot={{ r: 6 }} name="PSL2" />
            </LineChart>
          </ChartContainer>
        </CardContent>
      </Card>
    </div>
  )
}
