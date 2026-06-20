'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useScreens } from '../../hooks/useScreens';
import { usePlaylists } from '../../hooks/usePlaylists';
import { useContent } from '../../hooks/useContent';
import ScreenCard from '../../components/ScreenCard';
import Modal from '../../components/Modal';
import { showToast } from '../../components/Toast';
import type { AppWeekday, ContentItem, PlaylistItem, PlaylistItemDaySchedule, PlaylistItemSchedule, Screen, TransitionEffect } from '../../lib/types';
import { customConfirm, getBrowserControllerOrigin } from '../../lib/tauri';
import {
  APP_WEEKDAYS,
  defaultPlaylistItemDayTimes,
  defaultPlaylistItemSchedule,
  formatPlaylistScheduleSummary,
  normalizePlaylistItemSchedule,
  validatePlaylistItemSchedule,
} from '../../lib/signage-schedule';
import { Monitor, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';

const ITEM_SCHEDULE_DAY_LABELS: Record<AppWeekday, string> = {
  Mon: 'Monday',
  Tue: 'Tuesday',
  Wed: 'Wednesday',
  Thu: 'Thursday',
  Fri: 'Friday',
  Sat: 'Saturday',
  Sun: 'Sunday',
};

export default function ScreensPage() {
  const { screens, loading, addScreen, editScreen, updateOperatingHours, deleteScreen, refresh } = useScreens();
  const { playlists, createPlaylist, updateItems } = usePlaylists();
  const { items: contentItems } = useContent();

  const [showAdd, setShowAdd] = useState(false);
  const [formName, setFormName] = useState('');
  const [formLocation, setFormLocation] = useState('');
  const [formIp, setFormIp] = useState('');
  const [formOrientation, setFormOrientation] = useState('Landscape');
  const [formWidth, setFormWidth] = useState('1920');
  const [formHeight, setFormHeight] = useState('1080');

  const [editingScreen, setEditingScreen] = useState<Screen | null>(null);
  const [editFormName, setEditFormName] = useState('');
  const [editFormLocation, setEditFormLocation] = useState('');
  const [editFormIp, setEditFormIp] = useState('');
  const [editFormOrientation, setEditFormOrientation] = useState('Landscape');
  const [editFormWidth, setEditFormWidth] = useState('1920');
  const [editFormHeight, setEditFormHeight] = useState('1080');

  // Screen Operating Hours Modal state
  const [hoursScreen, setHoursScreen] = useState<Screen | null>(null);
  const [hoursMode, setHoursMode] = useState('in_use');
  const [hoursBlank, setHoursBlank] = useState(false);
  const [hoursDays, setHoursDays] = useState<any>({
    Monday: { start: '00:00', end: '23:59' },
    Tuesday: { start: '00:00', end: '23:59' },
    Wednesday: { start: '00:00', end: '23:59' },
    Thursday: { start: '00:00', end: '23:59' },
    Friday: { start: '00:00', end: '23:59' },
    Saturday: { start: '00:00', end: '23:59' },
    Sunday: { start: '00:00', end: '23:59' },
  });

  // Consolidated screen details state
  const [selectedScreenId, setSelectedScreenId] = useState<string | null>(null);
  const [localPlaylistItems, setLocalPlaylistItems] = useState<PlaylistItem[]>([]);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState<boolean>(false);
  const [syncingScreenIds, setSyncingScreenIds] = useState<string[]>([]);

  // Content Library filter state
  const [contentSearch, setContentSearch] = useState('');
  const [activeContentTab, setActiveContentTab] = useState<'all' | 'image' | 'video' | 'webapp'>('all');

  // Unified Item Rules / Scheduling modal state
  const [editingItemIndex, setEditingItemIndex] = useState<number | null>(null);
  const [itemSchedTimeRestricted, setItemSchedTimeRestricted] = useState(false);
  const [itemSchedStartTime, setItemSchedStartTime] = useState('09:00');
  const [itemSchedEndTime, setItemSchedEndTime] = useState('17:00');
  const [itemSchedDayTimes, setItemSchedDayTimes] = useState<Record<AppWeekday, PlaylistItemDaySchedule>>(
    () => defaultPlaylistItemDayTimes()
  );
  const [itemSchedDateRestricted, setItemSchedDateRestricted] = useState(false);
  const [itemSchedStartDate, setItemSchedStartDate] = useState('');
  const [itemSchedEndDate, setItemSchedEndDate] = useState('');
  const [itemSchedTransition, setItemSchedTransition] = useState<TransitionEffect>('Fade');

  const selectedScreen = useMemo(
    () => screens.find((s) => s.id === selectedScreenId) || null,
    [screens, selectedScreenId]
  );
  const selectedPlaylist = useMemo(
    () => selectedScreen?.playlist_id ? playlists.find((p) => p.id === selectedScreen.playlist_id) || null : null,
    [playlists, selectedScreen]
  );
  const autoCreatingPlaylistFor = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!selectedScreenId) {
      setLocalPlaylistItems([]);
      setHasUnsavedChanges(false);
      return;
    }

    if (!selectedScreen) return;

    if (!selectedScreen.playlist_id) {
      if (autoCreatingPlaylistFor.current.has(selectedScreen.id)) return;
      autoCreatingPlaylistFor.current.add(selectedScreen.id);

      const autoCreate = async () => {
        try {
          const name = `Playlist for ${selectedScreen.name}`;
          const newPlaylist = await createPlaylist(name, 'Fade', true);
          await editScreen(
            selectedScreen.id,
            selectedScreen.name,
            selectedScreen.location,
            selectedScreen.ip_address || undefined,
            selectedScreen.orientation,
            selectedScreen.resolution?.width ?? 1920,
            selectedScreen.resolution?.height ?? 1080,
            newPlaylist.id
          );
          await refresh();
          showToast(`Auto-created direct playlist for screen "${selectedScreen.name}"`, 'success');
        } catch (err) {
          autoCreatingPlaylistFor.current.delete(selectedScreen.id);
          console.error("Auto-create playlist failed:", err);
          showToast("Failed to link playlist to screen", "error");
        }
      };

      autoCreate();
      return;
    }

    if (hasUnsavedChanges) return;
    if (!selectedPlaylist) return;

    const sorted = [...selectedPlaylist.items].sort((a, b) => a.order - b.order);
    setLocalPlaylistItems(sorted);
    setHasUnsavedChanges(false);
  }, [
    selectedScreenId,
    selectedScreen,
    selectedPlaylist,
    hasUnsavedChanges,
    createPlaylist,
    editScreen,
    refresh,
  ]);

  const handleAddContent = (contentId: string) => {
    const nextOrder = localPlaylistItems.length;
    const newItem: PlaylistItem = {
      content_id: contentId,
      order: nextOrder,
      override_duration: null,
      display_schedule: defaultPlaylistItemSchedule()
    };
    setLocalPlaylistItems(prev => [...prev, newItem]);
    setHasUnsavedChanges(true);
  };

  const handleRemoveItem = (index: number) => {
    setLocalPlaylistItems(prev => {
      const copy = prev.filter((_, idx) => idx !== index);
      return copy.map((item, idx) => ({ ...item, order: idx }));
    });
    setHasUnsavedChanges(true);
  };

  const handleMoveItem = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === localPlaylistItems.length - 1) return;
    
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    setLocalPlaylistItems(prev => {
      const copy = [...prev];
      const temp = copy[index];
      copy[index] = copy[targetIndex];
      copy[targetIndex] = temp;
      return copy.map((item, idx) => ({ ...item, order: idx }));
    });
    setHasUnsavedChanges(true);
  };

  const handleDuplicateItem = (index: number) => {
    const itemToDuplicate = localPlaylistItems[index];
    if (!itemToDuplicate) return;
    
    setLocalPlaylistItems(prev => {
      const copy = [...prev];
      const newItem = {
        ...itemToDuplicate,
        display_schedule: itemToDuplicate.display_schedule ? { ...itemToDuplicate.display_schedule } : null
      };
      copy.splice(index + 1, 0, newItem);
      return copy.map((item, idx) => ({ ...item, order: idx }));
    });
    setHasUnsavedChanges(true);
    showToast("Duplicated item", "success");
  };

  const handleUpdateDuration = (index: number, val: string) => {
    const seconds = parseInt(val, 10);
    setLocalPlaylistItems(prev => {
      const copy = [...prev];
      copy[index] = {
        ...copy[index],
        override_duration: isNaN(seconds) || seconds <= 0 ? null : seconds
      };
      return copy;
    });
    setHasUnsavedChanges(true);
  };

  const buildItemScheduleFromModal = (): PlaylistItemSchedule => {
    const enabledDays = APP_WEEKDAYS.filter((day) => itemSchedDayTimes[day]?.enabled);
    const firstEnabled = enabledDays[0] ? itemSchedDayTimes[enabledDays[0]] : null;
    return {
      time_restricted: itemSchedTimeRestricted,
      start_time: firstEnabled?.start ?? itemSchedStartTime,
      end_time: firstEnabled?.end ?? itemSchedEndTime,
      days: enabledDays,
      day_times: itemSchedDayTimes,
      date_restricted: itemSchedDateRestricted,
      start_date: itemSchedStartDate,
      end_date: itemSchedEndDate,
      transition: itemSchedTransition,
    };
  };

  const validatePlaylistItems = (items: PlaylistItem[]): string | null => {
    for (const [index, item] of items.entries()) {
      const schedule = normalizePlaylistItemSchedule(item.display_schedule);
      const error = validatePlaylistItemSchedule(schedule);
      if (error) return `Item #${index + 1}: ${error}`;
    }
    return null;
  };

  const normalizePlaylistItemsForSave = (items: PlaylistItem[]): PlaylistItem[] =>
    items.map((item, index) => ({
      ...item,
      order: index,
      display_schedule: normalizePlaylistItemSchedule(item.display_schedule),
    }));

  const handleSavePlaylist = async () => {
    if (!selectedScreen || !selectedScreen.playlist_id) return;

    const normalizedItems = normalizePlaylistItemsForSave(localPlaylistItems);
    const validationError = validatePlaylistItems(normalizedItems);
    if (validationError) {
      showToast(validationError, 'error');
      return;
    }

    setSyncingScreenIds((prev) => prev.includes(selectedScreen.id) ? prev : [...prev, selectedScreen.id]);
    try {
      await updateItems(selectedScreen.playlist_id, normalizedItems);
      setLocalPlaylistItems(normalizedItems);
      setHasUnsavedChanges(false);

      const { localNetworkApi } = await import('../../lib/tauri');
      const revision = await localNetworkApi.forceSyncScreen(selectedScreen.id);
      await refresh();
      showToast(`Playlist saved. Force sync revision ${revision} sent to the player.`, "success");
    } catch (err) {
      console.error(err);
      showToast("Failed to save playlist or force sync", "error");
    } finally {
      setSyncingScreenIds((prev) => prev.filter((sid) => sid !== selectedScreen.id));
    }
  };

  const openItemSettings = (index: number) => {
    const item = localPlaylistItems[index];
    if (!item) return;
    
    setEditingItemIndex(index);
    const sched = normalizePlaylistItemSchedule(item.display_schedule);
    
    setItemSchedTimeRestricted(sched.time_restricted);
    setItemSchedStartTime(sched.start_time);
    setItemSchedEndTime(sched.end_time);
    setItemSchedDayTimes((sched.day_times as Record<AppWeekday, PlaylistItemDaySchedule>) ?? defaultPlaylistItemDayTimes(sched.start_time, sched.end_time, sched.days));
    setItemSchedDateRestricted(sched.date_restricted);
    setItemSchedStartDate(sched.start_date);
    setItemSchedEndDate(sched.end_date);
    setItemSchedTransition(sched.transition);
  };

  const saveItemSettings = () => {
    if (editingItemIndex === null) return;
    const nextSchedule = buildItemScheduleFromModal();
    const validationError = validatePlaylistItemSchedule(nextSchedule);
    if (validationError) {
      showToast(validationError, 'error');
      return;
    }
    
    setLocalPlaylistItems(prev => {
      const copy = [...prev];
      copy[editingItemIndex] = {
        ...copy[editingItemIndex],
        display_schedule: nextSchedule
      };
      return copy;
    });
    
    setHasUnsavedChanges(true);
    setEditingItemIndex(null);
    showToast("Settings applied locally", "success");
  };

  const handleBack = async () => {
    if (hasUnsavedChanges) {
      const confirmed = await customConfirm("You have unsaved changes. Discard them and exit?");
      if (!confirmed) {
        return;
      }
    }
    setSelectedScreenId(null);
  };

  const getMediaUrl = (item: ContentItem): string => {
    if (item.url) return item.url;
    if (item.file_path) {
      const filename = item.file_path.split(/[/\\]/).pop() || '';
      const host = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
      return `http://${host}:7420/media/${encodeURIComponent(filename)}`;
    }
    return '';
  };

  const filteredContent = contentItems.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(contentSearch.toLowerCase()) ||
                          item.tags.some(t => t.toLowerCase().includes(contentSearch.toLowerCase()));
                          
    if (!matchesSearch) return false;
    
    if (activeContentTab === 'all') return true;
    if (activeContentTab === 'image') return item.content_type === 'Image' || item.content_type === 'Slideshow';
    if (activeContentTab === 'video') return item.content_type === 'Video';
    if (activeContentTab === 'webapp') return item.content_type === 'WebApp';
    return true;
  });

  const handleAdd = async () => {
    if (!formName.trim()) return;
    try {
      await addScreen(
        formName,
        formLocation,
        formIp || undefined,
        formOrientation,
        parseInt(formWidth) || 1920,
        parseInt(formHeight) || 1080
      );
      showToast(`Screen "${formName}" added`, 'success');
      setShowAdd(false);
      setFormName('');
      setFormLocation('');
      setFormIp('');
      setFormOrientation('Landscape');
      setFormWidth('1920');
      setFormHeight('1080');
    } catch {
      showToast('Failed to add screen', 'error');
    }
  };

  const handleForceSync = async (id: string) => {
    const screen = screens.find((s) => s.id === id);
    if (!screen) return;

    setSyncingScreenIds((prev) => prev.includes(id) ? prev : [...prev, id]);
    showToast(`Force syncing "${screen.name}"...`, 'info');
    try {
      if (selectedScreen?.id === id && selectedScreen.playlist_id && hasUnsavedChanges) {
        const normalizedItems = normalizePlaylistItemsForSave(localPlaylistItems);
        const validationError = validatePlaylistItems(normalizedItems);
        if (validationError) {
          showToast(validationError, 'error');
          return;
        }
        await updateItems(selectedScreen.playlist_id, normalizedItems);
        setLocalPlaylistItems(normalizedItems);
        setHasUnsavedChanges(false);
      }

      const { localNetworkApi } = await import('../../lib/tauri');
      const revision = await localNetworkApi.forceSyncScreen(id);
      await refresh();
      showToast(`Force sync revision ${revision} sent. Launch Player will pull it automatically.`, 'success');
    } catch (err) {
      showToast(`Force sync request failed: ${err}`, 'error');
    } finally {
      setSyncingScreenIds((prev) => prev.filter((sid) => sid !== id));
    }
  };

  const handleDelete = async (id: string) => {
    const screen = screens.find((s) => s.id === id);
    const confirmed = await customConfirm(`Delete screen "${screen?.name}"?`);
    if (confirmed) {
      await deleteScreen(id);
      showToast('Screen deleted', 'info');
    }
  };

  const handleEditClick = (screen: Screen) => {
    setEditingScreen(screen);
    setEditFormName(screen.name);
    setEditFormLocation(screen.location || '');
    setEditFormIp(screen.ip_address || '');
    setEditFormOrientation(screen.orientation || 'Landscape');
    setEditFormWidth(String(screen.resolution?.width ?? 1920));
    setEditFormHeight(String(screen.resolution?.height ?? 1080));
  };

  const handleSaveEdit = async () => {
    if (!editingScreen || !editFormName.trim()) return;
    try {
      await editScreen(
        editingScreen.id,
        editFormName,
        editFormLocation,
        editFormIp || undefined,
        editFormOrientation,
        parseInt(editFormWidth) || 1920,
        parseInt(editFormHeight) || 1080
      );
      showToast(`Screen "${editFormName}" updated`, 'success');
      
      if (editingScreen.pairing_status === 'paired') {
        handleForceSync(editingScreen.id);
      }

      setEditingScreen(null);
    } catch {
      showToast('Failed to update screen', 'error');
    }
  };

  const handleHoursClick = (screen: Screen) => {
    setHoursScreen(screen);
    const existing = screen.operating_hours;
    if (existing && existing.days) {
      setHoursMode(existing.mode || 'in_use');
      setHoursBlank(existing.blank_when_not_in_use || false);
      setHoursDays(existing.days);
    } else {
      setHoursMode('in_use');
      setHoursBlank(false);
      setHoursDays({
        Monday: { start: '00:00', end: '23:59' },
        Tuesday: { start: '00:00', end: '23:59' },
        Wednesday: { start: '00:00', end: '23:59' },
        Thursday: { start: '00:00', end: '23:59' },
        Friday: { start: '00:00', end: '23:59' },
        Saturday: { start: '00:00', end: '23:59' },
        Sunday: { start: '00:00', end: '23:59' },
      });
    }
  };

  const handleSaveHours = async () => {
    if (!hoursScreen) return;
    try {
      const payload = {
        mode: hoursMode,
        days: hoursDays,
        blank_when_not_in_use: hoursBlank,
        timezone: 'Asia/Calcutta',
      };
      await updateOperatingHours(hoursScreen.id, payload);
      showToast(`Operating hours for "${hoursScreen.name}" updated`, 'success');
      
      if (hoursScreen.pairing_status === 'paired') {
        handleForceSync(hoursScreen.id);
      }

      setHoursScreen(null);
    } catch {
      showToast('Failed to update operating hours', 'error');
    }
  };

  if (selectedScreenId && selectedScreen) {
    const isSyncing = syncingScreenIds.includes(selectedScreen.id);

    return (
      <div className="animate-fadeIn">
        {/* Header section */}
        <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <button 
              className="btn btn-secondary btn-icon" 
              onClick={handleBack} 
              style={{ borderRadius: '50%', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}
              title="Back to Screens"
            >
              ←
            </button>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h1 className="page-title" style={{ margin: 0, fontSize: '24px', fontWeight: 'bold', color: 'var(--foreground)' }}>{selectedScreen.name}</h1>
                {isSyncing && (
                  <span className="text-[10px] uppercase font-bold text-primary">
                    Syncing
                  </span>
                )}
              </div>
              <p className="page-subtitle" style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)' }}>
                {selectedScreen.location || 'No location set'} • {selectedScreen.resolution?.width ?? 1920}x{selectedScreen.resolution?.height ?? 1080} • {selectedScreen.orientation}
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button className="btn btn-secondary" onClick={() => handleHoursClick(selectedScreen)}>
              🕒 Hours
            </button>
            <button className="btn btn-secondary" onClick={() => handleEditClick(selectedScreen)}>
              ✎ Settings
            </button>
            <button
              className="btn btn-primary"
              disabled={isSyncing}
              onClick={() => handleForceSync(selectedScreen.id)}
            >
              {isSyncing ? 'Syncing...' : '⚡ Force Sync'}
            </button>
          </div>
        </div>

        {/* Unsaved changes alert */}
        {hasUnsavedChanges && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'color-mix(in srgb, var(--primary) 15%, transparent)',
            border: '1px solid color-mix(in srgb, var(--primary) 30%, transparent)',
            padding: '16px 24px',
            borderRadius: '12px',
            marginBottom: '24px',
            color: 'var(--foreground)',
            boxShadow: '0 4px 20px var(--accent-glow)',
            animation: 'fadeIn 0.2s ease-out'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '18px' }}>⚠️</span>
              <div>
                <span style={{ fontWeight: 'bold' }}>Unsaved Playlist Changes</span>
                <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)' }}>
                  You have modified this screen&apos;s playlist. Remember to save to apply updates.
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button 
                className="btn btn-secondary" 
                onClick={() => {
                  if (selectedScreen.playlist_id) {
                    const playlist = playlists.find(p => p.id === selectedScreen.playlist_id);
                    if (playlist) {
                      setLocalPlaylistItems([...playlist.items].sort((a,b)=>a.order - b.order));
                    }
                  }
                  setHasUnsavedChanges(false);
                  showToast("Changes discarded", "info");
                }}
              >
                Discard
              </button>
              <button className="btn btn-primary" onClick={handleSavePlaylist}>
                Save Changes
              </button>
            </div>
          </div>
        )}

        {/* Split grid layout */}
        <div className="w-full">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            
            {/* Left Column: Screen Playlist */}
            <div className="glass-card-static lg:col-span-7 flex flex-col gap-4 min-h-[450px]">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
                <h3 style={{ margin: 0, color: 'var(--foreground)', fontSize: '16px', fontWeight: 600 }}>Screen Playlist Items</h3>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  {localPlaylistItems.length} item{localPlaylistItems.length !== 1 ? 's' : ''}
                </span>
              </div>

              {localPlaylistItems.length === 0 ? (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', padding: '64px 0', textAlign: 'center' }}>
                  <span style={{ fontSize: '48px', marginBottom: '16px' }}>▣</span>
                  <p style={{ margin: 0, maxWidth: '280px', fontSize: '13px', lineHeight: '1.5' }}>
                    No items in this playlist. Select items from the Content Library on the right to build your feed.
                  </p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {localPlaylistItems.map((playlistItem, index) => {
                    const contentItem = contentItems.find(c => c.id === playlistItem.content_id);
                    if (!contentItem) return null;

                    const mediaUrl = getMediaUrl(contentItem);
                    const sched = normalizePlaylistItemSchedule(playlistItem.display_schedule);
                    const hasRules = sched.time_restricted || sched.date_restricted;
                    const scheduleSummary = formatPlaylistScheduleSummary(sched);

                    return (
                      <div 
                        key={`${playlistItem.content_id}-${index}`}
                        className="glass-card"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '16px',
                          padding: '12px 16px',
                          background: 'var(--border)',
                          border: '1px solid var(--border)',
                          borderRadius: '12px',
                        }}
                      >
                        {/* Order badge */}
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', color: 'var(--text-muted)', fontSize: '12px', fontWeight: 'bold', width: '24px' }}>
                          <span>#{index + 1}</span>
                        </div>

                        {/* Media Thumbnail */}
                        <div style={{ width: '64px', height: '40px', borderRadius: '6px', overflow: 'hidden', background: '#111', flexShrink: 0, position: 'relative', border: '1px solid var(--border)' }}>
                          {contentItem.content_type === 'Image' ? (
                            <img src={mediaUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : contentItem.content_type === 'Video' ? (
                            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px' }}>📹</div>
                          ) : (
                            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px' }}>🌐</div>
                          )}
                        </div>

                        {/* Title and details */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <h4 style={{ margin: 0, color: 'var(--foreground)', fontSize: '14px', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {contentItem.name}
                          </h4>
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '4px', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '9px', padding: '2px 6px', background: 'var(--border)', borderRadius: '4px', color: 'var(--text-secondary)' }}>
                              {contentItem.content_type}
                            </span>
                            <span style={{ fontSize: '9px', padding: '2px 6px', background: hasRules ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.06)', color: hasRules ? 'var(--accent-secondary)' : 'var(--text-muted)', borderRadius: '4px' }}>
                              📅 {scheduleSummary}
                            </span>
                            {sched.transition && sched.transition !== 'Fade' && (
                              <span style={{ fontSize: '9px', padding: '2px 6px', background: 'rgba(168,85,247,0.2)', color: '#c084fc', borderRadius: '4px' }}>
                                ⚡ {sched.transition}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Custom Duration Input */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                          <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Secs:</span>
                          <input
                            type="number"
                            className="input"
                            style={{ width: '56px', padding: '6px 8px', fontSize: '12px', textAlign: 'center' }}
                            placeholder={String(contentItem.duration_secs)}
                            value={playlistItem.override_duration ?? ''}
                            onChange={(e) => handleUpdateDuration(index, e.target.value)}
                          />
                        </div>

                        {/* Menu Options row */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                          <button
                            className="btn btn-secondary btn-icon"
                            style={{ width: '28px', height: '28px', padding: 0 }}
                            title="Configure Scheduling & Transition"
                            onClick={() => openItemSettings(index)}
                          >
                            ⚙
                          </button>
                          <button
                            className="btn btn-secondary btn-icon"
                            style={{ width: '28px', height: '28px', padding: 0 }}
                            disabled={index === 0}
                            title="Move Up"
                            onClick={() => handleMoveItem(index, 'up')}
                          >
                            ↑
                          </button>
                          <button
                            className="btn btn-secondary btn-icon"
                            style={{ width: '28px', height: '28px', padding: 0 }}
                            disabled={index === localPlaylistItems.length - 1}
                            title="Move Down"
                            onClick={() => handleMoveItem(index, 'down')}
                          >
                            ↓
                          </button>
                          <button
                            className="btn btn-secondary btn-icon"
                            style={{ width: '28px', height: '28px', padding: 0 }}
                            title="Duplicate Item"
                            onClick={() => handleDuplicateItem(index)}
                          >
                            ⎘
                          </button>
                          <button
                            className="btn btn-danger btn-icon"
                            style={{ width: '28px', height: '28px', padding: 0 }}
                            title="Remove"
                            onClick={() => handleRemoveItem(index)}
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Save changes action row */}
              <div style={{ marginTop: 'auto', paddingTop: '16px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                <button className="btn btn-secondary" onClick={handleBack}>
                  Discard & Exit
                </button>
                <button className="btn btn-primary" onClick={handleSavePlaylist}>
                  Save Playlist
                </button>
              </div>
            </div>

            {/* Right Column: Content Library */}
            <div className="glass-card-static lg:col-span-5 flex flex-col gap-4 min-h-[450px]">
              <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
                <h3 style={{ margin: 0, color: 'var(--foreground)', fontSize: '16px', fontWeight: 600, marginBottom: '12px' }}>Content Library</h3>
                <input
                  className="input"
                  placeholder="Search by name or tags..."
                  value={contentSearch}
                  onChange={(e) => setContentSearch(e.target.value)}
                  style={{ width: '100%' }}
                />
              </div>

              {/* Tabs */}
              <div style={{ display: 'flex', gap: '6px', background: 'var(--border)', padding: '4px', borderRadius: '8px' }}>
                {(['all', 'image', 'video', 'webapp'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveContentTab(tab)}
                    style={{
                      flex: 1,
                      padding: '6px 12px',
                      fontSize: '11px',
                      fontWeight: 600,
                      borderRadius: '6px',
                      background: activeContentTab === tab ? 'var(--accent-primary)' : 'transparent',
                      color: activeContentTab === tab ? 'white' : 'var(--text-secondary)',
                      border: 'none',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    {tab.toUpperCase()}
                  </button>
                ))}
              </div>

              {/* Grid list */}
              <div style={{ flex: 1, overflowY: 'auto', maxHeight: '500px', display: 'flex', flexDirection: 'column', gap: '10px', paddingRight: '4px' }}>
                {filteredContent.length === 0 ? (
                  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '36px 0', color: 'var(--text-muted)', fontSize: '13px' }}>
                    No matching content found
                  </div>
                ) : (
                  filteredContent.map((item) => {
                    const mediaUrl = getMediaUrl(item);
                    return (
                      <div
                        key={item.id}
                        onClick={() => handleAddContent(item.id)}
                        className="glass-card"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '12px',
                          padding: '10px 12px',
                          background: 'var(--border)',
                          border: '1px solid var(--border)',
                          borderRadius: '10px',
                          cursor: 'pointer',
                          transition: 'all 0.2s'
                        }}
                      >
                        <div style={{ width: '48px', height: '32px', borderRadius: '4px', overflow: 'hidden', background: '#111', flexShrink: 0, border: '1px solid var(--border)' }}>
                          {item.content_type === 'Image' ? (
                            <img src={mediaUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : item.content_type === 'Video' ? (
                            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px' }}>📹</div>
                          ) : (
                            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px' }}>🌐</div>
                          )}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: 'block', color: 'var(--foreground)', fontSize: '13px', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {item.name}
                          </span>
                          <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                            {item.content_type} • {item.duration_secs}s
                          </span>
                        </div>
                        <div style={{ color: 'var(--accent-primary)', fontWeight: 'bold', fontSize: '16px', paddingRight: '4px' }}>
                          +
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

          </div>
        </div>

        {/* Unified Item Rules & Scheduling Modal */}
        <Modal
          isOpen={editingItemIndex !== null}
          onClose={() => setEditingItemIndex(null)}
          title="Content Schedule & Rules"
          actions={
            <>
              <button className="btn btn-secondary" onClick={() => setEditingItemIndex(null)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={saveItemSettings}>
                Apply Rules
              </button>
            </>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '22px', color: 'var(--foreground)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 190px', gap: '12px', borderBottom: '1px solid var(--border)', paddingBottom: '18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                <span style={{ fontSize: '14px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>This content</span>
                <select
                  className="input"
                  value={itemSchedTimeRestricted ? 'scheduled' : 'always'}
                  onChange={(e) => setItemSchedTimeRestricted(e.target.value === 'scheduled')}
                  style={{ width: '100%', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', color: 'var(--foreground)', padding: '8px 12px', fontSize: '13px' }}
                >
                  <option value="always" style={{ background: 'var(--bg-primary)' }}>can play whenever playlist runs</option>
                  <option value="scheduled" style={{ background: 'var(--bg-primary)' }}>is allowed during these times</option>
                </select>
              </div>
              <div>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block', marginBottom: '5px' }}>Transition</span>
                <select
                  className="input"
                  value={itemSchedTransition}
                  onChange={(e) => setItemSchedTransition(e.target.value as TransitionEffect)}
                  style={{ background: 'var(--bg-tertiary)', color: 'var(--foreground)', border: '1px solid var(--border)', fontSize: '13px' }}
                >
                  <option value="Fade" style={{ background: 'var(--bg-primary)' }}>Fade</option>
                  <option value="Slide" style={{ background: 'var(--bg-primary)' }}>Slide</option>
                  <option value="Zoom" style={{ background: 'var(--bg-primary)' }}>Zoom</option>
                  <option value="None" style={{ background: 'var(--bg-primary)' }}>None</option>
                </select>
              </div>
            </div>

            {itemSchedTimeRestricted && (
              <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: '18px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {APP_WEEKDAYS.map((day) => {
                    const daySchedule = itemSchedDayTimes[day] || { enabled: true, start: '09:00', end: '17:00' };
                    return (
                      <div key={day} style={{ display: 'grid', gridTemplateColumns: '140px 1fr 1fr', alignItems: 'center', gap: '12px' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '14px', fontWeight: 600, color: daySchedule.enabled ? 'var(--foreground)' : 'var(--text-muted)' }}>
                          <input
                            type="checkbox"
                            checked={daySchedule.enabled}
                            onChange={(e) => {
                              setItemSchedDayTimes((prev) => ({
                                ...prev,
                                [day]: { ...prev[day], enabled: e.target.checked },
                              }));
                            }}
                            style={{ width: '16px', height: '16px', accentColor: 'var(--accent-primary)' }}
                          />
                          {ITEM_SCHEDULE_DAY_LABELS[day]}
                        </label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: '10px', padding: '7px 10px', opacity: daySchedule.enabled ? 1 : 0.45 }}>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Start</span>
                          <input
                            type="time"
                            value={daySchedule.start}
                            disabled={!daySchedule.enabled}
                            onChange={(e) => {
                              setItemSchedDayTimes((prev) => ({
                                ...prev,
                                [day]: { ...prev[day], start: e.target.value },
                              }));
                            }}
                            style={{ background: 'transparent', border: 'none', color: 'var(--foreground)', width: '100%', fontSize: '13px', outline: 'none', colorScheme: 'dark' }}
                          />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: '10px', padding: '7px 10px', opacity: daySchedule.enabled ? 1 : 0.45 }}>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>End</span>
                          <input
                            type="time"
                            value={daySchedule.end}
                            disabled={!daySchedule.enabled}
                            onChange={(e) => {
                              setItemSchedDayTimes((prev) => ({
                                ...prev,
                                [day]: { ...prev[day], end: e.target.value },
                              }));
                            }}
                            style={{ background: 'transparent', border: 'none', color: 'var(--foreground)', width: '100%', fontSize: '13px', outline: 'none', colorScheme: 'dark' }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p style={{ margin: '12px 0 0', fontSize: '11px', color: 'var(--text-muted)' }}>
                  Content timezone: Asia/Calcutta. Overnight windows like 10:00 PM to 6:00 AM are supported.
                </p>
              </div>
            )}

            {/* Periodic Date Range */}
            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontWeight: 600, fontSize: '14px', marginBottom: '12px' }}>
                <input
                  type="checkbox"
                  checked={itemSchedDateRestricted}
                  onChange={(e) => setItemSchedDateRestricted(e.target.checked)}
                  style={{ width: '16px', height: '16px', accentColor: 'var(--accent-primary)' }}
                />
                Restrict display by date range (periodic)
              </label>

              {itemSchedDateRestricted && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', paddingLeft: '26px' }}>
                  <div>
                    <span style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Start Date</span>
                    <input
                      type="date"
                      className="input"
                      value={itemSchedStartDate}
                      onChange={(e) => setItemSchedStartDate(e.target.value)}
                      style={{ colorScheme: 'dark' }}
                    />
                  </div>
                  <div>
                    <span style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>End Date</span>
                    <input
                      type="date"
                      className="input"
                      value={itemSchedEndDate}
                      onChange={(e) => setItemSchedEndDate(e.target.value)}
                      style={{ colorScheme: 'dark' }}
                    />
                  </div>
                </div>
              )}
            </div>

          </div>
        </Modal>

        {/* Edit Screen Modal */}
        <Modal
          isOpen={editingScreen !== null}
          onClose={() => setEditingScreen(null)}
          title="Edit Screen"
          actions={
            <>
              <button className="btn btn-secondary" onClick={() => setEditingScreen(null)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleSaveEdit}>
                Save Changes
              </button>
            </>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label className="input-label">Screen Name *</label>
              <input
                className="input"
                placeholder="e.g., Lobby Display"
                value={editFormName}
                onChange={(e) => setEditFormName(e.target.value)}
                autoFocus
              />
            </div>
            <div>
              <label className="input-label">IP Address (optional)</label>
              <input
                className="input"
                placeholder="e.g., 192.168.1.100"
                value={editFormIp}
                onChange={(e) => setEditFormIp(e.target.value)}
              />
            </div>
          </div>
        </Modal>

        {/* Screen Operating Hours Modal */}
        <Modal
          isOpen={hoursScreen !== null}
          onClose={() => setHoursScreen(null)}
          title="Screen operating hours"
          actions={
            <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setHoursMode('in_use');
                  setHoursBlank(false);
                  setHoursDays({
                    Monday: { start: '00:00', end: '23:59' },
                    Tuesday: { start: '00:00', end: '23:59' },
                    Wednesday: { start: '00:00', end: '23:59' },
                    Thursday: { start: '00:00', end: '23:59' },
                    Friday: { start: '00:00', end: '23:59' },
                    Saturday: { start: '00:00', end: '23:59' },
                    Sunday: { start: '00:00', end: '23:59' },
                  });
                }}
              >
                Reset
              </button>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="btn btn-secondary" onClick={() => setHoursScreen(null)}>
                  Cancel
                </button>
                <button className="btn btn-primary" onClick={handleSaveHours}>
                  Save
                </button>
              </div>
            </div>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', color: 'var(--foreground)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>This screen</span>
              <select
                className="input"
                value={hoursMode}
                onChange={(e) => setHoursMode(e.target.value)}
                style={{ width: 'auto', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', color: 'var(--foreground)', padding: '6px 12px', fontSize: '13px' }}
              >
                <option value="in_use">is in use during these times</option>
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '8px' }}>
              {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((day) => {
                const dayHours = hoursDays[day] || { start: '00:00', end: '23:59' };
                return (
                  <div key={day} style={{ display: 'grid', gridTemplateColumns: '100px 1fr 1fr', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 500 }}>{day}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '4px 8px' }}>
                      <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Start</span>
                      <input
                        type="time"
                        value={dayHours.start}
                        onChange={(e) => {
                          setHoursDays((prev: any) => ({
                            ...prev,
                            [day]: { ...prev[day], start: e.target.value }
                          }));
                        }}
                        style={{ background: 'transparent', border: 'none', color: 'var(--foreground)', width: '100%', fontSize: '13px', outline: 'none' }}
                      />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '4px 8px' }}>
                      <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>End</span>
                      <input
                        type="time"
                        value={dayHours.end}
                        onChange={(e) => {
                          setHoursDays((prev: any) => ({
                            ...prev,
                            [day]: { ...prev[day], end: e.target.value }
                          }));
                        }}
                        style={{ background: 'transparent', border: 'none', color: 'var(--foreground)', width: '100%', fontSize: '13px', outline: 'none' }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px' }}>
              Screen timezone: Asia/Calcutta
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', marginTop: '8px', fontSize: '13px' }}>
              <input
                type="checkbox"
                checked={hoursBlank}
                onChange={(e) => setHoursBlank(e.target.checked)}
                style={{ width: '16px', height: '16px', accentColor: 'var(--accent-primary)' }}
              />
              Blank the screen when not in use
            </label>
          </div>
        </Modal>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="page-header flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="page-title">Screens</h1>
          <p className="page-subtitle">
            {screens.length} screen{screens.length !== 1 ? 's' : ''} registered
          </p>
        </div>
      </div>

      {loading ? (
        <div aria-busy="true" className="grid-auto">{Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-[390px] rounded-2xl" />)}</div>
      ) : screens.length === 0 ? (
        <Card className="border-dashed bg-transparent">
          <CardContent className="flex min-h-80 flex-col items-center justify-center px-6 py-16 text-center">
            <div className="mb-5 flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Monitor className="size-6" /></div>
            <CardTitle>No screens yet</CardTitle>
            <CardDescription className="mt-2 max-w-md">The pre-configured gate screens will appear here.</CardDescription>
          </CardContent>
        </Card>
      ) : (
        <div className="grid-auto stagger">
          {screens.map((screen) => {
            return (
              <ScreenCard
                key={screen.id}
                screen={screen}
                isSyncing={syncingScreenIds.includes(screen.id)}
                onDelete={handleDelete}
                onEdit={handleEditClick}
                onHours={handleHoursClick}
                onSync={handleForceSync}
                onManage={(id) => setSelectedScreenId(id)}
              />
            );
          })}
        </div>
      )}

      {/* Edit Screen Modal */}
      <Modal
        isOpen={editingScreen !== null}
        onClose={() => setEditingScreen(null)}
        title="Edit Screen"
        actions={
          <>
            <button className="btn btn-secondary" onClick={() => setEditingScreen(null)}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={handleSaveEdit}>
              Save Changes
            </button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label className="input-label">Screen Name *</label>
            <input
              className="input"
              placeholder="e.g., Lobby Display"
              value={editFormName}
              onChange={(e) => setEditFormName(e.target.value)}
              autoFocus
            />
          </div>
          <div>
            <label className="input-label">IP Address (optional)</label>
            <input
              className="input"
              placeholder="e.g., 192.168.1.100"
              value={editFormIp}
              onChange={(e) => setEditFormIp(e.target.value)}
            />
          </div>
        </div>
      </Modal>

      {/* Screen Operating Hours Modal */}
      <Modal
        isOpen={hoursScreen !== null}
        onClose={() => setHoursScreen(null)}
        title="Screen operating hours"
        actions={
          <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
            <button
              className="btn btn-secondary"
              onClick={() => {
                setHoursMode('in_use');
                setHoursBlank(false);
                setHoursDays({
                  Monday: { start: '00:00', end: '23:59' },
                  Tuesday: { start: '00:00', end: '23:59' },
                  Wednesday: { start: '00:00', end: '23:59' },
                  Thursday: { start: '00:00', end: '23:59' },
                  Friday: { start: '00:00', end: '23:59' },
                  Saturday: { start: '00:00', end: '23:59' },
                  Sunday: { start: '00:00', end: '23:59' },
                });
              }}
            >
              Reset
            </button>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="btn btn-secondary" onClick={() => setHoursScreen(null)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleSaveHours}>
                Save
              </button>
            </div>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', color: 'var(--foreground)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>This screen</span>
            <select
              className="input"
              value={hoursMode}
              onChange={(e) => setHoursMode(e.target.value)}
              style={{ width: 'auto', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', color: 'var(--foreground)', padding: '6px 12px', fontSize: '13px' }}
            >
              <option value="in_use">is in use during these times</option>
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '8px' }}>
            {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((day) => {
              const dayHours = hoursDays[day] || { start: '00:00', end: '23:59' };
              return (
                <div key={day} style={{ display: 'grid', gridTemplateColumns: '100px 1fr 1fr', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 500 }}>{day}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '4px 8px' }}>
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Start</span>
                    <input
                      type="time"
                      value={dayHours.start}
                      onChange={(e) => {
                        setHoursDays((prev: any) => ({
                          ...prev,
                          [day]: { ...prev[day], start: e.target.value }
                        }));
                      }}
                      style={{ background: 'transparent', border: 'none', color: 'var(--foreground)', width: '100%', fontSize: '13px', outline: 'none' }}
                    />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '4px 8px' }}>
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>End</span>
                    <input
                      type="time"
                      value={dayHours.end}
                      onChange={(e) => {
                        setHoursDays((prev: any) => ({
                          ...prev,
                          [day]: { ...prev[day], end: e.target.value }
                        }));
                      }}
                      style={{ background: 'transparent', border: 'none', color: 'var(--foreground)', width: '100%', fontSize: '13px', outline: 'none' }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px' }}>
            Screen timezone: Asia/Calcutta
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', marginTop: '8px', fontSize: '13px' }}>
            <input
              type="checkbox"
              checked={hoursBlank}
              onChange={(e) => setHoursBlank(e.target.checked)}
              style={{ width: '16px', height: '16px', accentColor: 'var(--accent-primary)' }}
            />
            Blank the screen when not in use
          </label>
        </div>
      </Modal>
    </div>
  );
}
