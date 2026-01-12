/**
 * Handler para logout
 * Autenticação simples (Opção B)
 */

import { sessionStore } from 'csdm/server/auth/session-store';

export type LogoutPayload = {
  sessionId: string;
};

export async function logoutHandler(payload: LogoutPayload): Promise<void> {
  const { sessionId } = payload;

  if (!sessionId) {
    throw new Error('Session ID is required');
  }

  sessionStore.deleteSession(sessionId);
}
