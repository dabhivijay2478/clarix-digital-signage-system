'use client';

import { useEffect, useState, useCallback } from 'react';
import { playlistsApi } from '../lib/tauri';
import type { Playlist, PlaylistItem } from '../lib/types';

export function usePlaylists() {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPlaylists = useCallback(async () => {
    try {
      const data = await playlistsApi.getAll();
      setPlaylists(data);
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPlaylists();
  }, [fetchPlaylists]);

  const createPlaylist = useCallback(
    async (name: string, transition?: string, loopEnabled?: boolean) => {
      try {
        const playlist = await playlistsApi.create(name, transition, loopEnabled);
        setPlaylists((prev) => [...prev, playlist]);
        return playlist;
      } catch (e) {
        setError(String(e));
        throw e;
      }
    },
    []
  );

  const updateItems = useCallback(
    async (playlistId: string, items: PlaylistItem[]) => {
      try {
        await playlistsApi.updateItems(playlistId, items);
        await fetchPlaylists();
      } catch (e) {
        setError(String(e));
        throw e;
      }
    },
    [fetchPlaylists]
  );

  const deletePlaylist = useCallback(async (id: string) => {
    try {
      await playlistsApi.delete(id);
      setPlaylists((prev) => prev.filter((p) => p.id !== id));
    } catch (e) {
      setError(String(e));
    }
  }, []);

  return {
    playlists,
    loading,
    error,
    createPlaylist,
    updateItems,
    deletePlaylist,
    refresh: fetchPlaylists,
  };
}
