'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { screensApi, playlistsApi, contentApi, analyticsApi, localNetworkApi, customConfirm, getBrowserControllerOrigin, appConfigApi } from '../../lib/tauri';
import type { Screen, Playlist, ContentItem, PlaylistItem, TruckScreenAlert, MarqueeSettings, ScreenPurpose } from '../../lib/types';
import { isPlaylistItemScheduleActive, isScreenWithinOperatingHours } from '../../lib/signage-schedule';
import { showToast } from '../../components/Toast';
import { convertFileSrc } from '@tauri-apps/api/core';
import { useBrandingStore } from '../../store/ui';
import { Maximize, Minimize, RefreshCw, LogOut, XCircle } from 'lucide-react';
import { useGateStore } from '@/store/gateStore';

function playlistPlaybackSignature(playlist: Playlist): string {
  return JSON.stringify({
    id: playlist.id,
    loop_enabled: playlist.loop_enabled,
    transition: playlist.transition,
    items: playlist.items.map((item) => ({
      content_id: item.content_id,
      order: item.order,
      override_duration: item.override_duration,
      display_schedule: item.display_schedule ?? null,
    })),
  });
}

export default function PlayerPage() {
  const router = useRouter();
  const branding = useBrandingStore();
  const appName = branding.appName;
  const appLogo = branding.appIcon;
  const [screenId, setScreenId] = useState<string | null>(null);
  const [screensList, setScreensList] = useState<Screen[]>([]);
  const [port, setPort] = useState<number>(7420);
  const [loading, setLoading] = useState(true);

  // Fullscreen and Overlay states
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Toggle fullscreen mode safely
  const toggleFullscreen = async () => {
    try {
      if (typeof window !== 'undefined' && ((window as any).__TAURI__ || (window as any).__TAURI_INTERNALS__ || (window as any).__TAURI_IPC__)) {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        const win = getCurrentWindow();
        const current = await win.isFullscreen();
        await win.setFullscreen(!current);
        setIsFullscreen(!current);
        return;
      }
    } catch (err) {
      console.warn('Tauri fullscreen failed, falling back to browser API:', err);
    }

    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch (err) {
      console.error('Failed to toggle browser fullscreen:', err);
    }
  };

  // Sync fullscreen state changes
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  // Handle controls visibility on mouse move or touch
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleMouseMove = () => {
      setShowControls(true);
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
      controlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
      }, 3500);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('touchstart', handleMouseMove);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('touchstart', handleMouseMove);
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    };
  }, []);

  // Signage states
  const [activePlaylist, setActivePlaylist] = useState<Playlist | null>(null);
  const [contentItems, setContentItems] = useState<ContentItem[]>([]);
  const [currentItemIndex, setCurrentItemIndex] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);

  // Active Screen context for orientation and operating hours
  const [activeScreen, setActiveScreen] = useState<Screen | null>(null);
  const [isViewportLandscape, setIsViewportLandscape] = useState<boolean>(true);
  const [isScreenBlanked, setIsScreenBlanked] = useState<boolean>(false);
  const [truckAlert, setTruckAlert] = useState<TruckScreenAlert | null>(null);
  const [marquee, setMarquee] = useState<MarqueeSettings | null>(null);

  // Time tracker for schedules
  const [currentTimeStr, setCurrentTimeStr] = useState<string>('');

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const playStartTimeRef = useRef<number>(0);
  const truckAlertTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Detect physical viewport aspect ratio (landscape vs portrait)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleResize = () => {
      setIsViewportLandscape(window.innerWidth > window.innerHeight);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Escape key handler to return to dashboard
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        router.push('/');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [router]);

  // Load screen port
  useEffect(() => {
    localNetworkApi.getServerPort().then(setPort).catch((err) => {
      console.warn('Failed to get server port, fallback to 7420:', err);
    });
  }, []);

  // Fetch screens lists if screen ID is not set
  const loadScreensList = useCallback(async () => {
    try {
      const data = await screensApi.getAll();
      setScreensList(data);
    } catch (err) {
      console.error('Failed to load screens list:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load screen ID from query parameters or storage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const queryId = params.get('screenId') || params.get('id');
      if (queryId) {
        setScreenId(queryId);
        localStorage.setItem('clarix_player_screen_id', queryId);
      } else {
        const id = localStorage.getItem('clarix_player_screen_id');
        if (id) {
          setScreenId(id);
        } else {
          loadScreensList();
        }
      }
    }
  }, [loadScreensList]);

  // Screen selection handler
  const handleSelectScreen = (id: string) => {
    localStorage.setItem('clarix_player_screen_id', id);
    setScreenId(id);
  };

  // Helper to disconnect screen representation
  const handleDisconnectScreen = async () => {
    const confirmed = await customConfirm('Disconnect screen from this Player device?');
    if (confirmed) {
      localStorage.removeItem('clarix_player_screen_id');
      setScreenId(null);
      loadScreensList();
    }
  };

  // Sync remote fullscreen command from controller
  useEffect(() => {
    if (!activeScreen) return;

    const syncRemoteFullscreen = async () => {
      try {
        const target = activeScreen.is_fullscreen;
        let current = false;
        const tauriWindow = window as any;

        if (tauriWindow.__TAURI_INTERNALS__ || tauriWindow.__TAURI__ || tauriWindow.__TAURI_IPC__) {
          const { getCurrentWindow } = await import('@tauri-apps/api/window');
          const win = getCurrentWindow();
          current = await win.isFullscreen();
          if (current !== target) {
            await win.setFullscreen(target);
          }
        } else {
          current = !!document.fullscreenElement;
          if (current !== target) {
            if (target) {
              await document.documentElement.requestFullscreen();
            } else if (document.fullscreenElement) {
              await document.exitFullscreen();
            }
          }
        }
        setIsFullscreen(target);
      } catch (err) {
        console.warn('Failed to sync remote fullscreen:', err);
      }
    };

    syncRemoteFullscreen();
  }, [activeScreen]);

  // Time formatting helper
  const getLocalTimeStr = (): string => {
    const now = new Date();
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
  };

  // Keep track of current day, time, and evaluate screen blanking limits
  useEffect(() => {
    const updateTime = () => {
      setCurrentTimeStr(getLocalTimeStr());

      if (activeScreen && activeScreen.operating_hours) {
        const oh = activeScreen.operating_hours;
        if (oh.blank_when_not_in_use) {
          if (!isScreenWithinOperatingHours(oh, new Date())) {
            setIsScreenBlanked(true);
            return;
          }
        }
      }
      setIsScreenBlanked(false);
    };
    updateTime();
    const interval = setInterval(updateTime, 5000); // check time every 5 seconds
    return () => clearInterval(interval);
  }, [activeScreen]);

  // Resolve schedule slot & active playlist
  const resolveActiveSignage = useCallback(async (resetPlayback = false) => {
    if (!screenId) return;

    try {
      // 1. Fetch data
      const screens = await screensApi.getAll();
      const currentScreen = screens.find((s) => s.id === screenId) || null;
      setActiveScreen(currentScreen);

      const playlists = await playlistsApi.getAll();
      const items = await contentApi.getAll();
      const resolvedItems = [...items];

      let activePurpose: ScreenPurpose = 'playlist'
      let activeGateNumber: string | null = null
      let activeProductionDashboardId: string | null = null
      let activePlaylistId: string | null = null

      const gateStore = useGateStore.getState()
      const assignedGateNumber = gateStore.getAssignedGateForScreen(screenId)
      const assignedGate = assignedGateNumber ? gateStore.gates.find((g) => g.number === assignedGateNumber) : null

      if (assignedGate) {
        activePurpose = assignedGate.purpose
        activeGateNumber = assignedGate.number
        activeProductionDashboardId = assignedGate.productionDashboardId
        activePlaylistId = assignedGate.playlistId
      } else if (currentScreen) {
        activePurpose = currentScreen.purpose
        activeGateNumber = currentScreen.gate
        activeProductionDashboardId = currentScreen.production_dashboard_id
        activePlaylistId = currentScreen.playlist_id
      }

      let playlistToPlay: Playlist | null = null;
      if (activePlaylistId) {
        playlistToPlay = playlists.find((p) => p.id === activePlaylistId) || null;
      }

      if (activePurpose === 'truck_gate' && activeGateNumber) {
        const url = `/trucks/display?gate=${activeGateNumber}`;
        const item = resolvedItems.find((content) => content.url === url) ?? {
          id: `virtual-truck-${activeGateNumber}`,
          name: `${activeGateNumber.toUpperCase()} Truck Display`,
          content_type: 'WebApp' as const,
          file_path: null,
          url,
          duration_secs: 30,
          tags: ['truck', activeGateNumber],
          metadata_json: { kind: 'truck_gate', gate: activeGateNumber },
          created_at: new Date().toISOString(),
        };
        if (!resolvedItems.some((content) => content.id === item.id)) resolvedItems.push(item);
        playlistToPlay = {
          id: `virtual-truck-playlist-${activeGateNumber}`,
          name: `${activeGateNumber.toUpperCase()} Truck Display`,
          items: [{ content_id: item.id, order: 0, override_duration: null, display_schedule: null }],
          loop_enabled: true,
          transition: 'None',
          created_at: new Date().toISOString(),
        };
      } else if (activePurpose === 'production_dashboard' && activeProductionDashboardId) {
        const url = `/production-data/view?id=${activeProductionDashboardId}`;
        const item = resolvedItems.find((content) => content.url === url) ?? {
          id: `virtual-production-${activeProductionDashboardId}`,
          name: 'Production Dashboard',
          content_type: 'WebApp' as const,
          file_path: null,
          url,
          duration_secs: 300,
          tags: ['production-data', 'dashboard'],
          metadata_json: { kind: 'production_dashboard', dashboard_id: activeProductionDashboardId },
          created_at: new Date().toISOString(),
        };
        if (!resolvedItems.some((content) => content.id === item.id)) resolvedItems.push(item);
        playlistToPlay = {
          id: `virtual-production-playlist-${activeProductionDashboardId}`,
          name: 'Production Dashboard',
          items: [{ content_id: item.id, order: 0, override_duration: null, display_schedule: null }],
          loop_enabled: true,
          transition: 'None',
          created_at: new Date().toISOString(),
        };
      }
      setContentItems(resolvedItems);

      if (playlistToPlay && playlistToPlay.items.length > 0) {
        const sortedPlaylist: Playlist = {
          ...playlistToPlay,
          items: [...playlistToPlay.items].sort((a, b) => a.order - b.order),
        };

        const nextSignature = playlistPlaybackSignature(sortedPlaylist);
        const currentSignature = activePlaylist ? playlistPlaybackSignature(activePlaylist) : '';

        if (resetPlayback || nextSignature !== currentSignature) {
          const playlistChanged = activePlaylist?.id !== sortedPlaylist.id;
          setActivePlaylist(sortedPlaylist);
          if (resetPlayback || playlistChanged) {
            setCurrentItemIndex(0);
          } else {
            setCurrentItemIndex((index) => Math.min(index, Math.max(sortedPlaylist.items.length - 1, 0)));
          }
        }

        if (!isPlaying) {
          setCurrentItemIndex(0);
        }
        setIsPlaying(true);
      } else {
        setActivePlaylist(null);
        setIsPlaying(false);
      }
    } catch (err) {
      console.error('Error resolving signage slots:', err);
    }
  }, [screenId, activePlaylist, isPlaying]);

  useEffect(() => {
    appConfigApi.getMarquee()
      .then(setMarquee)
      .catch((error) => console.warn('Failed to load marquee settings:', error));
    const interval = setInterval(() => {
      appConfigApi.getMarquee()
        .then(setMarquee)
        .catch(() => undefined);
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleManualSync = useCallback(async () => {
    showToast('Syncing signage content...', 'info');
    try {
      await resolveActiveSignage(true);
      showToast('Signage content synced successfully', 'success');
    } catch (err) {
      showToast(`Sync failed: ${err}`, 'error');
    }
  }, [resolveActiveSignage]);

  // Run resolution on boot and periodically
  useEffect(() => {
    if (screenId) {
      resolveActiveSignage();
      const interval = setInterval(resolveActiveSignage, 15000);
      return () => clearInterval(interval);
    }
  }, [screenId, resolveActiveSignage]);

  const truckAlertRef = useRef<TruckScreenAlert | null>(null);
  useEffect(() => {
    truckAlertRef.current = truckAlert;
  }, [truckAlert]);

  // Controller-hosted browser players refresh immediately when a revision is published.
  useEffect(() => {
    if (!screenId || typeof window === 'undefined' || !window.location.protocol.startsWith('http')) return;
    const events = new EventSource(`${getBrowserControllerOrigin()}/v1/browser/events`);
    events.addEventListener('revision', () => {
      if (truckAlertRef.current) {
        // Wait for the 3-second alert to finish before reloading
        setTimeout(() => {
          window.location.reload();
        }, 3500);
      } else {
        window.location.reload();
      }
    });
    return () => events.close();
  }, [screenId, resolveActiveSignage]);

  // Transient truck status alerts are pushed by the controller and overlay playback.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.location.protocol.startsWith('http')) return;
    const events = new EventSource(`${getBrowserControllerOrigin()}/v1/browser/truck-alerts`);
    events.addEventListener('truck-alert', (event) => {
      try {
        const alert = JSON.parse((event as MessageEvent).data) as TruckScreenAlert;
        setTruckAlert(alert);
        if (truckAlertTimeoutRef.current) {
          clearTimeout(truckAlertTimeoutRef.current);
        }
        truckAlertTimeoutRef.current = setTimeout(() => {
          setTruckAlert((current) => (current?.id === alert.id ? null : current));
        }, Math.max(alert.duration_secs || 3, 1) * 1000);
      } catch (error) {
        console.warn('Failed to parse truck alert event:', error);
      }
    });
    return () => {
      events.close();
      if (truckAlertTimeoutRef.current) {
        clearTimeout(truckAlertTimeoutRef.current);
        truckAlertTimeoutRef.current = null;
      }
    };
  }, []);

  const activeScreenDefaultContentId = activeScreen?.default_content_id ?? null;

  // Derived helper for active items matching schedule
  const getPlayableItems = useCallback((): PlaylistItem[] => {
    if (!activePlaylist) return [];

    const scheduled = activePlaylist.items.filter((item) => isPlaylistItemScheduleActive(item.display_schedule));
    if (scheduled.length > 0) return scheduled;
    if (activeScreenDefaultContentId) {
      return [{ content_id: activeScreenDefaultContentId, order: 0, override_duration: null, display_schedule: null }];
    }
    return [];
  }, [activePlaylist, activeScreenDefaultContentId]);

  // Handle slide duration and transition loop
  useEffect(() => {
    const playableItems = getPlayableItems();
    if (!isPlaying || !activePlaylist || playableItems.length === 0) {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    const playlistItem = playableItems[currentItemIndex % playableItems.length];
    if (!playlistItem) return;

    const contentItem = contentItems.find((c) => c.id === playlistItem.content_id);
    if (!contentItem) {
      // Content missing? Skip to next index
      const nextIndex = (currentItemIndex + 1) % playableItems.length;
      setCurrentItemIndex(nextIndex);
      return;
    }

    // Playlist rows no longer expose duration overrides; content owns its playback time.
    const duration = contentItem.duration_secs ?? 10;

    // Record Analytics PLAY Event
    if (screenId) {
      analyticsApi.record(screenId, contentItem.id, 'Play').catch((err) => {
        console.warn('Failed to record analytics Play event:', err);
      });
      playStartTimeRef.current = Date.now();
    }

    // Set timer to switch to next slide
    timerRef.current = setTimeout(() => {
      // Record Analytics COMPLETE Event
      if (screenId) {
        const dwellSecs = (Date.now() - playStartTimeRef.current) / 1000;
        analyticsApi.record(screenId, contentItem.id, 'Complete', Math.round(dwellSecs)).catch((err) => {
          console.warn('Failed to record analytics Complete event:', err);
        });
      }

      // Move to next item
      if (currentItemIndex === playableItems.length - 1 && !activePlaylist.loop_enabled) {
        setIsPlaying(false); // End of playlist, looping is disabled
      } else {
        const nextIndex = (currentItemIndex + 1) % playableItems.length;
        setCurrentItemIndex(nextIndex);
      }
    }, duration * 1000);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [isPlaying, activePlaylist, currentItemIndex, contentItems, screenId, getPlayableItems]);

  // Get source URL for assets
  const getMediaUrl = (item: ContentItem): string => {
    if (item.url) {
      if (item.url.startsWith('/') || item.url.includes('localhost') || item.url.includes('127.0.0.1')) {
        return item.url;
      }
      return `${getBrowserControllerOrigin()}/api/proxy?url=${encodeURIComponent(item.url)}`;
    }
    if (item.file_path) {
      const filename = item.file_path.split(/[/\\]/).pop() || '';
      const extension = filename.split('.').pop()?.toLowerCase();
      if (['ppt', 'pptx', 'pps', 'ppsx', 'key'].includes(extension || '')) {
        return `${getBrowserControllerOrigin()}/presentation/${encodeURIComponent(filename)}`;
      }

      const tauriWindow = window as typeof window & { __TAURI_INTERNALS__?: unknown };
      if (tauriWindow.__TAURI_INTERNALS__) {
        return convertFileSrc(item.file_path);
      }
      return `${getBrowserControllerOrigin()}/media/${encodeURIComponent(filename)}`;
    }
    return '';
  };

  // Render content item
  const renderContentItem = () => {
    if (!activePlaylist) return null;
    const playableItems = getPlayableItems();
    const playlistItem = playableItems[currentItemIndex % playableItems.length];
    if (!playlistItem) return null;

    const contentItem = contentItems.find((c) => c.id === playlistItem.content_id);
    if (!contentItem) return null;

    const src = getMediaUrl(contentItem);
    const transitionEffect = playlistItem.display_schedule?.transition || activePlaylist.transition || 'Fade';
    const transitionClass = transitionEffect ? `transition-${transitionEffect.toLowerCase()}` : '';

    if (contentItem.content_type === 'Video') {
      return (
        <div className={`relative w-full h-full overflow-hidden ${transitionClass}`} style={{ width: '100%', height: '100%' }}>
          {/* Blurred background video */}
          <video
            src={src}
            autoPlay
            muted
            loop
            className="absolute inset-0 w-full h-full object-cover blur-2xl opacity-60 scale-110 pointer-events-none"
          />
          {/* Main containment video */}
          <video
            src={src}
            autoPlay
            playsInline
            loop={playableItems.length === 1}
            className="relative z-10 w-full h-full object-contain mx-auto"
          />
        </div>
      );
    }

    if (
      contentItem.content_type === 'WebApp' ||
      contentItem.content_type === 'Document' ||
      contentItem.content_type === 'Spreadsheet' ||
      contentItem.content_type === 'Presentation'
    ) {
      const isWebApp = contentItem.content_type === 'WebApp';
      return (
        <div className={`relative h-full w-full overflow-hidden bg-black ${transitionClass}`}>
          <iframe
            src={src}
            title={contentItem.name}
            className="h-full w-full border-none bg-white"
            style={{ width: '100%', height: '100%' }}
          />
          {!isWebApp && (
            <div className="pointer-events-none absolute bottom-4 left-1/2 max-w-[90vw] -translate-x-1/2 rounded-full border border-white/10 bg-black/70 px-4 py-2 text-center text-xs font-medium text-white/80 backdrop-blur">
              {contentItem.content_type}: {contentItem.name}
            </div>
          )}
        </div>
      );
    }

    // Image/Ad/Slideshow default
    return (
      <div className={`relative w-full h-full overflow-hidden ${transitionClass}`} style={{ width: '100%', height: '100%' }}>
        {/* Blurred background image */}
        <div
          className="absolute inset-0 w-full h-full bg-cover bg-center blur-2xl opacity-60 scale-110 pointer-events-none"
          style={{ backgroundImage: `url(${src})` }}
        />
        {/* Main containment image */}
        <img
          src={src}
          alt={contentItem.name}
          className="relative z-10 w-full h-full object-contain mx-auto"
        />
      </div>
    );
  };

  const getStatusColor = (status: string | null | undefined) => {
    switch (status) {
      case 'Loading Out.':
        return 'from-emerald-500 to-teal-600 text-white shadow-emerald-500/20'
      case 'Loading in.':
        return 'from-cyan-500 to-blue-600 text-white shadow-cyan-500/20'
      case 'Waiting':
        return 'from-amber-500 to-orange-600 text-white shadow-amber-500/20'
      default:
        return 'from-zinc-700 to-zinc-800 text-zinc-300'
    }
  };

  const renderTruckAlertOverlay = () => {
    if (!truckAlert) return null;

    // Filter alert to match the screen's gate location (individual display routing)
    if (activeScreen) {
      const screenLoc = (activeScreen.location || '').toLowerCase();
      const alertGate = (truckAlert.gate || '').toLowerCase();
      if (screenLoc.includes('d4') && alertGate !== 'd4') return null;
      if (screenLoc.includes('d5') && alertGate !== 'd5') return null;
    }

    const activeTruckNum = truckAlert.active_truck_number;
    const activeTruckStatus = truckAlert.active_truck_status;
    const nextTruckNum = truckAlert.next_truck_number;
    const nextTruckStatus = truckAlert.next_truck_status;
    const gateLabel = truckAlert.gate ? truckAlert.gate.toUpperCase() : 'UNKNOWN';

    return (
      <div 
        className="fixed inset-0 z-100 grid grid-rows-2 gap-6 bg-black text-white p-6 select-none font-sans"
        style={{
          backgroundImage: 'radial-gradient(circle at center, #0B0F19 0%, #030406 100%)',
        }}
      >
        {/* Active Truck Row */}
        <div 
          className="flex flex-col justify-between p-8 md:p-10 rounded-4xl border border-white/5 bg-zinc-950/20 backdrop-blur-3xl relative overflow-hidden"
          style={{
            boxShadow: activeTruckNum ? '0 20px 80px rgba(6, 182, 212, 0.08)' : 'none',
          }}
        >
          {activeTruckNum && (
            <div className="absolute top-0 right-0 h-40 w-40 rounded-full bg-cyan-500/5 blur-[50px] pointer-events-none" />
          )}
          <div>
            <span className="text-sm font-bold tracking-[0.3em] uppercase text-white/30 block mb-3">
              CURRENT TRUCK (LOADING)
            </span>
            {activeTruckNum ? (
              <h2 className="text-7xl md:text-9xl font-black font-mono tracking-tight text-white leading-none break-all">
                {activeTruckNum.toUpperCase()}
              </h2>
            ) : (
              <h2 className="text-4xl md:text-6xl font-black tracking-tight text-zinc-700 leading-none">
                NO ACTIVE VEHICLE
              </h2>
            )}
          </div>

          <div className="mt-4">
            {activeTruckNum ? (
              <span className={`inline-flex items-center justify-center px-8 py-3 rounded-full text-2xl font-black uppercase tracking-wider bg-linear-to-r shadow-lg ${getStatusColor(activeTruckStatus)}`}>
                {activeTruckStatus}
              </span>
            ) : (
              <span className="inline-flex items-center justify-center px-8 py-3 rounded-full text-xl font-bold uppercase tracking-wider bg-zinc-900 border border-white/5 text-zinc-500">
                Awaiting Loading In
              </span>
            )}
          </div>
        </div>

        {/* Next Truck Row */}
        <div 
          className="flex flex-col justify-between p-8 md:p-10 rounded-4xl border border-white/5 bg-zinc-950/20 backdrop-blur-3xl relative overflow-hidden"
          style={{
            boxShadow: nextTruckNum ? '0 20px 80px rgba(245, 158, 11, 0.05)' : 'none',
          }}
        >
          {nextTruckNum && (
            <div className="absolute top-0 right-0 h-40 w-40 rounded-full bg-amber-500/5 blur-[50px] pointer-events-none" />
          )}
          <div>
            <span className="text-sm font-bold tracking-[0.3em] uppercase text-white/30 block mb-3">
              NEXT VEHICLE (WAITING)
            </span>
            {nextTruckNum ? (
              <h2 className="text-7xl md:text-9xl font-black font-mono tracking-tight text-white/90 leading-none break-all">
                {nextTruckNum.toUpperCase()}
              </h2>
            ) : (
              <h2 className="text-4xl md:text-6xl font-black tracking-tight text-zinc-700 leading-none">
                NO VEHICLE WAITING
              </h2>
            )}
          </div>

          <div className="mt-4">
            {nextTruckNum ? (
              <span className={`inline-flex items-center justify-center px-8 py-3 rounded-full text-2xl font-black uppercase tracking-wider bg-linear-to-r shadow-lg ${getStatusColor(nextTruckStatus)}`}>
                {nextTruckStatus}
              </span>
            ) : (
              <span className="inline-flex items-center justify-center px-8 py-3 rounded-full text-xl font-bold uppercase tracking-wider bg-zinc-900 border border-white/5 text-zinc-500">
                Queue Empty
              </span>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderMarquee = () => {
    if (!marquee?.enabled || !marquee.text.trim()) return null;
    return (
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-90 overflow-hidden border-t border-white/10 bg-black/85 py-3 text-white shadow-2xl backdrop-blur">
        <div
          className="whitespace-nowrap text-2xl font-bold tracking-wide"
          style={{
            animation: `mg-marquee ${Math.max(marquee.speed, 15)}s linear infinite`,
          }}
        >
          <span className="inline-block px-12">{marquee.text}</span>
          <span className="inline-block px-12">{marquee.text}</span>
        </div>
        <style>{`@keyframes mg-marquee { from { transform: translateX(100%); } to { transform: translateX(-100%); } }`}</style>
      </div>
    );
  };

  // ── RENDER BLANK STANDBY SCREEN ───────────────────────────────────────────
  if (screenId && isScreenBlanked) {
    return (
      <div className="w-screen h-screen bg-black flex items-center justify-center select-none" />
    );
  }

  // ── RENDER SELECTOR SCREEN ────────────────────────────────────────────────
  if (!screenId) {
    return (
      <div className="w-screen h-screen bg-linear-to-br from-bg-primary via-[#0B0F19] to-bg-secondary flex flex-col items-center justify-center p-8 select-none">
        {/* Connection mode indicator */}
        <div className="absolute top-4 right-4 z-50 flex items-center gap-2 bg-white/5 border border-white/10 px-3 py-2 rounded-xl font-mono">
          <div className="w-2 h-2 rounded-full bg-accent-primary animate-pulse" />
          <span className="text-[11px] text-text-secondary">{port > 0 ? `Controller ${port}` : 'Cached player'}</span>
        </div>

        <div className="max-w-md w-full bg-bg-secondary/40 backdrop-blur-2xl border border-white/5 rounded-3xl p-8 shadow-2xl flex flex-col items-center text-center animate-fadeIn">
          {/* Logo anim */}
          <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-white p-2 shadow-[0_0_25px_var(--accent-glow)] animate-pulse">
            {appLogo ? (
              <img src={appLogo} alt={`${appName} logo`} className="h-full w-full object-contain" />
            ) : (
              <span className="text-2xl font-bold text-primary">{appName[0]}</span>
            )}
          </div>

          <h1 className="text-2xl font-bold text-white mb-2">{appName} Player</h1>
          <p className="text-xs text-text-secondary mb-8">
            Select a screen layout to link this display. Ensure the screen is registered in the dashboard.
          </p>

          {loading ? (
            <div className="flex flex-col items-center gap-3 py-6">
              <div className="w-8 h-8 rounded-full border-2 border-white/5 border-t-accent-primary animate-spin" />
              <span className="text-xs text-text-muted">Loading available screens...</span>
            </div>
          ) : screensList.length === 0 ? (
            <div className="py-6 flex flex-col items-center gap-3">
              <span className="text-sm text-white font-medium">No screens registered</span>
              <p className="text-xs text-text-muted max-w-[280px]">
                Add this screen in the Controller dashboard first, then sync it over the same Wi-Fi router.
              </p>
              <button
                className="btn btn-secondary mt-4 text-xs"
                onClick={() => router.push('/screens')}
              >
                Go to Dashboard
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5 w-full max-h-[260px] overflow-y-auto pr-1">
              {screensList.map((screen) => (
                <button
                  key={screen.id}
                  onClick={() => handleSelectScreen(screen.id)}
                  className="w-full flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/5 hover:border-accent-primary/50 hover:bg-white/10 text-left transition-all duration-150 group"
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-semibold text-white group-hover:text-accent-secondary transition-colors">
                      {screen.name}
                    </span>
                    <span className="text-[11px] text-text-secondary">{screen.location || 'No location'}</span>
                  </div>
                  <span className="text-xs text-text-muted font-mono">{screen.pairing_status}</span>
                </button>
              ))}
            </div>
          )}

          <div className="mt-8 pt-6 border-t border-white/5 w-full flex items-center justify-between text-[11px] text-text-muted">
            <span>{port > 0 ? `Controller-hosted browser player · ${port}` : 'Packaged offline player'}</span>
            <button className="hover:text-white" onClick={() => router.push('/')}>
              ← Back to Main
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (screenId && truckAlert) {
    return renderTruckAlertOverlay();
  }

  // ── RENDER DEFAULT WAIT SCREEN ──────────────────────────────────────────
  const playableItems = getPlayableItems();
  if (!activePlaylist || playableItems.length === 0) {
    const currentScreen = screensList.find((s) => s.id === screenId);
    const screenName = currentScreen?.name || 'Local Screen';
    const screenLoc = currentScreen?.location || '';

    return (
      <div className="w-screen h-screen bg-black flex flex-col items-center justify-center p-8 select-none font-sans relative overflow-hidden">
        {renderTruckAlertOverlay()}
        {renderMarquee()}
        {/* Modern glowing background lines */}
        <div className="pointer-events-none absolute left-1/4 top-1/4 h-[500px] w-[500px] rounded-full bg-primary/10 blur-[120px]" />
        <div className="pointer-events-none absolute bottom-1/4 right-1/4 h-[500px] w-[500px] rounded-full bg-secondary/10 blur-[120px]" />

        {/* Port indicator badge - always visible top-right */}
        <div className="absolute top-4 right-4 z-50 flex items-center gap-2 bg-white/5 border border-white/10 px-3 py-2 rounded-xl font-mono">
          <div className="w-2 h-2 rounded-full bg-accent-primary animate-pulse" />
          <span className="text-[11px] text-text-secondary">Port:</span>
          <span className="text-sm font-bold text-accent-secondary">{port}</span>
        </div>

        <div className="relative max-w-lg w-full flex flex-col items-center text-center animate-fadeIn z-10">
          {/* Pulsing screen icon */}
          <div className="w-16 h-16 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mb-6">
            <span className="text-3xl text-accent-primary animate-pulse">▣</span>
          </div>

          <h1 className="text-3xl font-extrabold text-white tracking-tight mb-2">
            {screenName}
          </h1>
          {screenLoc && (
            <p className="text-sm text-text-secondary font-medium mb-6">
              {screenLoc}
            </p>
          )}

          <div className="glass-card-static max-w-sm px-6 py-4 mb-8">
            <h2 className="text-sm font-semibold text-white mb-2">Awaiting Content Feed</h2>
            <p className="text-xs text-text-secondary leading-relaxed">
              No playlist item is allowed to play right now. Update this screen&apos;s playlist or content schedule, then publish a new revision.
            </p>
          </div>

          <div className="flex flex-col gap-1 text-[11px] text-text-muted bg-white/5 border border-white/5 rounded-xl px-4 py-3 font-mono">
            <div className="flex gap-4 justify-between">
              <span>Local IP:</span>
              <span className="text-white">Same Wi-Fi Router</span>
            </div>
            <div className="flex gap-4 justify-between">
              <span>Connection:</span>
              <span className="text-white">{port > 0 ? `Controller ${port}` : 'Outbound sync / local cache'}</span>
            </div>
            <div className="flex gap-4 justify-between">
              <span>System Mode:</span>
              <span className="text-white">Local Network Signage</span>
            </div>
          </div>

          <div className="mt-12 flex gap-6 text-xs font-semibold">
            <button className="text-text-muted hover:text-white transition-colors" onClick={handleDisconnectScreen}>
              Disconnect Screen
            </button>
            <span className="text-white/10">|</span>
            <button className="text-text-muted hover:text-white transition-colors" onClick={() => router.push('/')}>
              Exit Player (Esc)
            </button>
          </div>
        </div>
      </div>
    );
  }



  const getRotationStyle = (): React.CSSProperties => {
    if (!activeScreen) return { width: '100%', height: '100%' };
    const { orientation } = activeScreen;

    if (orientation === 'Portrait' || orientation === 'PortraitFlipped') {
      if (isViewportLandscape) {
        const angle = orientation === 'Portrait' ? 90 : 270;
        return {
          transform: `rotate(${angle}deg)`,
          transformOrigin: 'center center',
          width: '100vh',
          height: '100vw',
          position: 'absolute',
          top: '50%',
          left: '50%',
          marginTop: '-50vw',
          marginLeft: '-50vh',
          overflow: 'hidden',
        };
      } else {
        // Viewport is already portrait, no rotation needed, just fill screen
        return {
          width: '100%',
          height: '100%',
          overflow: 'hidden',
        };
      }
    } else if (orientation === 'LandscapeFlipped') {
      return {
        transform: 'rotate(180deg)',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
      };
    }
    
    return {
      width: '100%',
      height: '100%',
      overflow: 'hidden',
    };
  };

  return (
    <div className="w-screen h-screen bg-black overflow-hidden relative select-none flex items-center justify-center">
      <div style={getRotationStyle()}>
        {renderContentItem()}
      </div>
      {renderTruckAlertOverlay()}
      {renderMarquee()}
    </div>
  );
}
