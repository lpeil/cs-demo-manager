import { httpClient } from './http-client';
import type { RendererMessageHandlers } from 'csdm/server/handlers/renderer-handlers-mapping';
import type { RendererClientMessageName } from 'csdm/server/renderer-client-message-name';
import type { RendererServerMessagePayload, RendererServerMessageName } from 'csdm/server/renderer-server-message-name';
import { ErrorCode } from 'csdm/common/error-code';

type Listener<MessageName extends RendererServerMessageName = RendererServerMessageName> = (
  payload: RendererServerMessagePayload[MessageName],
) => void;

type SendableMessagePayload<MessageName extends RendererClientMessageName> = Parameters<
  RendererMessageHandlers[MessageName]
>[0];

type SendableMessage<MessageName extends RendererClientMessageName = RendererClientMessageName> = {
  name: MessageName;
} & (SendableMessagePayload<MessageName> extends void
  ? object
  : {
      payload: SendableMessagePayload<MessageName>;
    });

/**
 * HTTP API Client que implementa a mesma interface do WebSocketClient
 * para facilitar a migração dos componentes
 */
/**
 * HTTP API Client que implementa a mesma interface do WebSocketClient
 * para facilitar a migração dos componentes
 *
 * Nota: Para eventos em tempo real (listeners), ainda é necessário usar WebSocket.
 * Este cliente usa HTTP apenas para requisições (send).
 */
export class HttpApiClient {
  private listeners = new Map<RendererServerMessageName, Listener[]>();
  private _isConnected: boolean = true; // HTTP está sempre "conectado"

  public constructor(onConnectionSuccess: () => void, onConnectionError: (event: CloseEvent) => void) {
    // HTTP está sempre disponível, então chamar success imediatamente
    onConnectionSuccess();
    // onConnectionError não é usado para HTTP, mas mantido para compatibilidade
    void onConnectionError;
  }

  public on = <MessageName extends RendererServerMessageName>(name: MessageName, listener: Listener<MessageName>) => {
    const listeners = this.listeners.get(name);
    if (listeners === undefined) {
      this.listeners.set(name, [listener as Listener]);
    } else {
      listeners.push(listener as Listener);
    }
    // Nota: Listeners HTTP não funcionam para eventos em tempo real
    // Para eventos, ainda é necessário usar WebSocket
    // Por enquanto, apenas armazenamos os listeners mas não os usamos
  };

  public off = <MessageName extends RendererServerMessageName>(name: MessageName, listener: Listener<MessageName>) => {
    const listeners = this.listeners.get(name);
    if (listeners === undefined) {
      return;
    }

    this.listeners.set(
      name,
      listeners.filter((cb: Listener) => cb !== listener),
    );
  };

  public removeAllEventListeners = (name: RendererServerMessageName): void => {
    this.listeners.set(name, []);
  };

  /**
   * Send a message to the HTTP API server.
   * Similar interface ao WebSocketClient para compatibilidade
   */
  public send = async <MessageName extends RendererClientMessageName>(
    message: SendableMessage<MessageName>,
  ): Promise<ReturnType<RendererMessageHandlers[MessageName]>> => {
    const { name } = message;
    const payload = 'payload' in message ? message.payload : undefined;

    try {
      // Chamar API REST
      const result = await httpClient.callHandler<ReturnType<RendererMessageHandlers[MessageName]>>(name, payload);

      if (result.success) {
        return result.data as ReturnType<RendererMessageHandlers[MessageName]>;
      } else {
        // Se for um ErrorCode, lançar como número
        const errorCode = typeof result.error === 'number' ? result.error : ErrorCode.UnknownError;
        throw errorCode;
      }
    } catch (error) {
      // Se já for um ErrorCode (número), relançar
      if (typeof error === 'number') {
        throw error;
      }
      // Caso contrário, lançar como ErrorCode.UnknownError
      throw ErrorCode.UnknownError;
    }
  };

  public get isConnected(): boolean {
    return this._isConnected;
  }
}
