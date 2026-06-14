'use client';

import { useState } from 'react';
import { usePlaylists } from '../../hooks/usePlaylists';
import { useContent } from '../../hooks/useContent';
import PlaylistEditor from '../../components/PlaylistEditor';
import Modal from '../../components/Modal';
import { showToast } from '../../components/Toast';

export default function PlaylistsPage() {
  const { playlists, loading, createPlaylist, updateItems, deletePlaylist } = usePlaylists();
  const { allItems: contentItems } = useContent();
  const [showCreate, setShowCreate] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formTransition, setFormTransition] = useState('Fade');

  const selectedPlaylist = playlists.find((p) => p.id === selectedId);

  const handleCreate = async () => {
    if (!formName.trim()) return;
    try {
      const pl = await createPlaylist(formName, formTransition);
      showToast(`Playlist "${formName}" created`, 'success');
      setShowCreate(false);
      setFormName('');
      setSelectedId(pl.id);
    } catch {
      showToast('Failed to create playlist', 'error');
    }
  };

  const handleUpdateItems = async (playlistId: string, items: import('../../lib/types').PlaylistItem[]) => {
    try {
      await updateItems(playlistId, items);
      showToast('Playlist order saved', 'success');
    } catch {
      showToast('Failed to save playlist', 'error');
    }
  };

  const handleDelete = async (id: string) => {
    const pl = playlists.find((p) => p.id === id);
    if (confirm(`Delete playlist "${pl?.name}"?`)) {
      await deletePlaylist(id);
      if (selectedId === id) setSelectedId(null);
      showToast('Playlist deleted', 'info');
    }
  };

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 className="page-title">Playlists</h1>
          <p className="page-subtitle">
            {playlists.length} playlist{playlists.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
          + New Playlist
        </button>
      </div>

      {loading ? (
        <div className="empty-state">
          <div className="empty-state-icon" style={{ animation: 'spin 1s linear infinite' }}>◔</div>
          <div className="empty-state-title">Loading playlists...</div>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: '24px' }}>
          {/* Playlist List */}
          <div style={{ width: '280px', flexShrink: 0 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {playlists.map((pl) => (
                <div
                  key={pl.id}
                  onClick={() => setSelectedId(pl.id)}
                  style={{
                    padding: '12px 16px',
                    background: selectedId === pl.id ? 'rgba(99, 102, 241, 0.1)' : 'var(--glass-bg)',
                    border: `1px solid ${selectedId === pl.id ? 'var(--border-accent)' : 'var(--glass-border)'}`,
                    borderRadius: 'var(--radius-md)',
                    cursor: 'pointer',
                    transition: 'all var(--transition-fast)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div>
                    <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {pl.name}
                    </div>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                      {pl.items.length} items • {pl.transition}
                    </div>
                  </div>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(pl.id);
                    }}
                    style={{ fontSize: '10px', padding: '4px 8px' }}
                  >
                    ✕
                  </button>
                </div>
              ))}

              {playlists.length === 0 && (
                <div className="empty-state" style={{ padding: '32px 16px' }}>
                  <div className="empty-state-icon">☰</div>
                  <div className="empty-state-title">No playlists</div>
                </div>
              )}
            </div>
          </div>

          {/* Playlist Editor */}
          <div style={{ flex: 1 }}>
            {selectedPlaylist ? (
              <PlaylistEditor
                playlist={selectedPlaylist}
                contentItems={contentItems}
                onUpdateItems={handleUpdateItems}
              />
            ) : (
              <div className="glass-card-static empty-state" style={{ minHeight: '400px' }}>
                <div className="empty-state-icon">☰</div>
                <div className="empty-state-title">Select a playlist to edit</div>
                <div className="empty-state-text">
                  Choose a playlist from the list or create a new one
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Create Playlist Modal */}
      <Modal
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        title="New Playlist"
        actions={
          <>
            <button className="btn btn-secondary" onClick={() => setShowCreate(false)}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={handleCreate}>
              Create
            </button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label className="input-label">Playlist Name *</label>
            <input
              className="input"
              placeholder="e.g., Morning Rotation"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              autoFocus
            />
          </div>
          <div>
            <label className="input-label">Transition Effect</label>
            <select
              className="select"
              value={formTransition}
              onChange={(e) => setFormTransition(e.target.value)}
            >
              <option value="None">None</option>
              <option value="Fade">Fade</option>
              <option value="Slide">Slide</option>
              <option value="Zoom">Zoom</option>
            </select>
          </div>
        </div>
      </Modal>
    </div>
  );
}
