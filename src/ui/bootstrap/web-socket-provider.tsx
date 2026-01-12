import type { ReactNode } from 'react';
import React, { createContext, useState, useMemo } from 'react';
import { Trans } from '@lingui/react/macro';
import { Status } from 'csdm/common/types/status';
import { HybridApiClient } from '../api/hybrid-api-client';
import { Loading } from './loading';
import { LoadingError } from './loading-error';
import { useRegisterWebSocketListeners } from './use-register-web-socket-listeners';
import type { RendererServerMessageName, RendererServerMessagePayload } from 'csdm/server/renderer-server-message-name';
import type { RendererClientMessageName } from 'csdm/server/renderer-client-message-name';
import type { SendableMessage } from 'csdm/ui/web-socket-client';

// Tipo comum para compatibilidade
export type ApiClient = {
  on: <MessageName extends RendererServerMessageName>(
    name: MessageName,
    listener: (payload: RendererServerMessagePayload[MessageName]) => void,
  ) => void;
  off: <MessageName extends RendererServerMessageName>(
    name: MessageName,
    listener: (payload: RendererServerMessagePayload[MessageName]) => void,
  ) => void;
  removeAllEventListeners: (name: RendererServerMessageName) => void;
  send: <MessageName extends RendererClientMessageName>(message: SendableMessage<MessageName>) => Promise<unknown>;
  isConnected: boolean;
};

export const WebSocketContext = createContext<ApiClient | null>(null);

type Props = {
  children: ReactNode;
};

export function WebSocketProvider({ children }: Props) {
  const [status, setStatus] = useState<Status>(Status.Loading);
  const [error] = useState('');

  const client = useMemo(() => {
    const onConnectionSuccess = () => {
      setStatus(Status.Success);
    };

    const onConnectionError = () => {
      // HTTP sempre funciona, então apenas logar o erro do WebSocket
      // Não definir como erro, pois HTTP ainda funciona
      setStatus(Status.Success); // HTTP está disponível
    };

    return new HybridApiClient(onConnectionSuccess, onConnectionError);
  }, []);

  // Sempre chamar o hook (regras do React)
  useRegisterWebSocketListeners(client);

  if (status === Status.Loading) {
    return <Loading />;
  }

  if (status === Status.Error) {
    return <LoadingError title={<Trans>An error occurred connecting to the WebSocket server.</Trans>} error={error} />;
  }

  return <WebSocketContext.Provider value={client}>{children}</WebSocketContext.Provider>;
}
