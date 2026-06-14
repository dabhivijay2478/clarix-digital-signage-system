'use client';

import { useState } from 'react';
import type { Playlist, PlaylistItem, ContentItem } from '../lib/types';

interface PlaylistEditorProps {
  playlist: Playlist;
  contentItems: ContentItem[];
  onUpdateItems: (playlistId: string, items: PlaylistItem[]) => void;
  onClose?: () => void;
}

export default function PlaylistEditor({
  playlist,
  contentItems,
  onUpdateItems,
  onClose,
}: PlaylistEditorProps) {
  const [items, setItems] = useState<PlaylistItem[]>(playlist.items || []);

  const totalDuration = items.reduce((acc, item) => {
    const content = contentItems.find((c) => c.id === item.content_id);
    return acc + (item.override_duration ?? content?.duration_secs ?? 0);
  }, 0);

  const handleAddItem = (contentId: string) => {
    const newOrder = items.length;
    setItems((prev) => [
      ...prev,
      {
        content_id: contentId,
        order: newOrder,
        override_duration: null,
      },
    ]);
  };

  const handleRemoveItem = (index: number) => {
    setItems((prev) =>
      prev
        .filter((_, idx) => idx !== index)
        .map((item, idx) => ({ ...item, order: idx }))
    );
  };

  const handleMoveItem = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === items.length - 1) return;

    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    const newItems = [...items];
    const temp = newItems[index];
    newItems[index] = newItems[targetIndex];
    newItems[targetIndex] = temp;

    // Fix orders
    newItems.forEach((item, idx) => {
      item.order = idx;
    });

    setItems(newItems);
  };

  const handleOverrideDuration = (index: number, duration: number | null) => {
    setItems((prev) =>
      prev.map((item, idx) =>
        idx === index ? { ...item, override_duration: duration } : item
      )
    );
  };

  return (
    <div className="bg-bg-secondary/40 backdrop-blur-[20px] border border-white/5 rounded-2xl p-6 flex flex-col gap-6 max-h-[85vh] overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between border-b border-white/5 pb-4">
        <div className="flex flex-col gap-1">
          <h3 className="font-semibold text-white tracking-tight">Edit Playlist items</h3>
          <p className="text-xs text-text-secondary">
            Playlist: <span className="font-bold text-accent-secondary">{playlist.name}</span>
          </p>
        </div>
        <div className="flex flex-col items-end text-xs">
          <span className="text-text-muted uppercase font-bold tracking-wider">Total Duration</span>
          <span className="text-lg font-bold text-accent-secondary font-mono">
            {totalDuration}s
          </span>
        </div>
      </div>

      {/* Main Grid: Playlist items vs content library */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-6 flex-1 overflow-hidden min-h-[300px]">
        {/* Current items list (3/5 width) */}
        <div className="md:col-span-3 flex flex-col gap-3 overflow-y-auto pr-1">
          <h4 className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-1">
            Current Items ({items.length})
          </h4>
          {items.length === 0 ? (
            <div className="flex-1 border-2 border-dashed border-white/5 rounded-xl flex flex-col items-center justify-center p-8 text-center text-text-muted">
              <span className="text-2xl mb-2">📥</span>
              <p className="text-xs font-semibold">Playlist is empty</p>
              <p className="text-[10px] text-text-muted mt-0.5">Add items from the library on the right</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {items.map((item, index) => {
                const content = contentItems.find((c) => c.id === item.content_id);
                if (!content) return null;

                return (
                  <div
                    key={`${item.content_id}-${index}`}
                    className="flex items-center gap-3 p-3 bg-bg-primary/40 border border-white/5 rounded-xl hover:border-white/10 transition-all"
                  >
                    {/* Move controls */}
                    <div className="flex flex-col gap-1">
                      <button
                        onClick={() => handleMoveItem(index, 'up')}
                        disabled={index === 0}
                        className="text-xs text-text-muted hover:text-white disabled:opacity-30 disabled:hover:text-text-muted"
                      >
                        ▲
                      </button>
                      <button
                        onClick={() => handleMoveItem(index, 'down')}
                        disabled={index === items.length - 1}
                        className="text-xs text-text-muted hover:text-white disabled:opacity-30 disabled:hover:text-text-muted"
                      >
                        ▼
                      </button>
                    </div>

                    {/* Content type info */}
                    <div className="flex-1 flex flex-col gap-0.5 pr-2">
                      <span className="text-sm font-semibold text-white line-clamp-1 leading-tight">
                        {content.name}
                      </span>
                      <div className="flex items-center gap-2 text-[10px] text-text-muted">
                        <span className="font-bold uppercase tracking-wider">{content.content_type}</span>
                        <span>•</span>
                        <span className="font-mono">Default: {content.duration_secs}s</span>
                      </div>
                    </div>

                    {/* Duration input */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-xs text-text-muted">Override</span>
                      <input
                        type="number"
                        placeholder={`${content.duration_secs}`}
                        value={item.override_duration ?? ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          handleOverrideDuration(
                            index,
                            val ? parseInt(val) : null
                          );
                        }}
                        className="w-16 px-2 py-1 bg-bg-secondary border border-white/5 rounded text-xs font-mono text-center text-white outline-none focus:border-accent-primary"
                      />
                      <span className="text-xs text-text-muted">s</span>
                    </div>

                    {/* Remove button */}
                    <button
                      onClick={() => handleRemoveItem(index)}
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-text-muted hover:text-status-error hover:bg-status-errorMuted transition-all shrink-0 ml-1"
                      title="Remove"
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Content library to choose from (2/5 width) */}
        <div className="md:col-span-2 flex flex-col gap-3 overflow-y-auto pl-1 border-t md:border-t-0 md:border-l border-white/5 pt-4 md:pt-0 md:pl-4">
          <h4 className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-1">
            Content Library
          </h4>
          <div className="flex flex-col gap-2">
            {contentItems.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between p-3 bg-bg-primary/20 border border-white/5 rounded-xl hover:border-white/10 transition-all text-xs"
              >
                <div className="flex flex-col gap-0.5 max-w-[70%]">
                  <span className="font-semibold text-white truncate">{c.name}</span>
                  <span className="text-[10px] text-text-muted font-mono uppercase tracking-wider">
                    {c.content_type} • {c.duration_secs}s
                  </span>
                </div>
                <button
                  onClick={() => handleAddItem(c.id)}
                  className="btn btn-secondary btn-sm shrink-0"
                >
                  ＋ Add
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom Save & Close Actions */}
      <div className="flex items-center justify-end gap-3 border-t border-white/5 pt-4 bg-bg-primary/10 -mx-6 -mb-6 px-6 py-4">
        {onClose && (
          <button onClick={onClose} className="btn btn-secondary">
            Cancel
          </button>
        )}
        <button
          onClick={() => {
            onUpdateItems(playlist.id, items);
            if (onClose) onClose();
          }}
          className="btn btn-primary"
        >
          Save Changes
        </button>
      </div>
    </div>
  );
}
