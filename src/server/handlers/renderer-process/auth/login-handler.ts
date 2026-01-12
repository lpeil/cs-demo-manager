/**
 * Handler para login
 * Autenticação simples (Opção B)
 */

import { userStore } from 'csdm/server/auth/user-store';
import { sessionStore } from 'csdm/server/auth/session-store';

export type LoginPayload = {
  username: string;
  password: string;
};

export type LoginResponse = {
  success: true;
  sessionId: string;
  username: string;
};

export async function loginHandler(payload: LoginPayload): Promise<LoginResponse> {
  const { username, password } = payload;

  // Validar entrada
  if (!username || !password) {
    throw new Error('Username and password are required');
  }

  // Verificar credenciais
  const isValid = userStore.verifyCredentials(username, password);
  if (!isValid) {
    throw new Error('Invalid username or password');
  }

  // Criar sessão
  const session = sessionStore.createSession(username);

  return {
    success: true,
    sessionId: session.sessionId,
    username: session.username,
  };
}
