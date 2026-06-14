'use client';

import type {
  Screen,
  ContentItem,
  Playlist,
  PlaylistItem,
  ScheduleSlot,
  AppWeekday,
  AnalyticsSummary,
  AnalyticsTimelineEntry,
  PeerScreen,
} from './types';

// ── Safe invoke wrapper ─────────────────────────────────────────────────────
// Tauri APIs are only available in the browser (WebView), not during SSG build.

let cachedRustPort: number | null = null;

async function getRustPort(): Promise<number> {
  if (cachedRustPort !== null) return cachedRustPort;
  if (typeof window === 'undefined') return 7420;

  // Check localStorage first
  const stored = localStorage.getItem('signalos_rust_server_port');
  if (stored) {
    const p = parseInt(stored, 10);
    if (!isNaN(p)) {
      cachedRustPort = p;
      return p;
    }
  }

  // Scan ports 7420 to 7425
  const hostname = window.location.hostname || 'localhost';
  const ports = [7420, 7421, 7422, 7423, 7424, 7425];
  
  const probePort = async (p: number): Promise<number> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 800);
    try {
      const res = await fetch(`http://${hostname}:${p}/status`, { 
        signal: controller.signal,
        mode: 'cors'
      });
      clearTimeout(timeoutId);
      if (res.ok) {
        return p;
      }
    } catch (e) {
      // ignore
    }
    throw new Error('Not online');
  };

  try {
    // Return first successful port
    const successfulPort = await Promise.any(ports.map(probePort));
    localStorage.setItem('signalos_rust_server_port', successfulPort.toString());
    cachedRustPort = successfulPort;
    return successfulPort;
  } catch (e) {
    console.warn('Failed to auto-detect LAN Rust server, using fallback port 7420');
    return 7420;
  }
}

async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (typeof window === 'undefined') {
    throw new Error('Tauri invoke is only available in the browser');
  }

  const isTauri = (window as any).__TAURI_IPC__ !== undefined || (window as any).__TAURI__ !== undefined;

  if (isTauri) {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke<T>(cmd, args);
  } else {
    // Fallback: Fetch from Rust LAN server HTTP endpoints
    const port = await getRustPort();
    const hostname = window.location.hostname || 'localhost';
    const baseUrl = `http://${hostname}:${port}`;
    
    let url = '';
    let method = 'GET';
    let body: BodyInit | null = null;
    
    switch (cmd) {
      case 'get_screens':
        url = `${baseUrl}/api/screens`;
        break;
      case 'get_playlists':
        url = `${baseUrl}/api/playlists`;
        break;
      case 'get_content_items':
        url = `${baseUrl}/api/content`;
        break;
      case 'get_schedule':
        url = `${baseUrl}/api/schedule`;
        break;
      case 'get_lan_server_port':
        return port as unknown as T;
      case 'record_analytics_event':
        url = `${baseUrl}/api/analytics`;
        method = 'POST';
        body = JSON.stringify(args);
        break;
      case 'get_analytics_summary':
        const screenIdParam = args?.screenId ? `?screen_id=${encodeURIComponent(args.screenId as string)}` : '';
        url = `${baseUrl}/api/analytics/summary${screenIdParam}`;
        break;
      case 'get_analytics_timeline':
        const tRange = args?.days ?? 7;
        const screenIdTimelineParam = args?.screenId ? `&screen_id=${encodeURIComponent(args.screenId as string)}` : '';
        url = `${baseUrl}/api/analytics/timeline?days=${tRange}${screenIdTimelineParam}`;
        break;
      case 'check_all_screens_online':
        url = `${baseUrl}/api/screens/online`;
        break;
      case 'check_screen_online':
        const ip = args?.ipAddress ? `?ip=${encodeURIComponent(args.ipAddress as string)}` : '';
        url = `${baseUrl}/api/screens/online/probe${ip}`;
        break;
      case 'add_screen':
        url = `${baseUrl}/api/screens`;
        method = 'POST';
        body = JSON.stringify({
          name: args?.name,
          location: args?.location,
          ip_address: args?.ipAddress,
          orientation: args?.orientation,
          resolution_w: args?.resolutionW,
          resolution_h: args?.resolutionH,
          playlist_id: args?.playlistId,
        });
        break;
      case 'edit_screen':
        url = `${baseUrl}/api/screens/edit`;
        method = 'POST';
        body = JSON.stringify({
          id: args?.id,
          name: args?.name,
          location: args?.location,
          ip_address: args?.ipAddress,
          orientation: args?.orientation,
          resolution_w: args?.resolutionW,
          resolution_h: args?.resolutionH,
          playlist_id: args?.playlistId,
        });
        break;
      case 'update_screen_operating_hours':
        url = `${baseUrl}/api/screens/operating-hours`;
        method = 'POST';
        body = JSON.stringify({
          id: args?.id,
          operating_hours: args?.operatingHours,
        });
        break;
      case 'update_screen_power':
        url = `${baseUrl}/api/screens/power`;
        method = 'POST';
        body = JSON.stringify(args);
        break;
      case 'update_screen_brightness':
        url = `${baseUrl}/api/screens/brightness`;
        method = 'POST';
        body = JSON.stringify(args);
        break;
      case 'delete_screen':
        url = `${baseUrl}/api/screens/delete`;
        method = 'POST';
        body = JSON.stringify(args);
        break;
      case 'add_content_item':
        url = `${baseUrl}/api/content`;
        method = 'POST';
        body = JSON.stringify({
          name: args?.name,
          content_type: args?.contentType,
          file_path: args?.filePath,
          url: args?.url,
          duration_secs: args?.durationSecs,
          tags: args?.tags,
        });
        break;
      case 'delete_content_item':
        url = `${baseUrl}/api/content/delete`;
        method = 'POST';
        body = JSON.stringify(args);
        break;
      case 'create_playlist':
        url = `${baseUrl}/api/playlists`;
        method = 'POST';
        body = JSON.stringify({
          name: args?.name,
          transition: args?.transition,
          loop_enabled: args?.loopEnabled,
        });
        break;
      case 'update_playlist_items':
        url = `${baseUrl}/api/playlists/items`;
        method = 'POST';
        body = JSON.stringify({
          playlist_id: args?.playlistId,
          items: args?.items,
        });
        break;
      case 'delete_playlist':
        url = `${baseUrl}/api/playlists/delete`;
        method = 'POST';
        body = JSON.stringify(args);
        break;
      case 'add_schedule_slot':
        url = `${baseUrl}/api/schedule`;
        method = 'POST';
        body = JSON.stringify({
          name: args?.name,
          screen_ids: args?.screenIds,
          playlist_id: args?.playlistId,
          start_time: args?.startTime,
          duration_mins: args?.durationMins,
          days_of_week: args?.daysOfWeek,
          priority: args?.priority,
        });
        break;
      case 'delete_schedule_slot':
        url = `${baseUrl}/api/schedule/delete`;
        method = 'POST';
        body = JSON.stringify(args);
        break;
      case 'save_local_content_file':
        url = `${baseUrl}/upload?filename=${encodeURIComponent(args?.filename as string)}`;
        method = 'POST';
        body = new Uint8Array(args?.bytes as number[]);
        break;
      case 'sync_screen_data':
        url = `${baseUrl}/api/screens/sync`;
        method = 'POST';
        body = JSON.stringify({
          screen_id: args?.screenId,
        });
        break;
      default:
        console.warn(`Command ${cmd} not supported over HTTP fallback, returning empty data`);
        if (cmd === 'get_analytics_summary') {
          return {
            impressions: 0,
            plays: 0,
            completions: 0,
            skips: 0,
            avg_dwell_secs: 0.0,
            uptime_pct: 100.0,
          } as unknown as T;
        }
        if (cmd === 'check_all_screens_online') {
          return [] as unknown as T;
        }
        if (cmd === 'check_screen_online') {
          return false as unknown as T;
        }
        if (cmd.startsWith('get_')) {
          return [] as unknown as T;
        }
        return null as unknown as T;
    }
    
    const headers: Record<string, string> = {};
    if (method === 'POST' && cmd !== 'save_local_content_file') {
      headers['Content-Type'] = 'application/json';
    }
    
    const response = await fetch(url, {
      method,
      headers,
      body: body || undefined,
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const json = await response.json();
    if (cmd === 'save_local_content_file') {
      return json.path as T;
    }
    return json as T;
  }
}

function tauriListen(event: string, handler: (payload: unknown) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  
  const isTauri = (window as any).__TAURI_IPC__ !== undefined || (window as any).__TAURI__ !== undefined;
  if (!isTauri) {
    // Event listeners are not supported outside of Tauri and are no-ops
    return () => {};
  }

  let unlistenFn: (() => void) | null = null;
  let disposed = false;

  import('@tauri-apps/api/event').then(({ listen }) => {
    if (disposed) return;
    listen(event, (e) => handler(e.payload)).then((unlisten) => {
      if (disposed) {
        unlisten();
      } else {
        unlistenFn = unlisten;
      }
    });
  }).catch((err) => {
    console.error('Failed to register Tauri event listener:', err);
  });

  return () => {
    disposed = true;
    if (unlistenFn) {
      try {
        unlistenFn();
      } catch (e) {
        console.warn('Tauri event unlisten failed:', e);
      }
    }
  };
}

// ── Screens API ─────────────────────────────────────────────────────────────

export const screensApi = {
  getAll: () => tauriInvoke<Screen[]>('get_screens'),

  add: (
    name: string,
    location: string,
    ipAddress?: string,
    orientation?: string,
    resolutionW?: number,
    resolutionH?: number,
    playlistId?: string
  ) =>
    tauriInvoke<Screen>('add_screen', {
      name,
      location,
      ipAddress: ipAddress ?? null,
      orientation: orientation ?? null,
      resolutionW: resolutionW ?? null,
      resolutionH: resolutionH ?? null,
      playlistId: playlistId ?? null,
    }),

  edit: (
    id: string,
    name: string,
    location: string,
    ipAddress?: string,
    orientation?: string,
    resolutionW?: number,
    resolutionH?: number,
    playlistId?: string
  ) =>
    tauriInvoke<void>('edit_screen', {
      id,
      name,
      location,
      ipAddress: ipAddress ?? null,
      orientation: orientation ?? null,
      resolutionW: resolutionW ?? null,
      resolutionH: resolutionH ?? null,
      playlistId: playlistId ?? null,
    }),

  updateOperatingHours: (id: string, operatingHours: any) =>
    tauriInvoke<void>('update_screen_operating_hours', { id, operatingHours }),

  setPower: (id: string, on: boolean) =>
    tauriInvoke<void>('update_screen_power', { id, on }),

  setBrightness: (id: string, brightness: number) =>
    tauriInvoke<void>('update_screen_brightness', { id, brightness }),

  delete: (id: string) => tauriInvoke<void>('delete_screen', { id }),
};

// ── Content API ─────────────────────────────────────────────────────────────

export const contentApi = {
  getAll: () => tauriInvoke<ContentItem[]>('get_content_items'),

  add: (
    name: string,
    contentType: string,
    filePath?: string,
    url?: string,
    durationSecs: number = 30,
    tags: string[] = []
  ) =>
    tauriInvoke<ContentItem>('add_content_item', {
      name,
      contentType,
      filePath: filePath ?? null,
      url: url ?? null,
      durationSecs,
      tags,
    }),

  delete: (id: string) => tauriInvoke<void>('delete_content_item', { id }),

  saveLocalFile: (filename: string, bytes: Uint8Array) =>
    tauriInvoke<string>('save_local_content_file', { filename, bytes: Array.from(bytes) }),
};

// ── Playlists API ───────────────────────────────────────────────────────────

export const playlistsApi = {
  getAll: () => tauriInvoke<Playlist[]>('get_playlists'),

  create: (name: string, transition: string = 'Fade', loopEnabled: boolean = true) =>
    tauriInvoke<Playlist>('create_playlist', { name, transition, loopEnabled }),

  updateItems: (playlistId: string, items: PlaylistItem[]) =>
    tauriInvoke<void>('update_playlist_items', { playlistId, items }),

  delete: (id: string) => tauriInvoke<void>('delete_playlist', { id }),
};

// ── Schedule API ────────────────────────────────────────────────────────────

export const scheduleApi = {
  getAll: () => tauriInvoke<ScheduleSlot[]>('get_schedule'),

  add: (
    name: string,
    screenIds: string[],
    playlistId: string,
    startTime: string,
    durationMins: number,
    daysOfWeek: AppWeekday[],
    priority: number = 1
  ) =>
    tauriInvoke<string>('add_schedule_slot', {
      name,
      screenIds,
      playlistId,
      startTime,
      durationMins,
      daysOfWeek,
      priority,
    }),

  delete: (id: string) => tauriInvoke<void>('delete_schedule_slot', { id }),
};

// ── Analytics API ───────────────────────────────────────────────────────────

export const analyticsApi = {
  record: (
    screenId: string,
    contentId: string,
    eventType: string,
    dwellSecs?: number
  ) =>
    tauriInvoke<void>('record_analytics_event', {
      screenId,
      contentId,
      eventType,
      dwellSecs: dwellSecs ?? null,
    }),

  getSummary: (screenId?: string) =>
    tauriInvoke<AnalyticsSummary>('get_analytics_summary', {
      screenId: screenId ?? null,
    }),

  getTimeline: (days: number = 7, screenId?: string) =>
    tauriInvoke<AnalyticsTimelineEntry[]>('get_analytics_timeline', {
      days,
      screenId: screenId ?? null,
    }),
};

// ── LAN / Offline API ───────────────────────────────────────────────────────
// All screen communication is over LAN — no internet required.

export const lanApi = {
  /** Returns all SignalOS screens discovered via mDNS on the LAN. */
  getPeers: () => tauriInvoke<PeerScreen[]>('get_lan_peers'),

  /** Probes a specific IP address to check if the screen is reachable. */
  checkOnline: (ipAddress: string) =>
    tauriInvoke<boolean>('check_screen_online', { ipAddress }),

  /** Bulk-checks all registered screens with IPs, returns [id, is_online] pairs. */
  checkAllOnline: () =>
    tauriInvoke<[string, boolean][]>('check_all_screens_online'),

  /** Returns the active port of the local HTTP LAN server. */
  getServerPort: () => tauriInvoke<number>('get_lan_server_port'),

  /** Syncs all playlists, schedules, and assets to a screen on the LAN. */
  syncScreenData: (screenId: string) =>
    tauriInvoke<void>('sync_screen_data', { screenId }),
};

// ── Event Listeners ─────────────────────────────────────────────────────────

export const onScheduleChange = (
  handler: (data: { screen_id: string; slot: ScheduleSlot }) => void
) => tauriListen('schedule_change', handler as (p: unknown) => void);

export const onPeerDiscovered = (handler: (peer: PeerScreen) => void) =>
  tauriListen('peer_discovered', handler as (p: unknown) => void);

export const onPeerLost = (handler: (fullname: string) => void) =>
  tauriListen('peer_lost', handler as (p: unknown) => void);
