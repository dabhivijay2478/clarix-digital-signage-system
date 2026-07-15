'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { screensApi, playlistsApi, contentApi, analyticsApi, localNetworkApi, customConfirm, getBrowserControllerOrigin, appConfigApi, trucksApi } from '../../lib/tauri';
import type { Screen, Playlist, ContentItem, PlaylistItem, TruckScreenAlert, MarqueeSettings, ScreenPurpose, Truck } from '../../lib/types';
import { isPlaylistItemScheduleActive, isScreenWithinOperatingHours } from '../../lib/signage-schedule';
import { showToast } from '../../components/Toast';
import { convertFileSrc } from '@tauri-apps/api/core';
import { useBrandingStore } from '../../store/ui';
import { useGateStore } from '@/store/gateStore';
import TruckTokenDisplay from '@/components/TruckTokenDisplay';
import { parseScreenGates } from '@/lib/screen-gates';
import { useTruckStore } from '@/store/truckStore';

const AMNS_LOGO_SRC = '/company-logo/AMNS_Logo_Mid.png?v=transparent-20260716';

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

function formatScreenOrientation(orientation: Screen['orientation']): string {
  switch (orientation) {
    case 'LandscapeFlipped':
      return 'Landscape (flipped)';
    case 'PortraitFlipped':
      return 'Portrait (flipped)';
    default:
      return orientation;
  }
}

function getScreenSelectionTags(screen: Screen): string[] {
  const tags: string[] = [];
  if (screen.location?.trim()) tags.push(screen.location.trim());
  tags.push(formatScreenOrientation(screen.orientation));
  if (screen.resolution?.width && screen.resolution?.height) {
    tags.push(`${screen.resolution.width}×${screen.resolution.height}`);
  }
  return tags;
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
  const [isReceiverMode, setIsReceiverMode] = useState(false);

  // Receiver mode removes every route back into the controller UI.
  useEffect(() => {
    if (typeof window === 'undefined') return;

    setIsReceiverMode(new URLSearchParams(window.location.search).get('receiver') === 'tizen');
  }, []);

  // Signage states
  const [activePlaylist, setActivePlaylist] = useState<Playlist | null>(null);
  const [contentItems, setContentItems] = useState<ContentItem[]>([]);
  const [currentItemIndex, setCurrentItemIndex] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [activeTruckGates, setActiveTruckGates] = useState<string[]>([]);
  const [liveTrucks, setLiveTrucks] = useState<Truck[]>([]);

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
    if (isReceiverMode) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        router.push('/');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isReceiverMode, router]);

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
    setLiveTrucks([]);

    const selected = screensList.find((screen) => screen.id === id);
    if (selected?.purpose === 'truck_gate') {
      const gateNumbers = parseScreenGates(selected.gate);
      setActiveTruckGates(gateNumbers.map((gate) => gate.toLowerCase()));
      setActiveScreen(selected);
      setActivePlaylist(null);
      setIsPlaying(false);
    } else {
      setActiveTruckGates([]);
    }
  };

  const handleBackToScreenSelection = useCallback(() => {
    localStorage.removeItem('clarix_player_screen_id');
    setScreenId(null);
    setActiveTruckGates([]);
    setTruckAlert(null);
    setActiveScreen(null);
    setActivePlaylist(null);
    loadScreensList();
  }, [loadScreensList]);

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
          const hasTimedPlaylistItems = sortedPlaylist.items.some((item) => {
            const schedule = item.display_schedule;
            return Boolean(
              schedule
              && typeof schedule === 'object'
              && Object.keys(schedule).length > 0
            );
          });
          setActivePlaylist(hasTimedPlaylistItems ? sortedPlaylist : null);
          setIsPlaying(hasTimedPlaylistItems);
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

  // Keep truck token displays in sync with controller data on load and on every change.
  useEffect(() => {
    if (!screenId || activeTruckGates.length === 0) {
      setLiveTrucks([]);
      return;
    }

    let disposed = false;

    const refreshLiveTrucks = async () => {
      try {
        const active = await trucksApi.getActive();
        if (!disposed) {
          setLiveTrucks(active);
        }
      } catch (error) {
        console.warn('Failed to refresh live trucks for player display:', error);
      }
    };

    void refreshLiveTrucks();
    const interval = setInterval(() => {
      void refreshLiveTrucks();
    }, 3000);

    return () => {
      disposed = true;
      clearInterval(interval);
    };
  }, [screenId, activeTruckGates]);

  // Transient truck status alerts are pushed by the controller and overlay playback.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.location.protocol.startsWith('http')) return;

    const events = new EventSource(`${getBrowserControllerOrigin()}/v1/browser/truck-alerts`);
    events.addEventListener('truck-alert', (event) => {
      try {
        const alert = JSON.parse((event as MessageEvent).data) as TruckScreenAlert;
        if (alert.queue_trucks?.length) {
          setLiveTrucks(alert.queue_trucks);
        }

        if (activeTruckGates.length > 0) return;

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

  const hasScheduledPlaylistOverride = useCallback((): boolean => {
    if (!activePlaylist || !isPlaying || activeScreen?.purpose !== 'truck_gate') return false;
    return activePlaylist.items.some((item) => {
      const schedule = item.display_schedule;
      if (!schedule || (typeof schedule === 'object' && Object.keys(schedule).length === 0)) {
        return false;
      }
      return isPlaylistItemScheduleActive(schedule);
    });
  }, [activePlaylist, isPlaying, activeScreen?.purpose]);

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
        displayRotationSecs={truckAlert.display_rotation_secs}
        title="Truck Token Alert"
        className="z-100"
        showHeader={false}
        gateFilter={truckAlert.gate}
        loadRemoteSnapshot={false}
        showBackButton={!isReceiverMode}
        onBack={handleBackToScreenSelection}
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
              {!isReceiverMode && (
                <button
                  type="button"
                  className="mg-player-btn"
                  onClick={() => router.push('/screens')}
                >
                  Go to Dashboard
                </button>
              )}
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
                    <div className="mg-player-list-item-icon" aria-hidden="true">▣</div>
                    <div className="mg-player-list-item-body">
                      <span className="mg-player-list-item-name">{screen.name}</span>
                      <div className="mg-player-list-item-meta">
                        {getScreenSelectionTags(screen).map((tag) => (
                          <span key={`${screen.id}-${tag}`} className="mg-player-list-item-tag">{tag}</span>
                        ))}
                      </div>
                    </div>
                    <span className="mg-player-list-item-chevron" aria-hidden="true">›</span>
                  </div>
                </button>
              ))}
            </div>
          )}

          <div className="mg-player-footer">
            <span>{port > 0 ? `Controller-hosted browser player · ${port}` : 'Packaged offline player'}</span>
            {!isReceiverMode && (
              <button type="button" onClick={() => router.push('/')}>
                ← Back to Main
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  const shouldShowTruckDisplay =
    Boolean(screenId && activeTruckGates.length > 0 && !hasScheduledPlaylistOverride());

  if (shouldShowTruckDisplay) {
    return (
      <div
        className="mg-player-stage"
        style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', overflow: 'hidden', background: '#000' }}
      >
        <TruckTokenDisplay
          trucks={liveTrucks.length > 0 ? liveTrucks : trucks}
          gateFilters={activeTruckGates}
          loadRemoteSnapshot={liveTrucks.length === 0}
          showBackButton={!isReceiverMode}
          onBack={handleBackToScreenSelection}
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

          {!isReceiverMode && (
            <div className="mg-player-actions">
              <button type="button" onClick={handleDisconnectScreen}>
                Disconnect Screen
              </button>
              <span style={{ margin: '0 16px', color: 'rgba(255,255,255,0.1)' }}>|</span>
              <button type="button" onClick={() => router.push('/')}>
                Exit Player (Esc)
              </button>
            </div>
          )}
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

      {/* Company branding — fixed to the bottom-right without decoration. */}
      <div
        className="mg-player-branding"
        style={{
          position: 'fixed',
          right: '40px',
          bottom: marquee?.enabled && marquee?.text.trim() ? '160px' : '40px',
          zIndex: 9999,
          pointerEvents: 'none',
          transition: 'bottom 0.3s ease',
          background: 'transparent',
          border: 'none',
          borderRadius: 0,
          padding: 0,
          boxShadow: 'none',
          backdropFilter: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <img
          src={AMNS_LOGO_SRC}
          alt="AMNS India logo"
          style={{
            display: 'block',
            height: '110px',
            width: 'auto',
            objectFit: 'contain',
            filter: 'none',
          }}
        />
      </div>
    </div>
  );
}
