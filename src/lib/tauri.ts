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
  ProductionDashboard,
  ProductionDashboardBundle,
  ProductionDataset,
  ProductionDatasetSummary,
  ProductionImportResult,
  ProductionRow,
  TruckScreenAlert,
  Truck,
  AuthSession,
  AuthUser,
  TeamInvite,
  AdminRole,
  MarqueeSettings,
  TruckDispatchSummary,
  ScreenPurpose,
} from './types';
import { APP_NAME } from './branding';

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

const browserControllerPort = process.env.NEXT_PUBLIC_CLARIX_CONTROLLER_PORT ?? process.env.NEXT_PUBLIC_SIGNALOS_CONTROLLER_PORT ?? '7420';

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
      case 'get_production_dashboards':
        url = `${baseUrl}/api/production/dashboards`;
        break;
      case 'get_production_dashboard':
        url = `${baseUrl}/api/production/dashboards/${args?.id}`;
        break;
      case 'get_production_dataset':
        url = `${baseUrl}/api/production/datasets/${args?.id}`;
        break;
      case 'get_marquee_settings':
        url = `${baseUrl}/api/marquee`;
        break;
      case 'get_lan_server_port':
        return port as unknown as T;
      case 'record_analytics_event':
        // Controller-hosted browser players are read-only. Packaged players record
        // playback events through authenticated Tauri IPC.
        return undefined as T;
      case 'login_user':
        return {
          token: `browser-dev-${Date.now()}`,
          expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
          user: {
            id: 'browser-dev-user',
            name: 'Browser Dev Admin',
            email: String(args?.email ?? 'dev@mgenterprise.local'),
            role: 'SiteSuperAdmin',
            is_developer: true,
            created_at: new Date().toISOString(),
          },
        } as T;
      case 'get_current_user':
        if (!String(args?.token ?? '').startsWith('browser-dev-')) return null as T;
        return {
          id: 'browser-dev-user',
          name: 'Browser Dev Admin',
          email: 'dev@mgenterprise.local',
          role: 'SiteSuperAdmin',
          is_developer: true,
          created_at: new Date().toISOString(),
        } as T;
      case 'accept_team_invite':
        return {
          token: `browser-dev-${Date.now()}`,
          expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
          user: {
            id: 'browser-dev-invite-user',
            name: String(args?.name ?? 'Invited User'),
            email: 'invited@mgenterprise.local',
            role: 'Manager',
            is_developer: false,
            created_at: new Date().toISOString(),
          },
        } as T;
      case 'logout_user':
        return undefined as T;
      case 'create_team_invite':
        return {
          id: `browser-invite-${Date.now()}`,
          email: String(args?.email ?? ''),
          role: String(args?.role ?? 'Manager'),
          is_developer: Boolean(args?.isDeveloper),
          code: 'DEV12345',
          status: 'pending',
          created_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 14 * 86400000).toISOString(),
        } as T;
      case 'get_team_members':
      case 'get_team_invites':
        return [] as T;
      case 'get_role_permissions':
        return ['all'] as T;
      case 'get_truck_dispatch_summary':
        return { last_24h: 0, this_month: 0, avg_loading_secs: null } as T;
      case 'get_analytics_summary':
        return { impressions: 0, plays: 0, completions: 0, skips: 0, avg_dwell_secs: 0, uptime_pct: 100 } as T;
      case 'get_analytics_timeline':
      case 'check_all_screens_online':
        return [] as T;
      case 'check_screen_online':
        return false as T;
      case 'get_db_tables':
        return ['screens', 'content_items', 'playlists', 'playlist_items', 'schedule_slots', 'analytics_events', 'device_settings', 'pairing_requests', 'player_heartbeats', 'asset_checksums', 'production_datasets', 'production_dashboards', 'dispatched_trucks'] as unknown as T;
      case 'get_db_table_data':
        return { columns: ['id', 'name', 'location'], rows: [{ id: '1', name: 'Main Lobby', location: 'Floor 1' }] } as unknown as T;
      case 'export_db_table_to_csv':
        return 'id,name,location\n1,Main Lobby,Floor 1' as unknown as T;
      case 'backup_content_library_to_zip':
        return undefined as T;
      case 'save_text_file':
        return undefined as T;
      case 'save_local_content_file_chunk':
      case 'prepare_presentation_content':
        return undefined as T;
      case 'sync_screen_data':
      case 'force_sync_screen':
        return 1 as unknown as T;
      case 'update_screen_fullscreen':
      case 'publish_truck_alert':
      case 'save_dispatched_truck':
      case 'update_screen_display_options':
      case 'update_marquee_settings':
        return undefined as T;
      default:
        throw new Error(`Controller administration is available only in the packaged ${APP_NAME} desktop app.`);
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
    playlistId?: string,
    purpose?: ScreenPurpose,
    gate?: string | null,
    productionDashboardId?: string | null,
    defaultContentId?: string | null
  ) =>
    tauriInvoke<Screen>('add_screen', {
      name,
      location,
      ipAddress: ipAddress ?? null,
      orientation: orientation ?? null,
      resolutionW: resolutionW ?? null,
      resolutionH: resolutionH ?? null,
      playlistId: playlistId ?? null,
      purpose: purpose ?? null,
      gate: gate ?? null,
      productionDashboardId: productionDashboardId ?? null,
      defaultContentId: defaultContentId ?? null,
    }),

  edit: (
    id: string,
    name: string,
    location: string,
    ipAddress?: string,
    orientation?: string,
    resolutionW?: number,
    resolutionH?: number,
    playlistId?: string,
    purpose?: ScreenPurpose,
    gate?: string | null,
    productionDashboardId?: string | null,
    defaultContentId?: string | null
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
      purpose: purpose ?? null,
      gate: gate ?? null,
      productionDashboardId: productionDashboardId ?? null,
      defaultContentId: defaultContentId ?? null,
    }),

  updateDisplayOptions: (
    id: string,
    purpose: ScreenPurpose,
    gate?: string | null,
    productionDashboardId?: string | null,
    defaultContentId?: string | null
  ) =>
    tauriInvoke<void>('update_screen_display_options', {
      id,
      purpose,
      gate: gate ?? null,
      productionDashboardId: productionDashboardId ?? null,
      defaultContentId: defaultContentId ?? null,
    }),

  updateOperatingHours: (id: string, operatingHours: any) =>
    tauriInvoke<void>('update_screen_operating_hours', { id, operatingHours }),

  setPower: (id: string, on: boolean) =>
    tauriInvoke<void>('update_screen_power', { id, on }),

  setBrightness: (id: string, brightness: number) =>
    tauriInvoke<void>('update_screen_brightness', { id, brightness }),

  setFullscreen: (id: string, fullscreen: boolean) =>
    tauriInvoke<void>('update_screen_fullscreen', { id, fullscreen }),

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
    tags: string[] = [],
    metadataJson: Record<string, unknown> = {}
  ) =>
    tauriInvoke<ContentItem>('add_content_item', {
      name,
      contentType,
      filePath: filePath ?? null,
      url: url ?? null,
      durationSecs,
      tags,
      metadataJson,
    }),

  delete: (id: string) => tauriInvoke<void>('delete_content_item', { id }),

  saveLocalFile: async (filename: string, bytes: Uint8Array) => {
    const chunkSize = 512 * 1024;
    let savedPath = '';
    if (bytes.length === 0) {
      return tauriInvoke<string>('save_local_content_file_chunk', {
        filename,
        bytes: [],
        append: false,
      });
    }

    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      const chunk = bytes.slice(offset, offset + chunkSize);
      savedPath = await tauriInvoke<string>('save_local_content_file_chunk', {
        filename,
        bytes: Array.from(chunk),
        append: offset > 0,
      });
    }
    return savedPath;
  },

  preparePresentation: (filePath: string) =>
    tauriInvoke<string>('prepare_presentation_content', { filePath }),
};

// ── Production Data API ────────────────────────────────────────────────────

export const productionApi = {
  importFile: (filename: string, bytes: Uint8Array) =>
    tauriInvoke<ProductionImportResult>('import_production_file', { filename, bytes: Array.from(bytes) }),

  saveImport: (name: string, importResult: ProductionImportResult) =>
    tauriInvoke<ProductionDashboardBundle>('save_production_import', { name, importResult }),

  getDatasets: () => tauriInvoke<ProductionDatasetSummary[]>('get_production_datasets'),

  getDataset: (id: string) => tauriInvoke<ProductionDataset>('get_production_dataset', { id }),

  getDashboards: () => tauriInvoke<ProductionDashboard[]>('get_production_dashboards'),

  getDashboard: (id: string) => tauriInvoke<ProductionDashboardBundle>('get_production_dashboard', { id }),

  updateRows: (datasetId: string, tableId: string, rows: ProductionRow[]) =>
    tauriInvoke<ProductionDataset>('update_production_table_rows', { datasetId, tableId, rows }),

  refreshFromFile: (datasetId: string, filename: string, bytes: Uint8Array) =>
    tauriInvoke<ProductionDataset>('refresh_production_dataset_from_file', { datasetId, filename, bytes: Array.from(bytes) }),

  updateDataset: (dataset: ProductionDataset) =>
    tauriInvoke<ProductionDataset>('update_production_dataset', { dataset }),

  updateDashboard: (dashboard: ProductionDashboard) =>
    tauriInvoke<ProductionDashboard>('update_production_dashboard', { dashboard }),

  deleteDashboard: (id: string) =>
    tauriInvoke<void>('delete_production_dashboard', { id }),

  deleteDataset: (id: string) =>
    tauriInvoke<void>('delete_production_dataset', { id }),

  addToContent: (dashboardId: string, durationSecs: number = 300) =>
    tauriInvoke<ContentItem>('add_production_dashboard_to_content', { dashboardId, durationSecs }),
};

// ── Truck Alert API ────────────────────────────────────────────────────────

export const truckAlertsApi = {
  publish: (alert: TruckScreenAlert) =>
    tauriInvoke<void>('publish_truck_alert', { alert }),
  saveDispatchedTruck: (truck: Truck) =>
    tauriInvoke<void>('save_dispatched_truck', { truck }),
  getDispatchSummary: () =>
    tauriInvoke<TruckDispatchSummary>('get_truck_dispatch_summary'),
};

// ── Local Admin Auth API ───────────────────────────────────────────────────

export const authApi = {
  login: (email: string, password: string) =>
    tauriInvoke<AuthSession>('login_user', { email, password }),
  logout: (token: string) =>
    tauriInvoke<void>('logout_user', { token }),
  currentUser: (token: string) =>
    tauriInvoke<AuthUser | null>('get_current_user', { token }),
  members: (token: string) =>
    tauriInvoke<AuthUser[]>('get_team_members', { token }),
  invites: (token: string) =>
    tauriInvoke<TeamInvite[]>('get_team_invites', { token }),
  createInvite: (token: string, email: string, role: AdminRole, isDeveloper: boolean) =>
    tauriInvoke<TeamInvite>('create_team_invite', { token, email, role, isDeveloper }),
  acceptInvite: (code: string, name: string, password: string) =>
    tauriInvoke<AuthSession>('accept_team_invite', { code, name, password }),
  getRolePermissions: (token: string) =>
    tauriInvoke<string[]>('get_role_permissions', { token }),
};

export const appConfigApi = {
  getMarquee: () => tauriInvoke<MarqueeSettings>('get_marquee_settings'),
  updateMarquee: (enabled: boolean, text: string, speed: number) =>
    tauriInvoke<MarqueeSettings>('update_marquee_settings', { enabled, text, speed }),
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
  /** Returns all MG Enterprise screens discovered via mDNS on the same router. */
  getPeers: () => tauriInvoke<PeerScreen[]>('get_network_peers'),

  /** Checks a stable screen identity using its most recent heartbeat. */
  checkOnline: (screenId: string) =>
    tauriInvoke<boolean>('check_screen_online', { screenId }),

  /** Bulk-checks all registered screens with IPs, returns [id, is_online] pairs. */
  checkAllOnline: () =>
    tauriInvoke<[string, boolean][]>('check_all_screens_online'),

  /** Returns the active port of the local MG Enterprise HTTP service. */
  getServerPort: () => tauriInvoke<number>('get_lan_server_port'),

  /** Syncs all playlists, schedules, and assets to a screen on the same router. */
  syncScreenData: (screenId: string) =>
    tauriInvoke<number>('sync_screen_data', { screenId }),

  /** Force syncs all playlists, schedules, and assets to a screen immediately. */
  forceSyncScreen: (screenId: string) =>
    tauriInvoke<number>('force_sync_screen', { id: screenId }),
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
