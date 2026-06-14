'use client';

import { useState } from 'react';
import { useSchedule } from '../../hooks/useSchedule';
import ScheduleTimeline from '../../components/ScheduleTimeline';
import Modal from '../../components/Modal';
import { showToast } from '../../components/Toast';
import type { AppWeekday } from '../../lib/types';
import { useScreens } from '../../hooks/useScreens';
import { usePlaylists } from '../../hooks/usePlaylists';

const ALL_DAYS: AppWeekday[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function SchedulePage() {
  const { slots, loading, addSlot, deleteSlot } = useSchedule();
  const { screens } = useScreens();
  const { playlists } = usePlaylists();
  const [showAdd, setShowAdd] = useState(false);
  const [formName, setFormName] = useState('');
  const [formStart, setFormStart] = useState('09:00');
  const [formDuration, setFormDuration] = useState('60');
  const [formPriority, setFormPriority] = useState('1');
  const [formDays, setFormDays] = useState<AppWeekday[]>(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
  const [formScreenIds, setFormScreenIds] = useState<string[]>([]);
  const [formPlaylistId, setFormPlaylistId] = useState<string>('');

  const toggleDay = (day: AppWeekday) => {
    setFormDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  const handleAdd = async () => {
    if (!formName.trim()) {
      showToast('Please enter a slot name', 'error');
      return;
    }
    if (!formPlaylistId) {
      showToast('Please select a playlist', 'error');
      return;
    }
    if (formScreenIds.length === 0) {
      showToast('Please select at least one screen', 'error');
      return;
    }
    try {
      await addSlot(
        formName,
        formScreenIds,
        formPlaylistId,
        formStart,
        parseInt(formDuration) || 60,
        formDays,
        parseInt(formPriority) || 1
      );
      showToast(`Schedule "${formName}" created`, 'success');
      setShowAdd(false);
      setFormName('');
      setFormScreenIds([]);
      setFormPlaylistId('');
    } catch {
      showToast('Failed to create schedule', 'error');
    }
  };

  const handleDelete = async (id: string) => {
    const slot = slots.find((s) => s.id === id);
    if (confirm(`Delete schedule "${slot?.name}"?`)) {
      await deleteSlot(id);
      showToast('Schedule deleted', 'info');
    }
  };

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 className="page-title">Schedule</h1>
          <p className="page-subtitle">
            {slots.length} active slot{slots.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
          + Add Slot
        </button>
      </div>

      {loading ? (
        <div className="empty-state">
          <div className="empty-state-icon" style={{ animation: 'spin 1s linear infinite' }}>◔</div>
          <div className="empty-state-title">Loading schedule...</div>
        </div>
      ) : (
        <>
          <ScheduleTimeline slots={slots} onDelete={handleDelete} />

          {/* Slot List */}
          <div style={{ marginTop: '24px' }}>
            <h2 className="section-title">Active Slots</h2>
            {slots.length === 0 ? (
              <div className="glass-card-static empty-state">
                <div className="empty-state-icon">◔</div>
                <div className="empty-state-title">No schedule slots</div>
                <div className="empty-state-text">
                  Create schedule slots to automate content playback on your screens.
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {slots.map((slot) => {
                  const playlist = playlists.find((p) => p.id === slot.playlist_id);
                  const assignedScreens = screens.filter((s) => slot.screen_ids.includes(s.id));
                  return (
                    <div
                      key={slot.id}
                      className="glass-card"
                      style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <div>
                          <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-primary)' }}>
                            {slot.name}
                          </div>
                          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                            {slot.start_time} • {slot.duration_mins}min • P{slot.priority}
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                            Playlist: <span style={{ color: 'var(--accent-secondary)', fontWeight: 500 }}>{playlist ? playlist.name : 'Unknown Playlist'}</span> • 
                            Screens: <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{assignedScreens.map((s) => s.name).join(', ') || 'No Screens'}</span>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          {slot.days_of_week.map((d) => (
                            <span key={d} className="badge badge-accent" style={{ fontSize: '10px', padding: '2px 6px' }}>
                              {d}
                            </span>
                          ))}
                        </div>
                      </div>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => handleDelete(slot.id)}
                      >
                        Delete
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {/* Add Schedule Modal */}
      <Modal
        isOpen={showAdd}
        onClose={() => setShowAdd(false)}
        title="Add Schedule Slot"
        actions={
          <>
            <button className="btn btn-secondary" onClick={() => setShowAdd(false)}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={handleAdd}>
              Create
            </button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label className="input-label">Slot Name *</label>
            <input
              className="input"
              placeholder="e.g., Morning Show"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              autoFocus
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label className="input-label">Start Time</label>
              <input
                className="input"
                type="time"
                value={formStart}
                onChange={(e) => setFormStart(e.target.value)}
              />
            </div>
            <div>
              <label className="input-label">Duration (minutes)</label>
              <input
                className="input"
                type="number"
                value={formDuration}
                onChange={(e) => setFormDuration(e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className="input-label">Priority</label>
            <input
              className="input"
              type="number"
              min="1"
              max="10"
              value={formPriority}
              onChange={(e) => setFormPriority(e.target.value)}
            />
          </div>
          <div>
            <label className="input-label">Playlist *</label>
            <select
              className="input"
              value={formPlaylistId}
              onChange={(e) => setFormPlaylistId(e.target.value)}
              style={{ background: 'var(--bg-tertiary)', color: 'white', border: '1px solid rgba(255,255,255,0.1)' }}
            >
              <option value="" style={{ background: 'var(--bg-primary)' }}>-- Select Playlist --</option>
              {playlists.map((pl) => (
                <option key={pl.id} value={pl.id} style={{ background: 'var(--bg-primary)' }}>
                  {pl.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="input-label">Target Screens *</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '120px', overflowY: 'auto', padding: '8px', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', background: 'rgba(0,0,0,0.2)' }}>
              {screens.map((screen) => (
                <label key={screen.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', cursor: 'pointer', color: 'white' }}>
                  <input
                    type="checkbox"
                    checked={formScreenIds.includes(screen.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setFormScreenIds((prev) => [...prev, screen.id]);
                      } else {
                        setFormScreenIds((prev) => prev.filter((id) => id !== screen.id));
                      }
                    }}
                    style={{ width: '14px', height: '14px', accentColor: 'var(--accent-primary)' }}
                  />
                  {screen.name} {screen.location ? `(${screen.location})` : ''}
                </label>
              ))}
              {screens.length === 0 && (
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>No screens registered yet. Go to Screens page first.</span>
              )}
            </div>
          </div>
          <div>
            <label className="input-label">Days</label>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {ALL_DAYS.map((day) => (
                <button
                  key={day}
                  type="button"
                  className={`btn btn-sm ${formDays.includes(day) ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => toggleDay(day)}
                >
                  {day}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
