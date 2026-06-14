'use client';

import { useEffect, useState } from 'react';
import { onPeerDiscovered, onPeerLost } from '../lib/tauri';
import type { PeerScreen } from '../lib/types';

export function usePeers() {
  const [peers, setPeers] = useState<PeerScreen[]>([]);

  useEffect(() => {
    const unlistenDiscovered = onPeerDiscovered((peer: PeerScreen) => {
      setPeers((prev) => {
        const exists = prev.find((p) => p.id === peer.id);
        if (exists) return prev;
        return [...prev, peer];
      });
    });

    const unlistenLost = onPeerLost((fullname: string) => {
      setPeers((prev) => prev.filter((p) => p.id !== fullname));
    });

    return () => {
      unlistenDiscovered();
      unlistenLost();
    };
  }, []);

  return { peers, peerCount: peers.length };
}
