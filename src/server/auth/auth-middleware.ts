/**
 * Middleware de autenticação
 * Para autenticação simples (Opção B)
 */

import type { Request, Response, NextFunction } from 'express';
import { sessionStore } from './session-store';

/**
 * Estende o tipo Request do Express para incluir informações de sessão
 */
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      session?: {
        sessionId: string;
        username: string;
      };
    }
  }
}

/**
 * Middleware para verificar autenticação
 * Retorna 401 se não autenticado
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const sessionId = req.headers['x-session-id'] as string | undefined;

  if (!sessionId) {
    res.status(401).json({
      success: false,
      error: 'UNAUTHORIZED',
      message: 'Authentication required',
    });
    return;
  }

  const session = sessionStore.getSession(sessionId);
  if (!session) {
    res.status(401).json({
      success: false,
      error: 'UNAUTHORIZED',
      message: 'Invalid or expired session',
    });
    return;
  }

  // Adicionar informações de sessão à requisição
  req.session = {
    sessionId: session.sessionId,
    username: session.username,
  };

  next();
}

/**
 * Middleware opcional para verificar autenticação
 * Não retorna erro, apenas adiciona sessão se existir
 */
export function optionalAuth(req: Request, res: Response, next: NextFunction): void {
  const sessionId = req.headers['x-session-id'] as string | undefined;

  if (sessionId) {
    const session = sessionStore.getSession(sessionId);
    if (session) {
      req.session = {
        sessionId: session.sessionId,
        username: session.username,
      };
    }
  }

  next();
}
