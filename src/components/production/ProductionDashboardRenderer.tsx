'use client'

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from 'recharts'
import type { ProductionDashboardBundle, ProductionWidget } from '@/lib/types'
import {
  buildChartRows,
  chartPalette,
  chartSeriesKeys,
  displayValue,
  getProductionTable,
  labelFor,
  makeChartConfig,
} from '@/lib/production'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

interface ProductionDashboardRendererProps {
  bundle: ProductionDashboardBundle
  presentation?: boolean
  className?: string
}

export function ProductionDashboardRenderer({ bundle, presentation = false, className }: ProductionDashboardRendererProps) {
  const { dashboard, dataset } = bundle
  return (
    <div className={cn('grid gap-5', presentation ? 'xl:grid-cols-2' : 'xl:grid-cols-12', className)}>
      {dashboard.widgets.map((widget) => {
        const table = getProductionTable(dataset, widget.source_table_id)
        const wide = widget.chart_type === 'line' || widget.chart_type === 'area' || widget.chart_type === 'kpi-table'
        return (
          <Card
            key={widget.id}
            className={cn(
              'overflow-hidden border-border/70 bg-card/90 shadow-sm',
              presentation ? 'min-h-[360px]' : wide ? 'xl:col-span-12' : 'xl:col-span-6',
            )}
          >
            <CardHeader className="border-b border-border/60 pb-4">
              <CardTitle className={cn('tracking-tight', presentation ? 'text-2xl' : 'text-base')}>{widget.title}</CardTitle>
              {table && <CardDescription>{table.name} · {table.rows.length.toLocaleString()} rows</CardDescription>}
            </CardHeader>
            <CardContent className={presentation ? 'p-5' : 'p-4'}>
              {widget.chart_type === 'kpi-table' || widget.widget_type === 'table' ? (
                <ProductionTableView widget={widget} bundle={bundle} presentation={presentation} />
              ) : (
                <ProductionChart widget={widget} bundle={bundle} presentation={presentation} />
              )}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

function ProductionTableView({ widget, bundle, presentation }: { widget: ProductionWidget; bundle: ProductionDashboardBundle; presentation: boolean }) {
  const table = getProductionTable(bundle.dataset, widget.source_table_id)
  if (!table) return <EmptyWidget message="This table is no longer available." />
  const columns = table.columns.slice(0, presentation ? 8 : 12)
  const rows = table.rows.slice(0, presentation ? 8 : 25)
  return (
    <div className="overflow-hidden rounded-xl border border-border/70">
      <div className="max-h-[520px] overflow-auto">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-muted/80 backdrop-blur">
            <TableRow>
              {columns.map((column) => (
                <TableHead key={column.key} className={cn('whitespace-nowrap font-bold', presentation && 'text-base')}>
                  {column.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, rowIndex) => (
              <TableRow key={rowIndex} className={rowIndex === rows.length - 1 && String(row[columns[0]?.key]).toLowerCase() === 'total' ? 'bg-primary/10 font-bold' : undefined}>
                {columns.map((column) => (
                  <TableCell key={column.key} className={cn('whitespace-nowrap tabular-nums', presentation && 'text-lg')}>
                    {displayValue(row[column.key])}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

function ProductionChart({ widget, bundle, presentation }: { widget: ProductionWidget; bundle: ProductionDashboardBundle; presentation: boolean }) {
  const table = getProductionTable(bundle.dataset, widget.source_table_id)
  if (!table) return <EmptyWidget message="This chart source is no longer available." />
  const rows = buildChartRows(table, widget)
  const series = chartSeriesKeys(table, widget)
  const config = makeChartConfig(table, widget)
  if (!rows.length || !series.length) return <EmptyWidget message="Choose chart fields to preview this widget." />

  const heightClass = presentation ? 'h-[420px]' : 'h-[360px]'
  const commonAxis = {
    tickLine: false,
    axisLine: false,
    tickMargin: 10,
  }

  return (
    <ChartContainer config={config} className={cn('w-full', heightClass)}>
      {widget.chart_type === 'pie' ? (
        <PieChart>
          <ChartTooltip content={<ChartTooltipContent nameKey={series[0]} />} />
          <Pie data={rows} dataKey={series[0]} nameKey="category" innerRadius={presentation ? 70 : 50} outerRadius={presentation ? 145 : 110} paddingAngle={2}>
            {rows.map((_, index) => <Cell key={index} fill={chartPalette[index % chartPalette.length]} />)}
          </Pie>
          <ChartLegend content={<ChartLegendContent />} />
        </PieChart>
      ) : widget.chart_type === 'bar' || widget.chart_type === 'stacked-bar' ? (
        <BarChart data={rows} margin={{ left: 8, right: 8, top: 12, bottom: 8 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis dataKey="category" {...commonAxis} />
          <YAxis {...commonAxis} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <ChartLegend content={<ChartLegendContent />} />
          {series.map((key, index) => (
            <Bar key={key} dataKey={key} fill={`var(--color-${key})`} radius={[6, 6, 0, 0]} stackId={widget.chart_type === 'stacked-bar' ? 'production' : undefined} name={labelFor(table, key) || (index === 0 ? 'Value' : key)} />
          ))}
        </BarChart>
      ) : widget.chart_type === 'area' ? (
        <AreaChart data={rows} margin={{ left: 8, right: 8, top: 12, bottom: 8 }}>
          <defs>
            {series.map((key) => (
              <linearGradient key={key} id={`fill-${widget.id}-${key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={`var(--color-${key})`} stopOpacity={0.35} />
                <stop offset="95%" stopColor={`var(--color-${key})`} stopOpacity={0.03} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis dataKey="category" {...commonAxis} />
          <YAxis {...commonAxis} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <ChartLegend content={<ChartLegendContent />} />
          {series.map((key) => (
            <Area key={key} type="monotone" dataKey={key} stroke={`var(--color-${key})`} fill={`url(#fill-${widget.id}-${key})`} strokeWidth={2.5} dot={false} />
          ))}
        </AreaChart>
      ) : (
        <LineChart data={rows} margin={{ left: 8, right: 8, top: 12, bottom: 8 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis dataKey="category" {...commonAxis} />
          <YAxis {...commonAxis} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <ChartLegend content={<ChartLegendContent />} />
          {series.map((key) => (
            <Line key={key} type="monotone" dataKey={key} stroke={`var(--color-${key})`} strokeWidth={presentation ? 3 : 2.4} dot={{ r: presentation ? 4 : 3 }} activeDot={{ r: presentation ? 7 : 5 }} />
          ))}
        </LineChart>
      )}
    </ChartContainer>
  )
}

function EmptyWidget({ message }: { message: string }) {
  return (
    <div className="flex min-h-72 items-center justify-center rounded-xl border border-dashed border-border/70 bg-muted/20 px-6 text-center text-sm text-muted-foreground">
      {message}
    </div>
  )
}
