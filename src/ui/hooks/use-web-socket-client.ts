import { useContext } from 'react';
import { WebSocketContext, type ApiClient } from '../bootstrap/web-socket-provider';

export function useWebSocketClient(): ApiClient {
  const client = useContext(WebSocketContext);

  if (client === null) {
    throw new Error('API client not initialized');
  }

  return client;
}
