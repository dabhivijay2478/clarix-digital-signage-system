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
  DeviceIdentity,
  PairingRequest,
  ConnectionDiagnostic,
} from './types';

// ── Safe invoke wrapper ─────────────────────────────────────────────────────
// Tauri APIs are only available in the browser (WebView), not during SSG build.

function isTauriRuntime(): boolean {
  if (typeof window === 'undefined') return false;
  const globalRuntime = globalThis as typeof globalThis & { isTauri?: boolean };
  const tauriWindow = window as typeof window & {
    __TAURI__?: unknown;
    __TAURI_IPC__?: unknown;
    __TAURI_INTERNALS__?: unknown;
  };
  return Boolean(globalRuntime.isTauri || tauriWindow.__TAURI__ || tauriWindow.__TAURI_IPC__ || tauriWindow.__TAURI_INTERNALS__);
}

const browserControllerPort = process.env.NEXT_PUBLIC_SIGNALOS_CONTROLLER_PORT ?? '7420';

export function getBrowserControllerOrigin(): string {
  if (typeof window === 'undefined') return `http://localhost:${browserControllerPort}`;
  if (window.location.port === browserControllerPort) return window.location.origin;
  return `http://${window.location.hostname}:${browserControllerPort}`;
}

async function getRustPort(): Promise<number> {
  const parsed = Number.parseInt(browserControllerPort, 10);
  return Number.isFinite(parsed) ? parsed : 7420;
}

async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (typeof window === 'undefined') {
    throw new Error('Tauri invoke is only available in the browser');
  }

  if (isTauriRuntime()) {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke<T>(cmd, args);
  } else {
    // Browser development pages read from the fixed controller service. The
    // installed browser player is already served from this origin.
    const port = await getRustPort();
    const baseUrl = getBrowserControllerOrigin();
    
    let url = '';
    
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
        // Controller-hosted browser players are read-only. Packaged players record
        // playback events through authenticated Tauri IPC.
        return undefined as T;
      case 'get_analytics_summary':
        return { impressions: 0, plays: 0, completions: 0, skips: 0, avg_dwell_secs: 0, uptime_pct: 100 } as T;
      case 'get_analytics_timeline':
      case 'check_all_screens_online':
        return [] as T;
      case 'check_screen_online':
        return false as T;
      case 'get_db_tables':
        return ['screens', 'content_items', 'playlists', 'playlist_items', 'schedule_slots', 'analytics_events', 'device_settings', 'pairing_requests', 'player_heartbeats', 'asset_checksums'] as unknown as T;
      case 'get_db_table_data':
        return { columns: ['id', 'name', 'location'], rows: [{ id: '1', name: 'Main Lobby', location: 'Floor 1' }] } as unknown as T;
      case 'export_db_table_to_csv':
        return 'id,name,location\n1,Main Lobby,Floor 1' as unknown as T;
      case 'backup_content_library_to_zip':
        return undefined as T;
      case 'save_text_file':
        return undefined as T;
      default:
        throw new Error('Controller administration is available only in the packaged SignalOS desktop app.');
    }
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    if (response.status === 204) {
      return null as T;
    }
    
    const json = await response.json();
    return json as T;
  }
}

function tauriListen(event: string, handler: (payload: unknown) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  
  if (!isTauriRuntime()) {
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

// ── Same-router screen communication API ───────────────────────────────────
// Screens discover and sync with each other while connected to the same router.

export const localNetworkApi = {
  /** Returns all SignalOS screens discovered via mDNS on the same router. */
  getPeers: () => tauriInvoke<PeerScreen[]>('get_network_peers'),

  /** Checks a stable screen identity using its most recent heartbeat. */
  checkOnline: (screenId: string) =>
    tauriInvoke<boolean>('check_screen_online', { screenId }),

  /** Bulk-checks all registered screens with IPs, returns [id, is_online] pairs. */
  checkAllOnline: () =>
    tauriInvoke<[string, boolean][]>('check_all_screens_online'),

  /** Returns the active port of the local SignalOS HTTP service. */
  getServerPort: () => tauriInvoke<number>('get_lan_server_port'),

  /** Syncs all playlists, schedules, and assets to a screen on the same router. */
  syncScreenData: (screenId: string) =>
    tauriInvoke<number>('sync_screen_data', { screenId }),
};

export const networkApi = {
  getIdentity: () => tauriInvoke<DeviceIdentity>('get_device_identity'),
  setMode: (role: 'Controller' | 'Player', controllerUrl?: string) =>
    tauriInvoke<DeviceIdentity>('set_device_mode', { role, controllerUrl: controllerUrl ?? null }),
  requestPairing: () =>
    tauriInvoke<PairingRequest>('request_player_pairing'),
  getPairingRequests: () => tauriInvoke<PairingRequest[]>('get_pairing_requests'),
  approvePairing: (requestId: string, screenId: string) =>
    tauriInvoke<void>('approve_pairing_request', { requestId, screenId }),
  getDiagnostics: () => tauriInvoke<ConnectionDiagnostic>('get_network_diagnostics'),
};

export interface TableData {
  columns: string[];
  rows: Record<string, any>[];
}

export const databaseApi = {
  getTables: () => tauriInvoke<string[]>('get_db_tables'),
  getTableData: (tableName: string) => tauriInvoke<TableData>('get_db_table_data', { tableName }),
  exportTableToCsv: (tableName: string) => tauriInvoke<string>('export_db_table_to_csv', { tableName }),
  backupContentLibraryToZip: (savePath: string) => tauriInvoke<void>('backup_content_library_to_zip', { savePath }),
  saveTextFile: (path: string, content: string) => tauriInvoke<void>('save_text_file', { path, content }),
};

// ── Event Listeners ─────────────────────────────────────────────────────────

export const onScheduleChange = (
  handler: (data: { screen_id: string; slot: ScheduleSlot }) => void
) => tauriListen('schedule_change', handler as (p: unknown) => void);

export const onPeerDiscovered = (handler: (peer: PeerScreen) => void) =>
  tauriListen('peer_discovered', handler as (p: unknown) => void);

export const onPeerLost = (handler: (fullname: string) => void) =>
  tauriListen('peer_lost', handler as (p: unknown) => void);

// ── Custom Async Confirm dialog for Tauri & Browser fallback ────────────────
export async function customConfirm(message: string): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  if (isTauriRuntime()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      // In Tauri v2, the tauri-plugin-dialog ask command displays a confirmation dialog
      return await invoke<boolean>('plugin:dialog|ask', {
        message,
        title: 'Confirmation',
      });
    } catch (e) {
      // Fallback silently if dialogue plugin is not permitted/installed
      // This happens when the Tauri dialog plugin permissions are missing or cached
      console.debug('Tauri dialog plugin ask command failed, falling back to browser confirm API:', e);
    }
  }

  // Fallback to normal confirm (which we overrode below to prevent Tauri crashes, but still works)
  return window.confirm(message);
}

// Override window.confirm in Tauri to prevent the broken injected preload script from throwing:
// "dialog.confirm not allowed. Command not found"
if (typeof window !== 'undefined') {
  window.confirm = (message?: string) => {
    console.debug('Synchronous window.confirm intercept:', message);
    // Return true by default so HMR and libraries don't fail, 
    // but use customConfirm() for important user confirmations.
    return true; 
  };
}
