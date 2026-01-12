import React, { useEffect, useState, type ReactNode } from 'react';
import { LoginPage } from './login-page';
import { httpClient } from '../api/http-client';
import { RendererClientMessageName } from 'csdm/server/renderer-client-message-name';
import { Loading } from '../bootstrap/loading';

type Props = {
  children: ReactNode;
};

export function AuthProvider({ children }: Props) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      const sessionId = httpClient.getSessionId();
      if (!sessionId) {
        setIsAuthenticated(false);
        setIsChecking(false);
        return;
      }

      try {
        const result = await httpClient.callHandler<{ authenticated: boolean; username?: string }>(
          RendererClientMessageName.CheckAuth,
          { sessionId },
        );

        if (result.success && result.data.authenticated) {
          setIsAuthenticated(true);
        } else {
          // Sessão inválida, limpar
          httpClient.setSessionId(null);
          setIsAuthenticated(false);
        }
      } catch {
        // Erro ao verificar, assumir não autenticado
        httpClient.setSessionId(null);
        setIsAuthenticated(false);
      } finally {
        setIsChecking(false);
      }
    };

    checkAuth();
  }, []);

  if (isChecking) {
    return <Loading />;
  }

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  return <>{children}</>;
}
