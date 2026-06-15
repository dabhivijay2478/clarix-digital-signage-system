'use client'

import { useMemo, useState } from 'react'
import { Database, ExternalLink, FileSpreadsheet, Globe2, Plus, Radio, Trash2 } from 'lucide-react'
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

type SourceKind = 'dashboard' | 'spreadsheet' | 'api'

const sourceDetails: Record<SourceKind, { title: string; description: string; placeholder: string }> = {
  dashboard: {
    title: 'Public BI dashboard',
    description: 'Power BI Publish to web, Tableau Public, Looker Studio, or another public embeddable dashboard.',
    placeholder: 'https://app.powerbi.com/view?r=...',
  },
  spreadsheet: {
    title: 'Live spreadsheet or CSV',
    description: 'A published Google Sheet or public CSV URL. SignalOS renders it as an auto-refreshing table.',
    placeholder: 'https://docs.google.com/spreadsheets/d/.../edit',
  },
  api: {
    title: 'Public JSON API',
    description: 'A public GET endpoint returning an array of objects. SignalOS turns the response into a live table.',
    placeholder: 'https://api.example.com/live-metrics',
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
  return 'External source'
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
      source: kind === 'spreadsheet' ? normalizeSpreadsheetUrl(sourceUrl) : sourceUrl.trim(),
      format: kind === 'spreadsheet' ? 'csv' : 'json',
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
      const provider = kind === 'dashboard' ? getProvider(sourceUrl) : kind === 'spreadsheet' ? 'Spreadsheet' : 'JSON API'
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
    <div className="space-y-7">
      <div className="page-header">
        <Badge variant="outline" className="mb-3 border-primary/20 bg-primary/5 text-primary"><Radio /> Screen-ready sources</Badge>
        <h1 className="page-title">Live Data</h1>
        <p className="page-subtitle">Turn public dashboards, spreadsheet feeds, and APIs into content that can be scheduled on any screen.</p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <Card>
          <CardHeader className="border-b border-border/50">
            <CardTitle>Add a live source</CardTitle>
            <CardDescription>The source is saved as WebApp content and can be added to playlists immediately.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="source-kind">Source type</Label>
              <Select value={kind} onValueChange={(value) => setKind(value as SourceKind)}>
                <SelectTrigger id="source-kind" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="dashboard">Public BI dashboard</SelectItem>
                  <SelectItem value="spreadsheet">Live spreadsheet / CSV</SelectItem>
                  <SelectItem value="api">Public JSON API</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Alert className="border-primary/20 bg-primary/5">
              {kind === 'dashboard' ? <Globe2 /> : kind === 'spreadsheet' ? <FileSpreadsheet /> : <Database />}
              <AlertTitle>{detail.title}</AlertTitle>
              <AlertDescription>{detail.description}</AlertDescription>
            </Alert>

            <div className="space-y-2">
              <Label htmlFor="source-name">Display name</Label>
              <Input id="source-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g., Sales performance" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="source-url">Public source URL</Label>
              <Input id="source-url" value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder={detail.placeholder} />
              <p className="text-xs text-muted-foreground">The URL must be publicly accessible. Private APIs and dashboards requiring login cannot load inside the screen player.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {kind !== 'dashboard' && (
                <div className="space-y-2">
                  <Label htmlFor="refresh-seconds">Data refresh interval</Label>
                  <Input id="refresh-seconds" type="number" min="15" value={refreshSeconds} onChange={(event) => setRefreshSeconds(event.target.value)} />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="display-duration">Playlist display duration</Label>
                <Input id="display-duration" type="number" min="30" value={displayDuration} onChange={(event) => setDisplayDuration(event.target.value)} />
              </div>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button onClick={handleAdd} disabled={saving}><Plus />{saving ? 'Adding source...' : 'Add to Content'}</Button>
              <Button variant="outline" onClick={handlePreview}><ExternalLink />Preview</Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b border-border/50">
            <CardTitle>Using Excel or live sheets</CardTitle>
            <CardDescription>The reliable options for keeping spreadsheet data current on screens.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5 text-sm text-muted-foreground">
            <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
              <p className="font-semibold text-foreground">Google Sheets</p>
              <p className="mt-1">Share or publish the sheet publicly, paste its URL here, and SignalOS converts it into a refreshing CSV table.</p>
            </div>
            <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
              <p className="font-semibold text-foreground">Microsoft Excel</p>
              <p className="mt-1">For live data, store the workbook in OneDrive or SharePoint and use a public Excel embed link. For a static workbook, export it as CSV and host the CSV at a public URL.</p>
            </div>
            <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
              <p className="font-semibold text-foreground">BI tool APIs</p>
              <p className="mt-1">Use a public JSON endpoint with CORS enabled. Private tokens should stay on a secure proxy server, never inside a screen URL.</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="border-b border-border/50">
          <CardTitle>Saved live sources</CardTitle>
          <CardDescription>{liveSources.length} source{liveSources.length === 1 ? '' : 's'} available in the Content Library.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="grid gap-3 sm:grid-cols-2">{Array.from({ length: 2 }).map((_, index) => <Skeleton key={index} className="h-28" />)}</div>
          ) : liveSources.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/70 bg-muted/10 px-6 py-12 text-center text-sm text-muted-foreground">Add your first public dashboard, live spreadsheet, or API feed above.</div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {liveSources.map((source) => (
                <div key={source.id} className="flex min-w-0 items-start justify-between gap-4 rounded-xl border border-border/60 bg-muted/10 p-4">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{source.name}</p>
                    <p className="mt-1 truncate text-xs text-muted-foreground">{source.url}</p>
                    <div className="mt-3 flex flex-wrap gap-1">{source.tags.filter((tag) => tag !== 'live-data').map((tag) => <Badge key={tag} variant="secondary">{tag}</Badge>)}</div>
                  </div>
                  <Button aria-label={`Delete ${source.name}`} variant="ghost" size="icon" onClick={() => deleteItem(source.id)}><Trash2 /></Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
