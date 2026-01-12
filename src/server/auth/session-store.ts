/**
 * Armazenamento simples de sessões em memória
 * Para autenticação simples (Opção B)
 */

export type Session = {
  sessionId: string;
  username: string;
  createdAt: number;
  expiresAt: number;
};

class SessionStore {
  private sessions = new Map<string, Session>();
  private readonly SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias

  /**
   * Cria uma nova sessão
   */
  createSession(username: string): Session {
    const sessionId = this.generateSessionId();
    const now = Date.now();
    const session: Session = {
      sessionId,
      username,
      createdAt: now,
      expiresAt: now + this.SESSION_DURATION_MS,
    };

    this.sessions.set(sessionId, session);
    this.cleanExpiredSessions(); // Limpar sessões expiradas periodicamente

    return session;
  }

  /**
   * Obtém uma sessão pelo ID
   */
  getSession(sessionId: string): Session | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return undefined;
    }

    // Verificar se expirou
    if (Date.now() > session.expiresAt) {
      this.sessions.delete(sessionId);
      return undefined;
    }

    return session;
  }

  /**
   * Remove uma sessão
   */
  deleteSession(sessionId: string): boolean {
    return this.sessions.delete(sessionId);
  }

  /**
   * Remove todas as sessões de um usuário
   */
  deleteUserSessions(username: string): void {
    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.username === username) {
        this.sessions.delete(sessionId);
      }
    }
  }

  /**
   * Limpa sessões expiradas
   */
  private cleanExpiredSessions(): void {
    const now = Date.now();
    for (const [sessionId, session] of this.sessions.entries()) {
      if (now > session.expiresAt) {
        this.sessions.delete(sessionId);
      }
    }
  }

  /**
   * Gera um ID de sessão único
   */
  private generateSessionId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}-${Math.random().toString(36).substring(2, 15)}`;
  }
}

export const sessionStore = new SessionStore();
