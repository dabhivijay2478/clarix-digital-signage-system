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
import TruckTokenDisplay from '@/components/TruckTokenDisplay';
import { parseScreenGates } from '@/lib/screen-gates';
import { useTruckStore } from '@/store/truckStore';

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
  const trucks = useTruckStore((state) => state.trucks);
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
  const [activeTruckGates, setActiveTruckGates] = useState<string[]>([]);

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
      setScreensList(screens);
      const currentScreen = screens.find((s) => s.id === screenId) || null;

      if (!currentScreen) {
        setActiveScreen(null);
        setActivePlaylist(null);
        setActiveTruckGates([]);
        setIsPlaying(false);

        if (screens.length === 1) {
          localStorage.setItem('clarix_player_screen_id', screens[0].id);
          setScreenId(screens[0].id);
          setLoading(false);
          return;
        }

        localStorage.removeItem('clarix_player_screen_id');
        setScreenId(null);
        setLoading(false);
        return;
      }

      setActiveScreen(currentScreen);

      const playlists = await playlistsApi.getAll();
      const items = await contentApi.getAll();
      const resolvedItems = [...items];

      let activePurpose: ScreenPurpose = 'playlist'
      let activeGateNumbers: string[] = []
      let activePlaylistId: string | null = null

      const gateStore = useGateStore.getState()
      const assignedGateNumbers = gateStore.getAssignedGatesForScreen(screenId)
      const assignedGate = assignedGateNumbers[0]
        ? gateStore.gates.find((g) => g.number === assignedGateNumbers[0])
        : null

      if (currentScreen && currentScreen.purpose !== 'playlist') {
        activePurpose = currentScreen.purpose
        activeGateNumbers = assignedGateNumbers.length > 0
          ? assignedGateNumbers
          : parseScreenGates(currentScreen.gate)
        activePlaylistId = currentScreen.playlist_id
      } else if (assignedGate) {
        activePurpose = assignedGate.purpose
        activeGateNumbers = assignedGateNumbers
        activePlaylistId = assignedGate.playlistId
      } else if (currentScreen) {
        activePurpose = currentScreen.purpose
        activeGateNumbers = parseScreenGates(currentScreen.gate)
        activePlaylistId = currentScreen.playlist_id
      }

      let playlistToPlay: Playlist | null = null;
      if (activePlaylistId) {
        playlistToPlay = playlists.find((p) => p.id === activePlaylistId) || null;
      }

      if (activePurpose === 'truck_gate' && activeGateNumbers.length > 0) {
        setActiveTruckGates(activeGateNumbers.map((gate) => gate.toLowerCase()));
        setContentItems(resolvedItems);
        // Still load the playlist if one is assigned — the player needs it to
        // detect whether a scheduled content window is currently active, so it
        // can temporarily override the default TruckTokenDisplay with the playlist.
        if (playlistToPlay && playlistToPlay.items.length > 0) {
          const sortedPlaylist: Playlist = {
            ...playlistToPlay,
            items: [...playlistToPlay.items].sort((a, b) => a.order - b.order),
          };
          setActivePlaylist(sortedPlaylist);
          setIsPlaying(true);
        } else {
          setActivePlaylist(null);
          setIsPlaying(false);
        }
        setCurrentItemIndex(0);
        return;
      }

      setActiveTruckGates([]);
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
    if (activeTruckGates.length > 0) {
      setTruckAlert(null);
      return;
    }
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
  }, [activeTruckGates]);

  const activeScreenDefaultContentId = activeScreen?.purpose === 'truck_gate'
    ? null
    : activeScreen?.default_content_id ?? null;

  // Derived helper for active items matching schedule
  const getPlayableItems = useCallback((): PlaylistItem[] => {
    if (activePlaylist) {
      const scheduled = activePlaylist.items.filter((item) => isPlaylistItemScheduleActive(item.display_schedule));
      if (scheduled.length > 0) return scheduled;
    }
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
    const playableItems = getPlayableItems();
    const playlistItem = playableItems[currentItemIndex % playableItems.length];
    if (!playlistItem) return null;

    const contentItem = contentItems.find((c) => c.id === playlistItem.content_id);
    if (!contentItem) return null;

    const src = getMediaUrl(contentItem);
    const transitionEffect = playlistItem.display_schedule?.transition || (activePlaylist ? activePlaylist.transition : 'Fade');
    const transitionClass = transitionEffect ? `transition-${transitionEffect.toLowerCase()}` : '';

    if (contentItem.content_type === 'Video') {
      return (
        <div className={`mg-player-media ${transitionClass}`} style={{ width: '100%', height: '100%' }}>
          <video
            src={src}
            autoPlay
            playsInline
            loop={playableItems.length === 1}
            style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
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
        <div className={`mg-player-media ${transitionClass}`} style={{ width: '100%', height: '100%', background: '#000', position: 'relative' }}>
          <iframe
            src={src}
            title={contentItem.name}
            style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
          />
          {!isWebApp && (
            <div
              style={{
                position: 'absolute',
                bottom: 16,
                left: '50%',
                transform: 'translateX(-50%)',
                maxWidth: '90%',
                padding: '8px 16px',
                borderRadius: 999,
                border: '1px solid rgba(255,255,255,0.1)',
                background: 'rgba(0,0,0,0.7)',
                fontSize: 12,
                color: 'rgba(255,255,255,0.8)',
                textAlign: 'center',
              }}
            >
              {contentItem.content_type}: {contentItem.name}
            </div>
          )}
        </div>
      );
    }

    // Image/Ad/Slideshow default
    return (
      <div className={`mg-player-media ${transitionClass}`} style={{ width: '100%', height: '100%' }}>
        <img
          src={src}
          alt={contentItem.name}
          style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
        />
      </div>
    );
  };

  const renderTruckAlertOverlay = () => {
    if (!truckAlert) return null;

    return (
      <TruckTokenDisplay
        trucks={truckAlert.queue_trucks ?? trucks}
        gateSettings={truckAlert.queue_gates}
        title="Truck Token Alert"
        className="z-100"
        showHeader={false}
        gateFilter={truckAlert.gate}
        loadRemoteSnapshot={false}
      />
    );
  };

  const renderMarquee = () => {
    if (!marquee?.enabled || !marquee.text.trim()) return null;

    interface MarqueeItem {
      type: 'text' | 'image';
      content: string;
    }

    const parseMarqueeText = (textStr: string): { items: MarqueeItem[]; limit: number } => {
      let raw = textStr.trim();
      
      // Handle double-escaped strings wrapped in literal quotes
      if (raw.startsWith('"') && raw.endsWith('"')) {
        try {
          const unescaped = JSON.parse(raw);
          if (typeof unescaped === 'string') {
            raw = unescaped.trim();
          }
        } catch (e) {}
      }

      if (raw.startsWith('{') || raw.startsWith('[')) {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            return {
              items: parsed.map((item: any) => ({
                type: item.type || 'text',
                content: item.content || ''
              })),
              limit: 10
            };
          } else if (parsed && typeof parsed === 'object') {
            const rawItems = parsed.items;
            const itemsList = Array.isArray(rawItems) ? rawItems : [];
            return {
              items: itemsList.map((item: any) => ({
                type: item.type || 'text',
                content: item.content || ''
              })),
              limit: typeof parsed.limit === 'number' ? parsed.limit : 10
            };
          }
        } catch (e) {}
      }

      // Legacy fallback
      return {
        items: [{ type: 'text', content: textStr }],
        limit: 10
      };
    };

    const { items, limit } = parseMarqueeText(marquee.text);
    const displayItems = items.slice(0, limit);

    const getImgSrc = (src: string) => {
      if (!src) return '';
      if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('data:')) {
        return src;
      }
      try {
        return convertFileSrc(src);
      } catch (e) {
        return src;
      }
    };

    return (
      <div className="mg-player-marquee">
        <div
          className="mg-player-marquee-track"
          style={{
            animationDuration: `${Math.max(marquee.speed, 15)}s`,
          }}
        >
          {/* First run */}
          <div className="flex items-center shrink-0 gap-16 px-6">
            {displayItems.map((item, idx) => (
              <div key={`c1-${idx}`} className="flex items-center gap-6">
                {item.type === 'text' ? (
                  <span className="whitespace-nowrap">{item.content}</span>
                ) : (
                  <img src={getImgSrc(item.content)} alt="marquee img" className="h-16 w-auto object-contain inline-block align-middle" />
                )}
              </div>
            ))}
          </div>
          {/* Second run for seamless loop */}
          <div className="flex items-center shrink-0 gap-16 px-6">
            {displayItems.map((item, idx) => (
              <div key={`c2-${idx}`} className="flex items-center gap-6">
                {item.type === 'text' ? (
                  <span className="whitespace-nowrap">{item.content}</span>
                ) : (
                  <img src={getImgSrc(item.content)} alt="marquee img" className="h-16 w-auto object-contain inline-block align-middle" />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  // ── RENDER BLANK STANDBY SCREEN ───────────────────────────────────────────
  if (screenId && isScreenBlanked) {
    return (
      <div
        className="mg-player-stage"
        style={{ background: '#000' }}
      />
    );
  }

  // ── RENDER SELECTOR SCREEN ────────────────────────────────────────────────
  if (!screenId) {
    return (
      <div
        className="mg-player-screen"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 56,
          background: '#f4f6f8',
        }}
      >
        <div className="mg-player-badge">
          <span className="mg-player-badge-dot" />
          <span>{port > 0 ? `Controller ${port}` : 'Cached player'}</span>
        </div>

        <div
          className="mg-player-card"
          style={{ width: '100%', maxWidth: 840 }}
        >
          <div className="mg-player-logo-wrap">
            {appLogo ? (
              <img src={appLogo} alt={`${appName} logo`} />
            ) : (
              <span style={{ fontSize: 24, fontWeight: 700, color: '#10b981' }}>{appName[0]}</span>
            )}
          </div>

          <h1 className="mg-player-title">{appName} Player</h1>
          <p className="mg-player-subtitle">
            Select a screen layout to link this display. Ensure the screen is registered in the dashboard.
          </p>

          {loading ? (
            <div className="mg-player-loading">
              <div className="mg-player-spinner" />
              <span className="mg-player-muted">Loading available screens...</span>
            </div>
          ) : screensList.length === 0 ? (
            <div style={{ padding: '24px 0', textAlign: 'center' }}>
              <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: '#111827', marginBottom: 12 }}>
                No screens registered
              </span>
              <p className="mg-player-muted" style={{ maxWidth: 280, margin: '0 auto' }}>
                Add this screen in the Controller dashboard first, then sync it over the same Wi-Fi router.
              </p>
              <button
                type="button"
                className="mg-player-btn"
                onClick={() => router.push('/screens')}
              >
                Go to Dashboard
              </button>
            </div>
          ) : (
            <div className="mg-player-list">
              {screensList.map((screen) => (
                <button
                  key={screen.id}
                  type="button"
                  onClick={() => handleSelectScreen(screen.id)}
                  className="mg-player-list-item"
                >
                  <div className="mg-player-list-item-row">
                    <div>
                      <span className="mg-player-list-item-name">{screen.name}</span>
                      <span className="mg-player-list-item-meta">{screen.location || 'No location'}</span>
                    </div>
                    <span className="mg-player-list-item-status">{screen.pairing_status}</span>
                  </div>
                </button>
              ))}
            </div>
          )}

          <div className="mg-player-footer">
            <span>{port > 0 ? `Controller-hosted browser player · ${port}` : 'Packaged offline player'}</span>
            <button type="button" onClick={() => router.push('/')}>
              ← Back to Main
            </button>
          </div>
        </div>
      </div>
    );
  }

  const hasScheduledContent = getPlayableItems().length > 0;

  if (screenId && activeTruckGates.length > 0 && !hasScheduledContent) {
    return (
      <div
        className="mg-player-stage"
        style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', overflow: 'hidden', background: '#000' }}
      >
        <TruckTokenDisplay
          trucks={trucks}
          gateFilters={activeTruckGates}
        />
        {renderMarquee()}
      </div>
    );
  }

  if (screenId && truckAlert) {
    return renderTruckAlertOverlay();
  }

  // ── RENDER DEFAULT WAIT SCREEN ──────────────────────────────────────────
  const playableItems = getPlayableItems();
  if (playableItems.length === 0) {
    const currentScreen = activeScreen ?? screensList.find((s) => s.id === screenId);
    const screenName = currentScreen?.name || 'Local Screen';
    const screenLoc = currentScreen?.location || '';

    return (
      <div
        className="mg-player-screen"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 56,
          background: '#f4f6f8',
        }}
      >
        {renderTruckAlertOverlay()}
        {renderMarquee()}

        <div className="mg-player-badge">
          <span className="mg-player-badge-dot" />
          <span>Port: {port}</span>
        </div>

        <div style={{ width: '100%', maxWidth: 560, textAlign: 'center' }}>
          <div className="mg-player-wait-icon">▣</div>

          <h1 style={{ margin: '0 0 8px', fontSize: 32, fontWeight: 800, color: '#111827' }}>
            {screenName}
          </h1>
          {screenLoc && (
            <p style={{ margin: '0 0 24px', fontSize: 14, color: '#9ca3af' }}>
              {screenLoc}
            </p>
          )}

          <div className="mg-player-info-box">
            <h2>Awaiting Content Feed</h2>
            <p>
              No playlist item is allowed to play right now. Update this screen&apos;s playlist or content schedule, then publish a new revision.
            </p>
          </div>

          <div className="mg-player-meta-table">
            <div className="mg-player-meta-row">
              <span>Local IP:</span>
              <span>Same Wi-Fi Router</span>
            </div>
            <div className="mg-player-meta-row">
              <span>Connection:</span>
              <span>{port > 0 ? `Controller ${port}` : 'Outbound sync / local cache'}</span>
            </div>
            <div className="mg-player-meta-row">
              <span>System Mode:</span>
              <span>Local Network Signage</span>
            </div>
          </div>

          <div className="mg-player-actions">
            <button type="button" onClick={handleDisconnectScreen}>
              Disconnect Screen
            </button>
            <span style={{ margin: '0 16px', color: 'rgba(255,255,255,0.1)' }}>|</span>
            <button type="button" onClick={() => router.push('/')}>
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
    <div
      className="mg-player-stage"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        background: '#000',
      }}
    >
      <div style={getRotationStyle()}>
        {renderContentItem()}
      </div>
      {renderTruckAlertOverlay()}
      {renderMarquee()}

      {/* Company Branding Logo - embedded base64 so it works on LAN port 7420 */}
      <div
        className="mg-player-branding"
        style={{
          position: 'fixed',
          right: '20px',
          bottom: marquee?.enabled && marquee?.text.trim() ? '120px' : '20px',
          zIndex: 9999,
          pointerEvents: 'none',
          transition: 'bottom 0.3s ease',
          background: 'rgba(15, 23, 42, 0.92)',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          borderRadius: '10px',
          padding: '8px 14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
          backdropFilter: 'blur(8px)',
        }}
      >
        <img
          src="data:image/png;base64,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"
          alt="AMNS Logo"
          style={{ display: 'block', height: '36px', width: 'auto', objectFit: 'contain' }}
        />
      </div>
    </div>
  );
}
