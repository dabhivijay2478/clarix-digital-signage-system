'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { screensApi, playlistsApi, contentApi, scheduleApi, analyticsApi, lanApi, customConfirm } from '../../lib/tauri';
import type { Screen, Playlist, ContentItem, ScheduleSlot, PlaylistItem } from '../../lib/types';
import { showToast } from '../../components/Toast';

export default function PlayerPage() {
  const router = useRouter();
  const [screenId, setScreenId] = useState<string | null>(null);
  const [screensList, setScreensList] = useState<Screen[]>([]);
  const [port, setPort] = useState<number>(7420);
  const [loading, setLoading] = useState(true);

  // Signage states
  const [activeSlot, setActiveSlot] = useState<ScheduleSlot | null>(null);
  const [activePlaylist, setActivePlaylist] = useState<Playlist | null>(null);
  const [contentItems, setContentItems] = useState<ContentItem[]>([]);
  const [currentItemIndex, setCurrentItemIndex] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);

  // Active Screen context for orientation and operating hours
  const [activeScreen, setActiveScreen] = useState<Screen | null>(null);
  const [isViewportLandscape, setIsViewportLandscape] = useState<boolean>(true);
  const [isScreenBlanked, setIsScreenBlanked] = useState<boolean>(false);

  // Time tracker for schedules
  const [currentTimeStr, setCurrentTimeStr] = useState<string>('');
  const [currentDayStr, setCurrentDayStr] = useState<string>('');

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const playStartTimeRef = useRef<number>(0);

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
    lanApi.getServerPort().then(setPort).catch((err) => {
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

  // Load screen ID from storage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const id = localStorage.getItem('signalos_player_screen_id');
      if (id) {
        setScreenId(id);
      } else {
        loadScreensList();
      }
    }
  }, [loadScreensList]);

  // Screen selection handler
  const handleSelectScreen = (id: string) => {
    localStorage.setItem('signalos_player_screen_id', id);
    setScreenId(id);
  };

  // Helper to disconnect screen representation
  const handleDisconnectScreen = async () => {
    const confirmed = await customConfirm('Disconnect screen from this Player device?');
    if (confirmed) {
      localStorage.removeItem('signalos_player_screen_id');
      setScreenId(null);
      loadScreensList();
    }
  };

  // Helper to map weekday
  const getAppWeekday = (): string => {
    const day = new Date().getDay();
    const map = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return map[day];
  };

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
      setCurrentDayStr(getAppWeekday());

      if (activeScreen && activeScreen.operating_hours) {
        const oh = activeScreen.operating_hours;
        if (oh.blank_when_not_in_use && oh.days) {
          const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
          const todayIndex = new Date().getDay();
          const todayName = weekdays[todayIndex];
          const todayHours = oh.days[todayName];

          if (todayHours) {
            const now = new Date();
            const nowMinutes = now.getHours() * 60 + now.getMinutes();

            const parseToMinutes = (timeStr: string) => {
              const parts = timeStr.split(':');
              return (parseInt(parts[0]) || 0) * 60 + (parseInt(parts[1]) || 0);
            };

            const startMinutes = parseToMinutes(todayHours.start || '00:00');
            const endMinutes = parseToMinutes(todayHours.end || '23:59');

            if (nowMinutes < startMinutes || nowMinutes > endMinutes) {
              setIsScreenBlanked(true);
              return;
            }
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
  const resolveActiveSignage = useCallback(async () => {
    if (!screenId) return;

    try {
      // 1. Fetch data
      const screens = await screensApi.getAll();
      const currentScreen = screens.find((s) => s.id === screenId) || null;
      setActiveScreen(currentScreen);

      const schedules = await scheduleApi.getAll();
      const playlists = await playlistsApi.getAll();
      const items = await contentApi.getAll();
      setContentItems(items);

      // 2. Find active schedule slot for this screen covering today & current time
      const now = new Date();
      const nowHours = now.getHours();
      const nowMinutes = now.getMinutes();
      const nowSecs = nowHours * 3600 + nowMinutes * 60 + now.getSeconds();

      const candidates = schedules.filter((slot) => {
        if (!slot.is_active) return false;
        if (!slot.screen_ids.includes(screenId)) return false;
        if (!slot.days_of_week.includes(currentDayStr as any)) return false;

        // Parse slot start_time (format: "HH:MM:SS" or "HH:MM")
        const timeParts = slot.start_time.split(':');
        const startH = parseInt(timeParts[0] || '0', 10);
        const startM = parseInt(timeParts[1] || '0', 10);
        const startS = parseInt(timeParts[2] || '0', 10);
        const startSecs = startH * 3600 + startM * 60 + startS;

        const endSecs = startSecs + slot.duration_mins * 60;

        return nowSecs >= startSecs && nowSecs < endSecs;
      });

      // Sort by priority descending
      candidates.sort((a, b) => b.priority - a.priority);
      const matchedSlot = candidates[0] || null;

      setActiveSlot(matchedSlot);

      let playlistToPlay: Playlist | null = null;
      if (matchedSlot) {
        playlistToPlay = playlists.find((p) => p.id === matchedSlot.playlist_id) || null;
      } else if (currentScreen && currentScreen.playlist_id) {
        playlistToPlay = playlists.find((p) => p.id === currentScreen.playlist_id) || null;
      }

      if (playlistToPlay && playlistToPlay.items.length > 0) {
        // Sort items by order
        playlistToPlay.items.sort((a, b) => a.order - b.order);

        // If playlist changed, restart playback
        if (!activePlaylist || activePlaylist.id !== playlistToPlay.id) {
          setActivePlaylist(playlistToPlay);
          setCurrentItemIndex(0);
          setIsPlaying(true);
        }
      } else {
        setActivePlaylist(null);
        setIsPlaying(false);
      }
    } catch (err) {
      console.error('Error resolving signage slots:', err);
    }
  }, [screenId, currentDayStr, activePlaylist]);

  // Run resolution on boot and periodically
  useEffect(() => {
    if (screenId) {
      resolveActiveSignage();
      const interval = setInterval(resolveActiveSignage, 3000); // reload config/schedules every 3 seconds
      return () => clearInterval(interval);
    }
  }, [screenId, resolveActiveSignage]);

  // Derived helper for active items matching schedule
  const getPlayableItems = useCallback((): PlaylistItem[] => {
    if (!activePlaylist) return [];
    
    return activePlaylist.items.filter((item) => {
      if (!item.display_schedule) return true;
      const sched = item.display_schedule;
      
      const now = new Date();
      
      // 1. Date restriction check
      if (sched.date_restricted) {
        const todayStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
        if (sched.start_date && todayStr < sched.start_date) return false;
        if (sched.end_date && todayStr > sched.end_date) return false;
      }
      
      // 2. Weekday check
      if (sched.time_restricted && sched.days && sched.days.length > 0) {
        const dayMap = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const todayDayStr = dayMap[now.getDay()];
        if (!sched.days.includes(todayDayStr)) return false;
      }
      
      // 3. Time of day check
      if (sched.time_restricted && sched.start_time && sched.end_time) {
        const nowMinutes = now.getHours() * 60 + now.getMinutes();
        const parseToMinutes = (timeStr: string) => {
          const parts = timeStr.split(':');
          return (parseInt(parts[0]) || 0) * 60 + (parseInt(parts[1]) || 0);
        };
        const startMin = parseToMinutes(sched.start_time);
        const endMin = parseToMinutes(sched.end_time);
        if (nowMinutes < startMin || nowMinutes > endMin) return false;
      }
      
      return true;
    });
  }, [activePlaylist]);

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

    // Determine slide duration
    const duration = playlistItem.override_duration ?? contentItem.duration_secs ?? 10;

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
      return item.url;
    }
    if (item.file_path) {
      // Extract filename
      const filename = item.file_path.split(/[/\\]/).pop() || '';
      const host = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
      return `http://${host}:${port}/media/${encodeURIComponent(filename)}`;
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

    if (contentItem.content_type === 'WebApp') {
      return (
        <iframe
          src={src}
          className={`w-full h-full border-none ${transitionClass}`}
          style={{ width: '100%', height: '100%' }}
        />
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
        {/* Port indicator badge - always visible top-right */}
        <div className="absolute top-4 right-4 z-50 flex items-center gap-2 bg-white/5 border border-white/10 px-3 py-2 rounded-xl font-mono">
          <div className="w-2 h-2 rounded-full bg-accent-primary animate-pulse" />
          <span className="text-[11px] text-text-secondary">Port:</span>
          <span className="text-sm font-bold text-accent-secondary">{port}</span>
        </div>

        <div className="max-w-md w-full bg-bg-secondary/40 backdrop-blur-2xl border border-white/5 rounded-3xl p-8 shadow-2xl flex flex-col items-center text-center animate-fadeIn">
          {/* Logo anim */}
          <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-linear-to-br from-primary via-primary/80 to-secondary font-bold text-primary-foreground shadow-[0_0_25px_var(--accent-glow)] animate-pulse">
            <span className="text-2xl">S</span>
          </div>

          <h1 className="text-2xl font-bold text-white mb-2">SignalOS Player</h1>
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
                  <span className="text-xs text-text-muted font-mono">{screen.ip_address || 'Same Wi-Fi'}</span>
                </button>
              ))}
            </div>
          )}

          <div className="mt-8 pt-6 border-t border-white/5 w-full flex items-center justify-between text-[11px] text-text-muted">
            <span>Service Port: {port}</span>
            <button className="hover:text-white" onClick={() => router.push('/')}>
              ← Back to Main
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── RENDER DEFAULT WAIT SCREEN ──────────────────────────────────────────
  const playableItems = getPlayableItems();
  if (!activePlaylist || playableItems.length === 0) {
    const currentScreen = screensList.find((s) => s.id === screenId);
    const screenName = currentScreen?.name || 'Local Screen';
    const screenLoc = currentScreen?.location || '';

    return (
      <div className="w-screen h-screen bg-black flex flex-col items-center justify-center p-8 select-none font-sans relative overflow-hidden">
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
              No active schedules or playlists resolved at this time. Go to the dashboard, assign a schedule to this screen, and click <strong>Sync to Device</strong>.
            </p>
          </div>

          <div className="flex flex-col gap-1 text-[11px] text-text-muted bg-white/5 border border-white/5 rounded-xl px-4 py-3 font-mono">
            <div className="flex gap-4 justify-between">
              <span>Local IP:</span>
              <span className="text-white">Same Wi-Fi Router</span>
            </div>
            <div className="flex gap-4 justify-between">
              <span>Dynamic Port:</span>
              <span className="text-white">{port}</span>
            </div>
            <div className="flex gap-4 justify-between">
              <span>System Mode:</span>
              <span className="text-white">Offline Wi-Fi Signage</span>
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

  // ── RENDER ACTIVE PLAYBACK SCREEN ──────────────────────────────────────────
  return (
    <div className="w-screen h-screen bg-black overflow-hidden relative select-none flex items-center justify-center">
      <div style={getRotationStyle()}>
        {renderContentItem()}
      </div>

      {/* Port indicator badge - always visible top-right */}
      <div className="absolute top-4 right-4 z-50 flex items-center gap-2 bg-black/60 backdrop-blur-md border border-white/10 px-3 py-2 rounded-xl font-mono">
        <div className="w-2 h-2 rounded-full bg-accent-secondary animate-pulse" />
        <span className="text-[11px] text-text-secondary">Port:</span>
        <span className="text-sm font-bold text-white">{port}</span>
      </div>

      {/* Subtle indicator overlay on hover */}
      <div className="absolute bottom-4 left-4 z-50 bg-black/60 backdrop-blur-md border border-white/5 px-3 py-1.5 rounded-lg text-[10px] text-text-muted opacity-0 hover:opacity-100 transition-opacity duration-200 pointer-events-none font-mono">
        Playing: {activePlaylist.name} (Index: {(currentItemIndex % playableItems.length) + 1}/{playableItems.length}) • Esc to Exit
      </div>
    </div>
  );
}
