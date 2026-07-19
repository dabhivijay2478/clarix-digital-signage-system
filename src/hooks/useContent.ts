'use client';

import { useEffect, useState, useCallback } from 'react';
import { contentApi } from '../lib/tauri';
import type { ContentItem } from '../lib/types';

export function useContent() {
  const [items, setItems] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const fetchContent = useCallback(async () => {
    try {
      const data = await contentApi.getAll();
      setItems(data);
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchContent();
  }, [fetchContent]);

  const addItem = useCallback(
    async (
      name: string,
      contentType: string,
      filePath: string | undefined,
      url: string | undefined,
      durationSecs: number,
      tags?: string[]
    ) => {
      try {
        const item = await contentApi.add(
          name, contentType, filePath, url, durationSecs, tags
        );
        setItems((prev) => [item, ...prev]);
        return item;
      } catch (e) {
        setError(String(e));
        throw e;
      }
    },
    []
  );

  const deleteItem = useCallback(async (id: string) => {
    try {
      await contentApi.delete(id);
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch (e) {
      setError(String(e));
      throw e;
    }
  }, []);

  const updateItemDuration = useCallback(async (id: string, durationSecs: number) => {
    await contentApi.updateDuration(id, durationSecs);
    setItems((current) => current.map((item) => (
      item.id === id ? { ...item, duration_secs: durationSecs } : item
    )));
  }, []);

  const filtered = search
    ? items.filter(
        (i) =>
          i.name.toLowerCase().includes(search.toLowerCase()) ||
          i.tags.some((t) => t.toLowerCase().includes(search.toLowerCase()))
      )
    : items;

  return {
    items: filtered,
    allItems: items,
    loading,
    error,
    search,
    setSearch,
    addItem,
    updateItemDuration,
    deleteItem,
    refresh: fetchContent,
  };
}
