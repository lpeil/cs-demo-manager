import { WebSocketClient } from '../web-socket-client';
import { HttpApiClient } from './http-api-client';
import type { RendererMessageHandlers } from 'csdm/server/handlers/renderer-handlers-mapping';
import type { RendererClientMessageName } from 'csdm/server/renderer-client-message-name';
import type { RendererServerMessagePayload, RendererServerMessageName } from 'csdm/server/renderer-server-message-name';

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
 * Cliente híbrido que usa HTTP para requisições e WebSocket para eventos em tempo real
 */
export class HybridApiClient {
  private httpClient: HttpApiClient;
  private wsClient: WebSocketClient | null = null;

  public constructor(onConnectionSuccess: () => void, onConnectionError: (event: CloseEvent) => void) {
    // Inicializar HTTP client (sempre disponível)
    this.httpClient = new HttpApiClient(onConnectionSuccess, onConnectionError);

    // Inicializar WebSocket client para eventos em tempo real
    // Usar um callback que não faz nada se já conectou via HTTP
    this.wsClient = new WebSocketClient(
      () => {
        // WebSocket conectado - não fazer nada, HTTP já está pronto
      },
      () => {
        // WebSocket falhou - apenas logar, HTTP ainda funciona
        // Não fazer nada, HTTP já está disponível
      },
    );
  }

  /**
   * Registra listeners para eventos em tempo real (usa WebSocket)
   */
  public on = <MessageName extends RendererServerMessageName>(name: MessageName, listener: Listener<MessageName>) => {
    if (this.wsClient) {
      this.wsClient.on(name, listener);
    } else {
      logger.warn(`HybridApiClient: WebSocket not available, listener for ${name} will not work`);
    }
  };

  /**
   * Remove listeners (usa WebSocket)
   */
  public off = <MessageName extends RendererServerMessageName>(name: MessageName, listener: Listener<MessageName>) => {
    if (this.wsClient) {
      this.wsClient.off(name, listener);
    }
  };

  /**
   * Remove todos os listeners (usa WebSocket)
   */
  public removeAllEventListeners = (name: RendererServerMessageName): void => {
    if (this.wsClient) {
      this.wsClient.removeAllEventListeners(name);
    }
  };

  /**
   * Envia mensagem usando HTTP (mais eficiente para requisições)
   */
  public send = async <MessageName extends RendererClientMessageName>(
    message: SendableMessage<MessageName>,
  ): Promise<ReturnType<RendererMessageHandlers[MessageName]>> => {
    return this.httpClient.send(message);
  };

  public get isConnected(): boolean {
    // HTTP sempre está conectado, WebSocket pode não estar
    return this.httpClient.isConnected;
  }
}
