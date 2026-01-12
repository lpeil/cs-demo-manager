import { useRegisterAnalysesListeners } from './web-socket-listeners/use-register-analyses-listeners';
import { useRegisterBanListeners } from './web-socket-listeners/use-register-ban-listeners';
import { useRegisterDownloadsListeners } from './web-socket-listeners/use-register-downloads-listeners';
import type { ApiClient } from './web-socket-provider';
import { useRegisterSettingsListeners } from './web-socket-listeners/use-register-settings-listeners';
import { useRegisterVideoQueueListeners } from './web-socket-listeners/use-register-video-queue-listeners';
import { useRegisterCounterStrikeListeners } from './web-socket-listeners/use-register-counter-strike-listeners';

export function useRegisterWebSocketListeners(client: ApiClient) {
  useRegisterAnalysesListeners(client as unknown as import('csdm/ui/web-socket-client').WebSocketClient);
  useRegisterBanListeners(client as unknown as import('csdm/ui/web-socket-client').WebSocketClient);
  useRegisterDownloadsListeners(client as unknown as import('csdm/ui/web-socket-client').WebSocketClient);
  useRegisterSettingsListeners(client as unknown as import('csdm/ui/web-socket-client').WebSocketClient);
  useRegisterVideoQueueListeners(client as unknown as import('csdm/ui/web-socket-client').WebSocketClient);
  useRegisterCounterStrikeListeners(client as unknown as import('csdm/ui/web-socket-client').WebSocketClient);
}
