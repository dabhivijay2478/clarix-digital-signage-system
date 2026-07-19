'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { screensApi, playlistsApi, contentApi, analyticsApi, localNetworkApi, customConfirm, getBrowserControllerOrigin, appConfigApi, trucksApi } from '../../lib/tauri';
import type { Screen, Playlist, ContentItem, PlaylistItem, TruckScreenAlert, MarqueeSettings, ScreenPurpose, Truck, GateQueueSettings } from '../../lib/types';
import { getPlaylistItemScheduleRemainingMs, isPlaylistItemScheduleActive, isScreenWithinOperatingHours } from '../../lib/signage-schedule';
import { showToast } from '../../components/Toast';
import { convertFileSrc } from '@tauri-apps/api/core';
import { ArrowLeft } from 'lucide-react';
import { useBrandingStore } from '../../store/ui';
import { useGateStore } from '@/store/gateStore';
import TruckTokenDisplay from '@/components/TruckTokenDisplay';
import { parseScreenGates } from '@/lib/screen-gates';
import { useTruckStore } from '@/store/truckStore';
import { useControllerClock } from '@/hooks/useControllerClock';
import { ArrowLeft } from 'lucide-react';

const AMNS_LOGO_SRC = '/company-logo/AMNS_Logo_Mid.png?v=transparent-20260716';
const PLAYER_SCREEN_STORAGE_KEY = 'clarix_player_screen_id';

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

function getScreenGateNumbers(screen: Screen | null | undefined): string[] {
  const configuredGates = parseScreenGates(screen?.gate);
  if (configuredGates.length > 0) return configuredGates;

  return [...new Set([
    ...parseScreenGates(screen?.name),
    ...parseScreenGates(screen?.location),
  ])];
}

function isTruckTokenScreen(screen: Screen): boolean {
  return screen.purpose === 'truck_gate' || getScreenGateNumbers(screen).length > 0;
}

function pickDefaultPlayerScreen(screens: Screen[], storedId?: string | null, activeTrucks: Truck[] = []): Screen | null {
  const storedScreen = storedId ? screens.find((screen) => screen.id === storedId) ?? null : null;
  if (storedScreen && isTruckTokenScreen(storedScreen)) return storedScreen;

  const activeGate = activeTrucks
    .find((truck) => !truck.is_out && (truck.is_loading || truck.is_in || truck.is_waiting) && truck.gate_no)
    ?.gate_no?.toLowerCase();
  if (activeGate) {
    const matchingTruckScreen = screens.find((screen) =>
      isTruckTokenScreen(screen) && getScreenGateNumbers(screen).includes(activeGate)
    );
    if (matchingTruckScreen) return matchingTruckScreen;
  }

  const truckScreen = screens.find(isTruckTokenScreen);
  if (truckScreen) return truckScreen;

  if (storedScreen) return storedScreen;

  return screens.length === 1 ? screens[0] : null;
}

export default function PlayerPage() {
  const branding = useBrandingStore();
  const { now: controllerNow } = useControllerClock();
  const controllerMinuteMs = Math.floor(controllerNow.getTime() / 60000) * 60000;
  const scheduleNow = useMemo(
    () => new Date(controllerMinuteMs),
    [controllerMinuteMs],
  );
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
  const [playableItems, setPlayableItems] = useState<PlaylistItem[]>([]);
  const [currentItemIndex, setCurrentItemIndex] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [activeTruckGates, setActiveTruckGates] = useState<string[]>([]);
  const [isTruckTokenScreenActive, setIsTruckTokenScreenActive] = useState<boolean>(false);
  const [liveTrucks, setLiveTrucks] = useState<Truck[]>([]);
  const [liveGateSettings, setLiveGateSettings] = useState<GateQueueSettings[]>([]);
  const [liveDisplayRotationSecs, setLiveDisplayRotationSecs] = useState<number | undefined>(undefined);

  // Active Screen context for orientation and operating hours
  const [activeScreen, setActiveScreen] = useState<Screen | null>(null);
  const [isViewportLandscape, setIsViewportLandscape] = useState<boolean>(true);
  const [isScreenBlanked, setIsScreenBlanked] = useState<boolean>(false);
  const [marquee, setMarquee] = useState<MarqueeSettings | null>(null);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const playStartTimeRef = useRef<number>(0);
  const truckAlertTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const controllerNowRef = useRef<Date>(controllerNow);
  const activePlaylistRef = useRef<Playlist | null>(null);
  const isPlayingRef = useRef(false);
  const liveTrucksRef = useRef<Truck[]>([]);
  const resolvingSignageRef = useRef(false);
  const revisionSyncTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRetryPendingRef = useRef(false);
  const lastPlaybackAdvanceRef = useRef<{ key: string; at: number }>({ key: '', at: 0 });

  useEffect(() => {
    controllerNowRef.current = controllerNow;
  }, [controllerNow]);

  useEffect(() => {
    activePlaylistRef.current = activePlaylist;
  }, [activePlaylist]);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    liveTrucksRef.current = liveTrucks;
  }, [liveTrucks]);

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

  const loadInitialPlayerScreen = useCallback(async () => {
    if (typeof window === 'undefined') return;

    try {
      const data = await screensApi.getAll();
      setScreensList(data);
      const activeTrucks = await trucksApi.getActive().catch((error) => {
        console.warn('Failed to load active trucks during player boot:', error);
        return [] as Truck[];
      });
      setLiveTrucks(activeTrucks);

      const params = new URLSearchParams(window.location.search);
      const queryId = params.get('screenId') || params.get('id');
      if (queryId) {
        setScreenId(queryId);
        localStorage.setItem(PLAYER_SCREEN_STORAGE_KEY, queryId);
        return;
      }

      const storedId = localStorage.getItem(PLAYER_SCREEN_STORAGE_KEY);
      const selectedScreen = pickDefaultPlayerScreen(data, storedId, activeTrucks);
      if (selectedScreen) {
        setScreenId(selectedScreen.id);
        localStorage.setItem(PLAYER_SCREEN_STORAGE_KEY, selectedScreen.id);
      } else if (storedId) {
        // Keep retrying the saved screen while the controller restores its data.
        setScreenId(storedId);
      } else if (!storedId) {
        setScreenId(null);
      }
    } catch (err) {
      console.error('Failed to load player screen:', err);
      loadScreensList();
      return;
    } finally {
      setLoading(false);
    }
  }, [loadScreensList]);

  // Load screen ID from query parameters or storage, validating cached IDs.
  useEffect(() => {
    void loadInitialPlayerScreen();
  }, [loadInitialPlayerScreen]);

  // Screen selection handler
  const handleSelectScreen = (id: string) => {
    localStorage.setItem(PLAYER_SCREEN_STORAGE_KEY, id);
    setScreenId(id);

    const selected = screensList.find((screen) => screen.id === id);
    if (selected && isTruckTokenScreen(selected)) {
      const gateNumbers = getScreenGateNumbers(selected);
      setIsTruckTokenScreenActive(true);
      setActiveTruckGates(gateNumbers.map((gate) => gate.toLowerCase()));
      setActiveScreen(selected);
      setActivePlaylist(null);
      setIsPlaying(false);
    } else {
      setIsTruckTokenScreenActive(false);
      setActiveTruckGates([]);
    }
  };

  const handleBackToScreenSelection = useCallback(() => {
    localStorage.removeItem(PLAYER_SCREEN_STORAGE_KEY);
    setScreenId(null);
    setIsTruckTokenScreenActive(false);
    setActiveTruckGates([]);
    setTruckAlert(null);
    setActiveScreen(null);
    setActivePlaylist(null);
    loadScreensList();
  }, [loadScreensList]);

  // Escape key stays inside /player and returns to the player screen picker.
  useEffect(() => {
    if (isReceiverMode) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleBackToScreenSelection();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleBackToScreenSelection, isReceiverMode]);

  useEffect(() => {
    const handleRemoteBack = (event: Event) => {
      event.preventDefault();
      if (screenId) {
        handleBackToScreenSelection();
      } else {
        void loadScreensList();
      }
    };
    window.addEventListener('tv-remote-back', handleRemoteBack);
    return () => window.removeEventListener('tv-remote-back', handleRemoteBack);
  }, [loadScreensList, screenId, handleBackToScreenSelection]);

  // Helper to disconnect screen representation
  const handleDisconnectScreen = async () => {
    const confirmed = await customConfirm('Disconnect screen from this Player device?');
    if (confirmed) {
      localStorage.removeItem(PLAYER_SCREEN_STORAGE_KEY);
      setScreenId(null);
      setIsTruckTokenScreenActive(false);
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

  // Keep track of controller time and evaluate screen blanking limits
  useEffect(() => {
    if (activeScreen && activeScreen.operating_hours) {
      const oh = activeScreen.operating_hours;
      if (oh.blank_when_not_in_use) {
        if (!isScreenWithinOperatingHours(oh, controllerNow)) {
          setIsScreenBlanked(true);
          return;
        }
      }
    }
    setIsScreenBlanked(false);
  }, [activeScreen, controllerNow]);

  // Resolve schedule slot & active playlist
  const resolveActiveSignage = useCallback(async (resetPlayback = false) => {
    if (!screenId) return;
    if (resolvingSignageRef.current) return;
    resolvingSignageRef.current = true;

    try {
      // 1. Fetch data
      const screens = await screensApi.getAll();
      setScreensList(screens);
      const currentScreen = screens.find((s) => s.id === screenId) || null;

      if (!currentScreen) {
        setActiveScreen(null);
        setActivePlaylist(null);
        setActiveTruckGates([]);
        setIsTruckTokenScreenActive(false);
        setIsPlaying(false);

        const fallbackScreen = pickDefaultPlayerScreen(
          screens,
          typeof window !== 'undefined' ? localStorage.getItem(PLAYER_SCREEN_STORAGE_KEY) : null,
          liveTrucksRef.current,
        );
        if (fallbackScreen) {
          localStorage.setItem(PLAYER_SCREEN_STORAGE_KEY, fallbackScreen.id);
          setScreenId(fallbackScreen.id);
          setLoading(false);
          return;
        }

        // Keep the persisted ID while the controller is still restoring its data.
        // A later refresh can resolve the same screen without user intervention.
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
      const screenGateNumbers = getScreenGateNumbers(currentScreen)
      const assignedGateNumbers = gateStore.getAssignedGatesForScreen(screenId)
      const assignedGate = assignedGateNumbers[0]
        ? gateStore.gates.find((g) => g.number === assignedGateNumbers[0])
        : null

      if (currentScreen && isTruckTokenScreen(currentScreen)) {
        activePurpose = 'truck_gate'
        activeGateNumbers = screenGateNumbers.length > 0
          ? screenGateNumbers
          : assignedGateNumbers
        activePlaylistId = currentScreen.playlist_id
      } else if (assignedGate) {
        activePurpose = assignedGate.purpose
        activeGateNumbers = assignedGateNumbers
        activePlaylistId = assignedGate.playlistId
      } else if (currentScreen) {
        activePurpose = currentScreen.purpose
        activeGateNumbers = screenGateNumbers
        activePlaylistId = currentScreen.playlist_id
      }

      let playlistToPlay: Playlist | null = null;
      if (activePlaylistId) {
        playlistToPlay = playlists.find((p) => p.id === activePlaylistId) || null;
      }

      if (activePurpose === 'truck_gate') {
        setIsTruckTokenScreenActive(true);
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

      setIsTruckTokenScreenActive(false);
      setActiveTruckGates([]);
      setContentItems(resolvedItems);

      if (playlistToPlay && playlistToPlay.items.length > 0) {
        const sortedPlaylist: Playlist = {
          ...playlistToPlay,
          items: [...playlistToPlay.items].sort((a, b) => a.order - b.order),
        };

        const nextSignature = playlistPlaybackSignature(sortedPlaylist);
        const currentActivePlaylist = activePlaylistRef.current;
        const currentSignature = currentActivePlaylist ? playlistPlaybackSignature(currentActivePlaylist) : '';

        if (resetPlayback || nextSignature !== currentSignature) {
          const playlistChanged = currentActivePlaylist?.id !== sortedPlaylist.id;
          setActivePlaylist(sortedPlaylist);
          if (resetPlayback || playlistChanged) {
            setCurrentItemIndex(0);
          } else {
            setCurrentItemIndex((index) => Math.min(index, Math.max(sortedPlaylist.items.length - 1, 0)));
          }
        }

        if (!isPlayingRef.current) {
          setCurrentItemIndex(0);
        }
        setIsPlaying(true);
      } else {
        setActivePlaylist(null);
        setIsPlaying(false);
      }
    } catch (err) {
      console.error('Error resolving signage slots:', err);
    } finally {
      resolvingSignageRef.current = false;
    }
  }, [screenId]);

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


  // Controller-hosted browser players refresh content in place when a revision is published.
  useEffect(() => {
    if (!screenId || typeof window === 'undefined' || !window.location.protocol.startsWith('http')) return;
    const events = new EventSource(`${getBrowserControllerOrigin()}/v1/browser/events`);
    events.addEventListener('revision', () => {
      if (revisionSyncTimeoutRef.current) {
        clearTimeout(revisionSyncTimeoutRef.current);
      }
      revisionSyncTimeoutRef.current = setTimeout(
        () => {
          void resolveActiveSignage(true);
        },
        truckAlertRef.current ? 3500 : 250,
      );
    });
    return () => {
      events.close();
      if (revisionSyncTimeoutRef.current) {
        clearTimeout(revisionSyncTimeoutRef.current);
        revisionSyncTimeoutRef.current = null;
      }
    };
  }, [screenId, resolveActiveSignage]);

  // Keep truck token displays in sync with controller data on load and on every change.
  useEffect(() => {
    if (!screenId || !isTruckTokenScreenActive) {
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
  }, [screenId, isTruckTokenScreenActive]);

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
        if (alert.queue_gates?.length) {
          setLiveGateSettings(alert.queue_gates);
        }
        if (alert.display_rotation_secs) {
          setLiveDisplayRotationSecs(alert.display_rotation_secs);
        }

        if (activeScreen && isTruckTokenScreen(activeScreen)) {
          setIsTruckTokenScreenActive(true);
          setActiveTruckGates(getScreenGateNumbers(activeScreen).map((gate) => gate.toLowerCase()));
          setTruckAlert(null);
          return;
        }

        if (isTruckTokenScreenActive) return;

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
  }, [activeScreen, isTruckTokenScreenActive]);

  const activeScreenDefaultContentId = isTruckTokenScreenActive
    ? null
    : resolvedScreen?.default_content_id ?? null;

  // Re-evaluate eligibility on the schedule clock, but preserve array identity
  // while the eligible set is unchanged so media timers are not restarted.
  useEffect(() => {
    let nextPlayableItems: PlaylistItem[] = [];
    if (activePlaylist) {
      const scheduled = activePlaylist.items.filter((item) => isPlaylistItemScheduleActive(item.display_schedule, scheduleNow));
      if (scheduled.length > 0) return scheduled;
    }
    if (nextPlayableItems.length === 0 && activeScreenDefaultContentId) {
      nextPlayableItems = [{
        content_id: activeScreenDefaultContentId,
        order: 0,
        override_duration: null,
        display_schedule: null,
      }];
    }
    return [];
  }, [activePlaylist, activeScreenDefaultContentId, scheduleNow]);

  const hasScheduledPlaylistOverride = useCallback((): boolean => {
    if (!activePlaylist || !isPlaying || !isTruckTokenScreenActive) return false;
    return activePlaylist.items.some((item) => {
      const schedule = item.display_schedule;
      if (!schedule || (typeof schedule === 'object' && Object.keys(schedule).length === 0)) {
        return false;
      }
      return isPlaylistItemScheduleActive(schedule, scheduleNow);
    });
  }, [activePlaylist, isPlaying, isTruckTokenScreenActive, scheduleNow]);

  const advancePlayback = useCallback((contentId: string, itemCount: number) => {
    const advanceKey = `${contentId}:${currentItemIndex}`;
    const advanceNow = Date.now();
    if (
      lastPlaybackAdvanceRef.current.key === advanceKey &&
      advanceNow - lastPlaybackAdvanceRef.current.at < 750
    ) {
      return;
    }
    lastPlaybackAdvanceRef.current = { key: advanceKey, at: advanceNow };
    audioRetryPendingRef.current = false;

    if (screenId) {
      const dwellSecs = playStartTimeRef.current > 0
        ? Math.max(Math.round((advanceNow - playStartTimeRef.current) / 1000), 0)
        : 0;
      analyticsApi.record(screenId, contentId, 'Complete', dwellSecs).catch((err) => {
        console.warn('Failed to record analytics Complete event:', err);
      });
    }

    if (currentItemIndex === itemCount - 1 && !activePlaylist?.loop_enabled) {
      setIsPlaying(false);
      return;
    }
    setCurrentItemIndex((current) => (current + 1) % itemCount);
  }, [activePlaylist?.loop_enabled, currentItemIndex, screenId]);

  const playVideoWithSound = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    video.defaultMuted = false;
    video.muted = false;
    video.volume = 1;
    void video.play().then(() => {
      audioRetryPendingRef.current = false;
    }).catch((error) => {
      audioRetryPendingRef.current = true;
      console.warn('Unmuted video playback is waiting for TV autoplay permission:', error);
    });
  }, []);

  useEffect(() => {
    const handleUserGesture = () => {
      if (audioRetryPendingRef.current) playVideoWithSound();
    };
    document.addEventListener('pointerdown', handleUserGesture, true);
    document.addEventListener('keydown', handleUserGesture, true);
    return () => {
      document.removeEventListener('pointerdown', handleUserGesture, true);
      document.removeEventListener('keydown', handleUserGesture, true);
    };
  }, [playVideoWithSound]);

  // Handle slide duration and transition loop
  useEffect(() => {
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

    const contentDurationMs = Math.max(contentItem.duration_secs ?? 10, 1) * 1000;
    const scheduleRemainingMs = getPlaylistItemScheduleRemainingMs(
      playlistItem.display_schedule,
      controllerNowRef.current
    );
    const playbackDurationMs = scheduleRemainingMs === null
      ? contentDurationMs
      : contentItem.content_type === 'Video'
        ? Math.max(scheduleRemainingMs, 1000)
        : Math.min(contentDurationMs, Math.max(scheduleRemainingMs, 1000));

    // Record Analytics PLAY Event
    if (screenId) {
      analyticsApi.record(screenId, contentItem.id, 'Play').catch((err) => {
        console.warn('Failed to record analytics Play event:', err);
      });
      playStartTimeRef.current = Date.now();
    }

    // Let unscheduled videos advance from the real media end. Buffering should
    // never consume their playback duration on slower signage hardware.
    if (contentItem.content_type === 'Video' && scheduleRemainingMs === null) {
      timerRef.current = null;
      return;
    }

    // Set timer to switch to next slide
    timerRef.current = setTimeout(() => {
      advancePlayback(contentItem.id, playableItems.length);
    }, playbackDurationMs);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [isPlaying, activePlaylist, currentItemIndex, contentItems, screenId, getPlayableItems, advancePlayback]);

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
            key={`${contentItem.id}-${currentItemIndex}-${src}`}
            ref={videoRef}
            src={src}
            autoPlay
            playsInline
            preload="auto"
            loop={playableItems.length === 1 && activePlaylist?.loop_enabled !== false}
            onLoadedMetadata={(event) => {
              event.currentTarget.currentTime = 0;
              event.currentTarget.defaultMuted = false;
              event.currentTarget.volume = 1;
            }}
            onCanPlay={(event) => {
              const video = event.currentTarget;
              if (video.dataset.playbackStarted === 'true') return;
              video.dataset.playbackStarted = 'true';
              video.defaultMuted = false;
              video.muted = false;
              video.volume = 1;
              void video.play().then(() => {
                audioRetryPendingRef.current = false;
              }).catch((error) => {
                audioRetryPendingRef.current = true;
                console.warn('Unmuted video autoplay is waiting for TV permission:', error);
              });
            }}
            onPlaying={() => {
              playStartTimeRef.current = Date.now();
            }}
            onEnded={() => {
              advancePlayback(contentItem.id, playableItems.length);
            }}
            onError={(event) => {
              console.warn('Video failed to load:', event.currentTarget.error);
              if (playableItems.length > 1) {
                window.setTimeout(() => advancePlayback(contentItem.id, playableItems.length), 1000);
              }
            }}
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
        gateSettings={truckAlert.queue_gates ?? liveGateSettings}
        displayRotationSecs={truckAlert.display_rotation_secs ?? liveDisplayRotationSecs}
        title="Truck Token Alert"
        className="z-100"
        showHeader={false}
        gateFilter={truckAlert.gate}
        timeZone={activeScreen?.operating_hours?.timezone}
        loadRemoteSnapshot={false}
        showBackButton
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

  const renderPlayerBackButton = () => {
    if (!screenId) return null;

    return (
      <button
        type="button"
        onClick={handleBackToScreenSelection}
        aria-label="Back to screen selection"
        title="Back to screen selection"
        style={{
          position: 'fixed',
          top: 24,
          left: 24,
          zIndex: 10001,
          width: 48,
          height: 48,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: '1px solid rgba(255, 255, 255, 0.3)',
          borderRadius: 6,
          background: 'rgba(0, 0, 0, 0.68)',
          color: '#fff',
          cursor: 'pointer',
        }}
      >
        <ArrowLeft size={26} strokeWidth={2.25} aria-hidden="true" />
      </button>
    );
  };

  // ── RENDER BLANK STANDBY SCREEN ───────────────────────────────────────────
  if (screenId && isScreenBlanked) {
    return (
      <div
        className="mg-player-stage"
        style={{ background: '#000' }}
      >
        {renderPlayerBackButton()}
      </div>
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
                  onClick={() => {
                    setLoading(true);
                    void loadScreensList();
                  }}
                >
                  Refresh Screens
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
              <button type="button" onClick={handleBackToScreenSelection}>
                ← Player Home
              </button>
            )}
          </div>
        </div>
        {renderBrandingLogo()}
      </div>
    );
  }

  const shouldShowTruckDisplay =
    Boolean(screenId && isTruckTokenScreenActive && !hasScheduledPlaylistOverride());

  if (shouldShowTruckDisplay) {
    return (
      <div
        className="mg-player-stage"
        style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', overflow: 'hidden', background: '#000' }}
      >
        <TruckTokenDisplay
          trucks={liveTrucks.length > 0 ? liveTrucks : trucks}
          gateSettings={liveGateSettings}
          gateFilters={activeTruckGates.length > 0 ? activeTruckGates : undefined}
          timeZone={activeScreen?.operating_hours?.timezone}
          loadRemoteSnapshot={liveTrucks.length === 0}
          displayRotationSecs={liveDisplayRotationSecs}
          showBackButton
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
    if (isProductionDataDisplay(resolvedScreen)) {
      return (
        <div
          className="production-player-surface"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            overflow: 'hidden',
            background: '#ffffff',
            colorScheme: 'light',
            padding: 0,
            boxSizing: 'border-box',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {renderMarquee()}
          <div style={{ flex: 1, minHeight: 0, width: '100%', overflow: 'hidden' }}>
            <ProductionDashboard mode="player" />
          </div>
          {renderBrandingLogo()}
          {renderPlayerBackButton()}
        </div>
      );
    }

    const screenName = resolvedScreen?.name || 'Local Screen';
    const screenLoc = resolvedScreen?.location || '';

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
        {renderPlayerBackButton()}

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
              <button type="button" onClick={handleBackToScreenSelection}>
                Player Home (Esc)
              </button>
            </div>
          )}
        </div>
        {renderBrandingLogo()}
        {renderPlayerBackButton()}
      </div>
    );
  }

  // ── SCHEDULED CONTENT: full player render (only reached when playableItems > 0) ──

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
      {renderMarquee()}
      {renderPlayerBackButton()}

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
