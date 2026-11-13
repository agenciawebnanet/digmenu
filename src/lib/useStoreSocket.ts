import { useEffect, useRef, useState } from 'react';

export interface StoreSocketEvent {
  type: string;
  payload?: any;
  ts?: string;
}

export function useStoreSocket(params: {
  storeId?: string;
  slug?: string;
  onEvent: (evt: StoreSocketEvent) => void;
}): { connected: boolean } {
  const { storeId, slug, onEvent } = params;
  const [connected, setConnected] = useState(false);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!storeId && !slug) return;
    let active = true;
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (!active) return;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const qs = storeId
        ? `storeId=${encodeURIComponent(storeId)}`
        : `slug=${encodeURIComponent(slug || '')}`;
      const url = `${protocol}//${window.location.host}/ws?${qs}`;

      try {
        ws = new WebSocket(url);
      } catch {
        setConnected(false);
        return;
      }

      ws.onopen = () => {
        if (active) setConnected(true);
      };

      ws.onmessage = (msg) => {
        try {
          const parsed = JSON.parse(String(msg.data)) as StoreSocketEvent;
          onEventRef.current(parsed);
        } catch {
          // ignore malformed messages
        }
      };

      ws.onclose = () => {
        if (!active) return;
        setConnected(false);
        reconnectTimer = setTimeout(connect, 3500);
      };

      ws.onerror = () => {
        ws?.close();
      };
    };

    connect();

    return () => {
      active = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, [storeId, slug]);

  return { connected };
}
