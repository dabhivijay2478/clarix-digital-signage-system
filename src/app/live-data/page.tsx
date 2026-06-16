'use client'

import { useMemo, useState } from 'react'
import { ExternalLink, FileSpreadsheet, Globe2, Plus, Radio, Trash2 } from 'lucide-react'
import { showToast } from '@/components/Toast'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { useContent } from '@/hooks/useContent'
import { cn } from '@/lib/utils'

type SourceKind = 'dashboard' | 'spreadsheet'

const sourceDetails: Record<SourceKind, { title: string; description: string; placeholder: string }> = {
  dashboard: {
    title: 'Public BI dashboard',
    description: 'Power BI Publish to web, Tableau Public, Looker Studio, or another public embeddable dashboard.',
    placeholder: 'https://app.powerbi.com/view?r=...',
  },
  spreadsheet: {
    title: 'Live spreadsheet or CSV',
    description: `A published Google Sheet or public CSV URL. ${process.env.NEXT_PUBLIC_APP_NAME || 'Clarix'} renders it as an auto-refreshing table.`,
    placeholder: 'https://docs.google.com/spreadsheets/d/.../edit',
  },
}

function normalizeSpreadsheetUrl(value: string): string {
  const trimmed = value.trim()
  try {
    const url = new URL(trimmed)
    const match = url.pathname.match(/\/spreadsheets\/d\/([^/]+)/)
    if (url.hostname === 'docs.google.com' && match) {
      const gid = url.searchParams.get('gid') ?? url.hash.match(/gid=(\d+)/)?.[1]
      const csvUrl = new URL(`https://docs.google.com/spreadsheets/d/${match[1]}/gviz/tq`)
      csvUrl.searchParams.set('tqx', 'out:csv')
      if (gid) csvUrl.searchParams.set('gid', gid)
      return csvUrl.toString()
    }
  } catch {
    return trimmed
  }
  return trimmed
}

function getProvider(url: string): string {
  if (url.includes('powerbi.com')) return 'Power BI'
  if (url.includes('tableau.com')) return 'Tableau'
  if (url.includes('lookerstudio.google.com')) return 'Looker Studio'
  if (url.includes('docs.google.com')) return 'Google Sheets'
  return 'External'
}

export default function LiveDataPage() {
  const { allItems, loading, addItem, deleteItem } = useContent()
  const [kind, setKind] = useState<SourceKind>('dashboard')
  const [name, setName] = useState('')
  const [sourceUrl, setSourceUrl] = useState('')
  const [refreshSeconds, setRefreshSeconds] = useState('60')
  const [displayDuration, setDisplayDuration] = useState('300')
  const [saving, setSaving] = useState(false)

  const liveSources = useMemo(() => allItems.filter((item) => item.tags.includes('live-data')), [allItems])
  const detail = sourceDetails[kind]

  const buildContentUrl = () => {
    if (kind === 'dashboard') return sourceUrl.trim()
    const params = new URLSearchParams({
      source: normalizeSpreadsheetUrl(sourceUrl),
      format: 'csv',
      title: name.trim(),
      refresh: String(Math.max(15, Number(refreshSeconds) || 60)),
    })
    return `/data-view?${params.toString()}`
  }

  const handleAdd = async () => {
    if (!name.trim() || !sourceUrl.trim()) {
      showToast('Enter a source name and public URL', 'warning')
      return
    }
    try {
      const parsedUrl = new URL(sourceUrl.trim())
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) throw new Error('Unsupported protocol')
    } catch {
      showToast('Enter a valid public http or https URL', 'warning')
      return
    }

    setSaving(true)
    try {
      const provider = kind === 'dashboard' ? getProvider(sourceUrl) : 'Spreadsheet'
      await addItem(
        name.trim(),
        'WebApp',
        undefined,
        buildContentUrl(),
        Math.max(30, Number(displayDuration) || 300),
        ['live-data', kind, provider.toLowerCase().replaceAll(' ', '-')],
      )
      showToast(`Live data source "${name.trim()}" added to Content`, 'success')
      setName('')
      setSourceUrl('')
    } catch (error) {
      showToast(`Failed to add live data source: ${error}`, 'error')
    } finally {
      setSaving(false)
    }
  }

  const handlePreview = () => {
    if (!sourceUrl.trim()) return showToast('Enter a public source URL first', 'warning')
    window.open(buildContentUrl(), '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="space-y-7 animate-fadeIn">
      <div className="page-header">
        <Badge variant="outline" className="mb-3 border-primary/20 bg-primary/5 text-primary"><Radio /> Screen-ready sources</Badge>
        <h1 className="page-title">Live Data</h1>
        <p className="page-subtitle">Turn public dashboards and spreadsheet feeds into content that can be scheduled on any screen.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-12 items-start">
        {/* Left Column: Add Live Source */}
        <div className="lg:col-span-5">
          <Card className="p-0 gap-0 shadow-xs border-border bg-card">
            <CardHeader className="border-b border-border/50 p-6 pb-4">
              <CardTitle className="text-base">Add a live source</CardTitle>
              <CardDescription className="text-xs">Saved as WebApp content and added to playlists immediately.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5 p-6 pt-5">
              <div className="space-y-2">
                <Label htmlFor="source-kind" className="text-xs font-semibold">Source type</Label>
                <Select value={kind} onValueChange={(value) => setKind(value as SourceKind)}>
                  <SelectTrigger id="source-kind" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dashboard">Public BI dashboard</SelectItem>
                    <SelectItem value="spreadsheet">Live spreadsheet / CSV</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Alert className="border-primary/10 bg-primary/5 p-4 rounded-xl flex items-start gap-3">
                <div className="shrink-0 text-primary mt-0.5">
                  {kind === 'dashboard' ? <Globe2 className="size-4" /> : <FileSpreadsheet className="size-4" />}
                </div>
                <div>
                  <AlertTitle className="text-xs font-semibold mb-0.5">{detail.title}</AlertTitle>
                  <AlertDescription className="text-[11px] text-muted-foreground leading-normal">{detail.description}</AlertDescription>
                </div>
              </Alert>

              <div className="space-y-2">
                <Label htmlFor="source-name" className="text-xs font-semibold">Display name</Label>
                <Input id="source-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g., Sales performance" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="source-url" className="text-xs font-semibold">Public source URL</Label>
                <Input id="source-url" value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder={detail.placeholder} />
                <p className="text-[10px] leading-normal text-muted-foreground mt-1.5">
                  The URL must be publicly accessible. Private APIs and dashboards requiring login cannot load inside the screen player.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {kind !== 'dashboard' && (
                  <div className="space-y-2">
                    <Label htmlFor="refresh-seconds" className="text-xs font-semibold">Data refresh (seconds)</Label>
                    <Input id="refresh-seconds" type="number" min="15" value={refreshSeconds} onChange={(event) => setRefreshSeconds(event.target.value)} />
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="display-duration" className="text-xs font-semibold">Playlist duration (seconds)</Label>
                  <Input id="display-duration" type="number" min="30" value={displayDuration} onChange={(event) => setDisplayDuration(event.target.value)} />
                </div>
              </div>
              <div className="flex flex-col gap-2.5 pt-1 sm:flex-row">
                <Button onClick={handleAdd} disabled={saving} className="flex-1"><Plus />{saving ? 'Adding...' : 'Add to Content'}</Button>
                <Button variant="outline" onClick={handlePreview} className="flex-1"><ExternalLink />Preview</Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Saved Live Sources */}
        <div className="lg:col-span-7">
          <Card className="p-0 gap-0 shadow-xs border-border bg-card">
            <CardHeader className="border-b border-border/50 p-6 pb-4">
              <CardTitle className="text-base">Saved live sources</CardTitle>
              <CardDescription className="text-xs">
                {liveSources.length} active source{liveSources.length === 1 ? '' : 's'} available in the Content Library.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-6 pt-5 min-h-[300px]">
              {loading ? (
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-16 rounded-xl" />)}
                </div>
              ) : liveSources.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border/70 bg-muted/10 px-6 py-16 text-center text-sm text-muted-foreground flex flex-col items-center justify-center min-h-[260px]">
                  <Globe2 className="size-8 text-muted-foreground/30 mb-3" />
                  <p className="font-semibold text-foreground text-xs mb-1">No live sources yet</p>
                  <p className="text-[11px] text-muted-foreground max-w-xs leading-normal">
                    Add your first public dashboard or live spreadsheet feed on the left to see it listed here.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {liveSources.map((source) => {
                    const isDashboard = source.tags.includes('dashboard')
                    return (
                      <div 
                        key={source.id} 
                        className="group flex items-center justify-between gap-4 rounded-xl border border-border/50 bg-card/40 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-border/80 hover:bg-card hover:shadow-xs"
                      >
                        <div className="flex items-center gap-3.5 min-w-0">
                          <div className={cn(
                            "flex size-9 items-center justify-center rounded-xl shrink-0 transition-transform group-hover:scale-105", 
                            isDashboard ? "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400" : "bg-green-500/10 text-green-600 dark:text-green-400"
                          )}>
                            {isDashboard ? <Globe2 className="size-4.5" /> : <FileSpreadsheet className="size-4.5" />}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-xs text-foreground leading-normal">{source.name}</p>
                            <p className="mt-0.5 truncate text-[10px] text-muted-foreground font-mono leading-none">{source.url}</p>
                            <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                              <Badge variant="secondary" className="text-[9px] px-1.5 py-0 font-medium">{isDashboard ? 'BI Dashboard' : 'Spreadsheet / CSV'}</Badge>
                              {source.tags.filter(t => t !== 'live-data' && t !== 'dashboard' && t !== 'spreadsheet').map(tag => (
                                <Badge key={tag} variant="outline" className="text-[9px] px-1.5 py-0 capitalize font-medium">{tag.replace('-', ' ')}</Badge>
                              ))}
                            </div>
                          </div>
                        </div>
                        <Button 
                          aria-label={`Delete ${source.name}`} 
                          variant="ghost" 
                          size="icon-sm" 
                          className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 hover:text-destructive shrink-0" 
                          onClick={() => deleteItem(source.id)}
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
