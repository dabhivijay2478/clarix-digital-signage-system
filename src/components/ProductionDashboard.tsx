'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ChartNoAxesCombined,
  CircleCheckBig,
  ClipboardList,
  Factory,
  Gauge,
  Loader2,
  Radio,
  RefreshCw,
  Rocket,
  Settings,
  Target,
  Zap,
  Wifi,
  WifiOff,
} from 'lucide-react'
import {
  CartesianGrid,
  Line,
  LineChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import Modal from '@/components/Modal'
import { PRODUCTION_DASHBOARD_CRITICAL_CSS } from '@/components/production-dashboard-critical-styles'
import { showToast } from '@/components/Toast'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useControllerClock } from '@/hooks/useControllerClock'
import {
  calculateProductionDerivedMetrics,
  formatProductionDateLabel,
  getProductionDateOrder,
  getProductionMonthTiming,
  getProductionPeriodLabel,
  hasProductionValues,
  normalizeProductionPayload,
  type ProductionApiConfig,
  type ProductionLine,
  type ProductionLiveSnapshot,
} from '@/lib/production-data'
import { getBrowserControllerOrigin, productionApi } from '@/lib/tauri'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/authStore'

const PRODUCTION_LINES: ProductionLine[] = ['FSL', 'PSL1', 'PSL2']
const DEFAULT_API_ENDPOINT = 'https://172.16.254.249:443/DSC_DSB_API/api/production-summary'
const PLAYER_CACHE_POLL_MS = 30_000
const PRODUCTION_CLOCK_TICK_MS = 60_000
const PRODUCTION_CLOCK_RESYNC_MS = 300_000

const REFRESH_OPTIONS = [
  { seconds: 300, label: '5 minutes' },
  { seconds: 900, label: '15 minutes' },
  { seconds: 3_600, label: '1 hour' },
  { seconds: 18_000, label: '5 hours' },
  { seconds: 86_400, label: '24 hours' },
] as const

const LINE_COLORS: Record<ProductionLine, string> = {
  FSL: '#156082',
  PSL1: '#e97132',
  PSL2: '#196b24',
}

const LINE_LABELS: Record<ProductionLine, string> = {
  FSL: 'FSL1',
  PSL1: 'PSL1',
  PSL2: 'PSL2',
}

type Metric = number | null

interface ChartPoint {
  date: string
  FSL: Metric
  PSL1: Metric
  PSL2: Metric
}

interface ProductionTableRow {
  line: ProductionLine
  abp: Metric
  plan: Metric
  actual: Metric
  achievement: Metric
  prodRate: Metric
  askRate: Metric
  forecast: Metric
  live: Metric
}

function sumMetrics(values: Metric[]): Metric {
  const available = values.filter((value): value is number => value !== null)
  return available.length > 0 ? available.reduce((total, value) => total + value, 0) : null
}

function formatMetric(value: Metric): string {
  return value === null ? '--' : String(Math.round(value))
}

function formatAchievement(value: Metric): string {
  return value === null ? '--' : `${Math.round(value)}%`
}

function formatLastUpdated(value: string | null | undefined): string {
  if (!value) return 'Never'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
}

function ProductionTrendChart({ data }: { data: ChartPoint[] }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 1920, height: 720 })
  const chartFontSize = Math.round(Math.max(10, Math.min(16, size.height * 0.026)))
  const chartLabelSize = Math.round(Math.max(12, Math.min(18, size.height * 0.032)))

  useEffect(() => {
    const element = hostRef.current
    if (!element) return

    const measure = () => {
      const rect = element.getBoundingClientRect()
      if (rect.width > 0 && rect.height > 0) {
        setSize({ width: Math.floor(rect.width), height: Math.floor(rect.height) })
      }
    }

    measure()
    window.addEventListener('resize', measure)
    const timers = [100, 400, 1000].map((delay) => window.setTimeout(measure, delay))
    return () => {
      window.removeEventListener('resize', measure)
      timers.forEach((timer) => window.clearTimeout(timer))
    }
  }, [])

  return (
    <div
      ref={hostRef}
      className="mg-prod-chart text-black"
      style={{ width: '100%', height: '100%', flex: 1, minHeight: 0, position: 'relative' }}
    >
      {size.width > 0 && size.height > 0 && (
        <LineChart
          width={size.width}
          height={size.height}
          data={data}
          margin={{ top: 8, right: 28, left: 4, bottom: 2 }}
        >
          <CartesianGrid vertical={false} stroke="#d9d9d9" />
          <XAxis
            dataKey="date"
            tickLine={false}
            axisLine={{ stroke: '#a6a6a6' }}
            tick={{ fontSize: chartFontSize, fill: '#000000' }}
            angle={-90}
            textAnchor="end"
            interval={0}
            tickMargin={7}
            label={{
              value: 'Date',
              position: 'insideBottom',
              offset: -2,
              fontSize: chartLabelSize,
              fontWeight: 700,
              fill: '#000000',
            }}
            height={Math.max(82, chartFontSize * 5.4)}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
            domain={[0, 'auto']}
            tick={{ fontSize: chartFontSize, fill: '#000000' }}
            label={{
              value: 'Qty',
              angle: -90,
              position: 'insideLeft',
              offset: 12,
              fontSize: chartLabelSize,
              fontWeight: 700,
              fill: '#000000',
            }}
            width={Math.max(48, chartFontSize * 2.7)}
          />
          <Tooltip
            contentStyle={{
              background: '#ffffff',
              border: '1px solid #a6a6a6',
              borderRadius: 4,
              color: '#000000',
            }}
          />
          {PRODUCTION_LINES.map((line) => (
            <Line
              key={line}
              type="linear"
              dataKey={line}
              stroke={LINE_COLORS[line]}
              strokeWidth={3}
              dot={{ r: 4, strokeWidth: 0, fill: LINE_COLORS[line] }}
              activeDot={{ r: 6, strokeWidth: 0 }}
              name={LINE_LABELS[line]}
              connectNulls
            />
          ))}
        </LineChart>
      )}
    </div>
  )
}

interface ProductionDashboardProps {
  mode?: 'application' | 'player'
}

export function ProductionDashboard({ mode = 'application' }: ProductionDashboardProps) {
  const isPlayer = mode === 'player'
  const { now: controllerNow, timeZone: controllerTimeZone } = useControllerClock({
    tickIntervalMs: PRODUCTION_CLOCK_TICK_MS,
    resyncIntervalMs: PRODUCTION_CLOCK_RESYNC_MS,
  })
  const token = useAuthStore((state) => state.token)
  const user = useAuthStore((state) => state.user)
  const canManageProductionRefresh = Boolean(
    token && user && (user.is_developer || user.role === 'Manager'),
  )
  const [snapshot, setSnapshot] = useState<ProductionLiveSnapshot | null>(null)
  const [config, setConfig] = useState<ProductionApiConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [settingsEndpoint, setSettingsEndpoint] = useState(DEFAULT_API_ENDPOINT)
  const [settingsApiKey, setSettingsApiKey] = useState('')
  const [clearApiKey, setClearApiKey] = useState(false)
  const [allowInvalidCertificates, setAllowInvalidCertificates] = useState(false)
  const [savingSettings, setSavingSettings] = useState(false)

  const loadSnapshot = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const next = await productionApi.getLiveData()
      setSnapshot(next)
    } catch (error) {
      setSnapshot((current) => current ?? {
        configured: false,
        endpoint: DEFAULT_API_ENDPOINT,
        refreshIntervalSecs: 900,
        data: null,
        lastAttemptAt: null,
        lastSuccessAt: null,
        lastError: error instanceof Error ? error.message : String(error),
      })
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  const loadConfig = useCallback(async () => {
    if (isPlayer) return
    try {
      const next = await productionApi.getLiveConfig()
      setConfig(next)
      setSettingsEndpoint(next.endpoint)
      setAllowInvalidCertificates(next.allowInvalidCertificates)
    } catch {
      // Browser-only controller views can read cached data but credentials are
      // intentionally configurable only from the desktop controller.
    }
  }, [isPlayer])

  useEffect(() => {
    void loadSnapshot()
    void loadConfig()

    const interval = window.setInterval(() => void loadSnapshot(true), PLAYER_CACHE_POLL_MS)
    let events: EventSource | null = null
    if (window.location.protocol.startsWith('http')) {
      events = new EventSource(`${getBrowserControllerOrigin()}/v1/browser/events`)
      events.addEventListener('revision', () => void loadSnapshot(true))
    }
    const refreshOnFocus = () => {
      void loadSnapshot(true)
      void loadConfig()
    }
    window.addEventListener('focus', refreshOnFocus)
    return () => {
      window.clearInterval(interval)
      events?.close()
      window.removeEventListener('focus', refreshOnFocus)
    }
  }, [loadConfig, loadSnapshot])

  useEffect(() => {
    if (!config && snapshot) {
      setSettingsEndpoint(snapshot.endpoint)
    }
  }, [config, snapshot])

  const normalized = useMemo(
    () => normalizeProductionPayload(snapshot?.data),
    [snapshot?.data],
  )
  const hasData = hasProductionValues(normalized)
  const periodLabel = getProductionPeriodLabel(normalized)
  const activeMonthlyProduction = useMemo(() => {
    const todayOrder = getProductionDateOrder(normalized.todayProduction?.date ?? '')
    if (todayOrder !== null) {
      const throughToday = normalized.monthlyProduction.filter((point) => {
        const pointOrder = getProductionDateOrder(point.date)
        return pointOrder === null || pointOrder <= todayOrder
      })
      if (throughToday.length > 0) return throughToday
    }

    let lastActiveIndex = -1
    normalized.monthlyProduction.forEach((point, index) => {
      if (PRODUCTION_LINES.some((line) => (point[line] ?? 0) !== 0)) {
        lastActiveIndex = index
      }
    })
    return lastActiveIndex >= 0
      ? normalized.monthlyProduction.slice(0, lastActiveIndex + 1)
      : normalized.monthlyProduction
  }, [normalized.monthlyProduction, normalized.todayProduction?.date])
  const productionPeriodDate = normalized.todayProduction?.date
    || normalized.monthlyProduction.find((point) => getProductionDateOrder(point.date) !== null)?.date
    || ''
  const monthTiming = useMemo(
    () => getProductionMonthTiming(productionPeriodDate, controllerNow, controllerTimeZone),
    [controllerNow, controllerTimeZone, productionPeriodDate],
  )

  const tableRows = useMemo<ProductionTableRow[]>(() => (
    PRODUCTION_LINES.map((line) => {
      const plan = normalized.planning.find((entry) => entry.line === line)
      const actual = sumMetrics(normalized.monthlyProduction.map((point) => point[line]))
      const planValue = plan?.monthlyPlan ?? null
      const { achievement, prodRate, askRate, forecast } = calculateProductionDerivedMetrics(
        actual,
        planValue,
        monthTiming,
      )
      return {
        line,
        abp: plan?.abp ?? null,
        plan: planValue,
        actual,
        achievement,
        prodRate,
        askRate,
        forecast,
        live: normalized.todayProduction?.[line] ?? null,
      }
    })
  ), [monthTiming, normalized.monthlyProduction, normalized.planning, normalized.todayProduction])

  const totals = useMemo(() => {
    const plan = sumMetrics(tableRows.map((row) => row.plan))
    const actual = sumMetrics(tableRows.map((row) => row.actual))
    return {
      abp: sumMetrics(tableRows.map((row) => row.abp)),
      plan,
      actual,
      achievement: actual !== null && plan !== null && plan > 0 ? (actual / plan) * 100 : null,
      prodRate: sumMetrics(tableRows.map((row) => row.prodRate)),
      askRate: sumMetrics(tableRows.map((row) => row.askRate)),
      forecast: sumMetrics(tableRows.map((row) => row.forecast)),
      live: sumMetrics(tableRows.map((row) => row.live)),
    }
  }, [tableRows])

  const chartData = useMemo<ChartPoint[]>(() => (
    activeMonthlyProduction
      .filter((point) => PRODUCTION_LINES.some((line) => point[line] !== null))
      .map((point) => ({
        date: formatProductionDateLabel(point.date),
        FSL: point.FSL,
        PSL1: point.PSL1,
        PSL2: point.PSL2,
      }))
  ), [activeMonthlyProduction])

  const effectiveConfig = config ?? (snapshot ? {
    endpoint: snapshot.endpoint,
    refreshIntervalSecs: snapshot.refreshIntervalSecs,
    apiKeyConfigured: snapshot.configured,
    allowInvalidCertificates: false,
    lastAttemptAt: snapshot.lastAttemptAt,
    lastSuccessAt: snapshot.lastSuccessAt,
    lastError: snapshot.lastError,
  } : null)
  const refreshOptionLabel = REFRESH_OPTIONS.find(
    (option) => option.seconds === (effectiveConfig?.refreshIntervalSecs ?? 900),
  )?.label ?? '15 minutes'

  const updateRefreshInterval = async (value: string) => {
    if (!effectiveConfig || !token || !canManageProductionRefresh) return
    const refreshIntervalSecs = Number(value)
    try {
      const next = await productionApi.updateLiveConfig(token, {
        endpoint: effectiveConfig.endpoint,
        refreshIntervalSecs,
        allowInvalidCertificates: effectiveConfig.allowInvalidCertificates,
      })
      setConfig(next)
      setSnapshot((current) => current ? { ...current, refreshIntervalSecs } : current)
      showToast(`Production refresh set to ${REFRESH_OPTIONS.find((option) => option.seconds === refreshIntervalSecs)?.label}`, 'success')
    } catch (error) {
      showToast(`Could not update refresh interval: ${error}`, 'error')
    }
  }

  const refreshNow = async () => {
    if (!token || !canManageProductionRefresh) return
    setRefreshing(true)
    try {
      const next = await productionApi.refreshLiveData(token)
      setSnapshot(next)
      await loadConfig()
      showToast('Production data refreshed', 'success')
    } catch (error) {
      showToast(`Production refresh failed: ${error}`, 'error')
      await loadSnapshot(true)
    } finally {
      setRefreshing(false)
    }
  }

  const saveApiSettings = async () => {
    if ((!effectiveConfig && !settingsEndpoint) || !token || !canManageProductionRefresh) return
    setSavingSettings(true)
    try {
      const next = await productionApi.updateLiveConfig(token, {
        endpoint: settingsEndpoint.trim(),
        refreshIntervalSecs: effectiveConfig?.refreshIntervalSecs ?? 900,
        apiKey: settingsApiKey || undefined,
        clearApiKey,
        allowInvalidCertificates,
      })
      setConfig(next)
      setSettingsApiKey('')
      setClearApiKey(false)
      setShowSettings(false)
      showToast('Production API settings saved', 'success')
      if (next.apiKeyConfigured) await refreshNow()
    } catch (error) {
      showToast(`Could not save production API settings: ${error}`, 'error')
    } finally {
      setSavingSettings(false)
    }
  }

  if (!hasData) {
    return (
      <div
        className={cn(
          'flex min-h-[460px] items-center justify-center',
          isPlayer && 'production-player-surface h-full min-h-full bg-white text-slate-950',
        )}
      >
        {isPlayer && <style dangerouslySetInnerHTML={{ __html: PRODUCTION_DASHBOARD_CRITICAL_CSS }} />}
        <div className="max-w-xl px-8 text-center">
          {loading ? (
            <Loader2 className="mx-auto mb-5 size-12 animate-spin text-emerald-600" />
          ) : snapshot?.configured ? (
            <WifiOff className="mx-auto mb-5 size-12 text-amber-500" />
          ) : (
            <Settings className="mx-auto mb-5 size-12 text-slate-400" />
          )}
          <h2 className={cn('text-2xl font-bold', isPlayer && 'text-black')}>
            {loading
              ? 'Loading production data'
              : snapshot?.configured
                ? 'Production data unavailable'
                : 'Production API not configured'}
          </h2>
          <p className={cn('mt-2 text-sm text-muted-foreground', isPlayer && 'text-black')}>
            {snapshot?.lastError
              || (isPlayer
                ? 'Configure the production API from the controller.'
                : canManageProductionRefresh
                  ? 'Open API settings, enter the controller API key, and refresh.'
                  : 'A Manager or Developer must configure the production API.')}
          </p>
          {!isPlayer && !loading && (
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              {canManageProductionRefresh ? (
                <>
                  <Select
                    value={String(effectiveConfig?.refreshIntervalSecs ?? 900)}
                    onValueChange={(value) => void updateRefreshInterval(value)}
                  >
                    <SelectTrigger className="w-[170px]" aria-label="Production refresh interval">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {REFRESH_OPTIONS.map((option) => (
                        <SelectItem key={option.seconds} value={String(option.seconds)}>
                          Every {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button variant="outline" onClick={() => setShowSettings(true)}>
                    <Settings className="size-4" /> API Settings
                  </Button>
                  <Button onClick={() => void refreshNow()} disabled={!snapshot?.configured || refreshing}>
                    <RefreshCw className={cn('size-4', refreshing && 'animate-spin')} /> Refresh now
                  </Button>
                </>
              ) : (
                <Badge variant="outline" className="gap-1.5">
                  <RefreshCw className="size-3.5" />
                  Refreshes every {refreshOptionLabel}
                </Badge>
              )}
            </div>
          )}
        </div>
        {!isPlayer && canManageProductionRefresh && renderSettingsModal()}
      </div>
    )
  }

  return (
    <div
      className={cn(
        isPlayer
          ? 'mg-prod-player-layout production-player-surface bg-white text-slate-950'
          : 'space-y-4 pb-6',
      )}
    >
      <style dangerouslySetInnerHTML={{ __html: PRODUCTION_DASHBOARD_CRITICAL_CSS }} />

      {!isPlayer && (
        <>
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary">
                <Factory size={20} color="#fff" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight">Production Summary</h1>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>Live production overview - {periodLabel}</span>
                  <Badge variant="outline" className={cn(
                    'gap-1 border-emerald-500/25 bg-emerald-500/10 text-emerald-500',
                    snapshot?.lastError && 'border-amber-500/25 bg-amber-500/10 text-amber-500',
                  )}>
                    {snapshot?.lastError ? <WifiOff className="size-3" /> : <Wifi className="size-3" />}
                    {snapshot?.lastError ? 'Cached' : 'Live'}
                  </Badge>
                  <span>Updated {formatLastUpdated(snapshot?.lastSuccessAt)}</span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {canManageProductionRefresh ? (
                <>
                  <Select
                    value={String(effectiveConfig?.refreshIntervalSecs ?? 900)}
                    onValueChange={(value) => void updateRefreshInterval(value)}
                  >
                    <SelectTrigger className="w-[170px]" aria-label="Production refresh interval">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {REFRESH_OPTIONS.map((option) => (
                        <SelectItem key={option.seconds} value={String(option.seconds)}>
                          Every {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button variant="outline" onClick={() => void refreshNow()} disabled={refreshing}>
                    <RefreshCw className={cn('size-4', refreshing && 'animate-spin')} />
                    Refresh
                  </Button>
                  <Button variant="outline" size="icon" onClick={() => setShowSettings(true)} title="API settings">
                    <Settings className="size-4" />
                  </Button>
                </>
              ) : (
                <Badge variant="outline" className="gap-1.5">
                  <RefreshCw className="size-3.5" />
                  Refreshes every {refreshOptionLabel}
                </Badge>
              )}
            </div>
          </div>

          {snapshot?.lastError && (
            <div className="border-y border-amber-500/25 bg-amber-500/5 px-4 py-3 text-sm text-amber-600 dark:text-amber-400">
              Showing the last successful production data. Latest refresh: {snapshot.lastError}
            </div>
          )}
        </>
      )}

      <section className="production-report" aria-label={`Production summary ${periodLabel}`}>
        <div className="production-report-table-wrap">
          <table className="production-report-table">
            <thead>
              <tr>
                <th>LINES</th>
                <th><span><Gauge aria-hidden="true" />ABP</span></th>
                <th><span><ClipboardList aria-hidden="true" />PLAN</span></th>
                <th><span><CircleCheckBig aria-hidden="true" />ACTUAL</span></th>
                <th><span><Target aria-hidden="true" />ACH%</span></th>
                <th><span><Zap aria-hidden="true" />PROD RATE</span></th>
                <th><span><Rocket aria-hidden="true" />ASK RATE</span></th>
                <th><span><ChartNoAxesCombined aria-hidden="true" />FORECAST</span></th>
                <th><span><Radio aria-hidden="true" />LIVE DATA</span></th>
              </tr>
            </thead>
            <tbody>
              {tableRows.map((row) => (
                <tr key={row.line} className="production-line-row">
                  <th scope="row">{LINE_LABELS[row.line]}</th>
                  <td>{formatMetric(row.abp)}</td>
                  <td>{formatMetric(row.plan)}</td>
                  <td>{formatMetric(row.actual)}</td>
                  <td>{formatAchievement(row.achievement)}</td>
                  <td>{formatMetric(row.prodRate)}</td>
                  <td className="production-ask-cell">{formatMetric(row.askRate)}</td>
                  <td className="production-forecast-cell">{formatMetric(row.forecast)}</td>
                  <td className="production-live-cell">{formatMetric(row.live)}</td>
                </tr>
              ))}
              <tr className="production-total-row">
                <th scope="row">TOTAL</th>
                <td>{formatMetric(totals.abp)}</td>
                <td>{formatMetric(totals.plan)}</td>
                <td>{formatMetric(totals.actual)}</td>
                <td>{formatAchievement(totals.achievement)}</td>
                <td>{formatMetric(totals.prodRate)}</td>
                <td>{formatMetric(totals.askRate)}</td>
                <td>{formatMetric(totals.forecast)}</td>
                <td>{formatMetric(totals.live)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="production-chart-panel">
          <h2>Production trend {periodLabel} (MT)</h2>
          <div className="production-chart-host">
            <ProductionTrendChart data={chartData} />
          </div>
          <div className="production-chart-legend" aria-label="Production line chart legend">
            {PRODUCTION_LINES.map((line) => (
              <span key={line}>
                <i style={{ color: LINE_COLORS[line] }} aria-hidden="true" />
                {LINE_LABELS[line]}
              </span>
            ))}
          </div>
        </div>
      </section>

      {!isPlayer && canManageProductionRefresh && renderSettingsModal()}
    </div>
  )

  function renderSettingsModal() {
    return (
      <Modal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        title="Production API Settings"
        actions={(
          <>
            <Button variant="outline" onClick={() => setShowSettings(false)}>Cancel</Button>
            <Button onClick={() => void saveApiSettings()} disabled={savingSettings}>
              {savingSettings && <Loader2 className="size-4 animate-spin" />}
              Save &amp; connect
            </Button>
          </>
        )}
      >
        <div className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="production-api-endpoint">HTTPS endpoint</Label>
            <Input
              id="production-api-endpoint"
              value={settingsEndpoint}
              onChange={(event) => setSettingsEndpoint(event.target.value)}
              placeholder={DEFAULT_API_ENDPOINT}
            />
            <p className="text-xs text-muted-foreground">
              The controller calls this endpoint. TV players only receive cached production JSON.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="production-api-key">API key</Label>
            <Input
              id="production-api-key"
              type="password"
              value={settingsApiKey}
              onChange={(event) => setSettingsApiKey(event.target.value)}
              placeholder={effectiveConfig?.apiKeyConfigured ? 'Saved - leave blank to keep' : 'Enter x-api-key'}
              autoComplete="off"
              disabled={clearApiKey}
            />
            <p className="text-xs text-muted-foreground">
              Stored only in the controller&apos;s local database and sent as the x-api-key header.
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={clearApiKey}
              onChange={(event) => setClearApiKey(event.target.checked)}
              className="size-4 accent-emerald-500"
            />
            Remove the saved API key
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={allowInvalidCertificates}
              onChange={(event) => setAllowInvalidCertificates(event.target.checked)}
              className="mt-0.5 size-4 accent-emerald-500"
            />
            <span>
              Trust private/self-signed certificate
              <span className="mt-1 block text-xs text-muted-foreground">
                Enabled for the documented private LAN API. The connection remains HTTPS encrypted.
              </span>
            </span>
          </label>
        </div>
      </Modal>
    )
  }
}
