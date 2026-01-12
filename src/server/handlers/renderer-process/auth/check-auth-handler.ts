/**
 * Handler para verificar autenticação
 * Autenticação simples (Opção B)
 */

import { sessionStore } from 'csdm/server/auth/session-store';

export type CheckAuthPayload = {
  sessionId: string;
};

export type CheckAuthResponse = {
  authenticated: boolean;
  username?: string;
};

export async function checkAuthHandler(payload: CheckAuthPayload): Promise<CheckAuthResponse> {
  const { sessionId } = payload;

  if (!sessionId) {
    return { authenticated: false };
  }

  const session = sessionStore.getSession(sessionId);
  if (!session) {
    return { authenticated: false };
  }

  return {
    authenticated: true,
    username: session.username,
  };
}
