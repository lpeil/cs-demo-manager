import React, { useState } from 'react';
import { Trans } from '@lingui/react/macro';
import { Button, ButtonVariant } from 'csdm/ui/components/buttons/button';
import { TextInput } from 'csdm/ui/components/inputs/text-input';
import { ErrorMessage } from 'csdm/ui/components/error-message';
import { httpClient } from '../api/http-client';
import { RendererClientMessageName } from 'csdm/server/renderer-client-message-name';

export function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(undefined);
    setIsLoading(true);

    try {
      const result = await httpClient.callHandler<{ sessionId: string; username: string }>(
        RendererClientMessageName.Login,
        {
          username,
          password,
        },
      );

      if (result.success) {
        // Salvar sessionId
        httpClient.setSessionId(result.data.sessionId);
        // Recarregar página para inicializar aplicação
        window.location.reload();
      } else {
        setError(result.message || 'Login failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="w-full max-w-md bg-white p-8 dark:bg-gray-800">
        <h1 className="text-center font-bold">
          <Trans>CS Demo Manager</Trans>
        </h1>
        <form onSubmit={handleLogin}>
          <div>
            <label htmlFor="username" className="block font-medium">
              <Trans>Username</Trans>
            </label>
            <TextInput
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="admin"
              autoFocus={true}
              isDisabled={isLoading}
            />
          </div>
          <div>
            <label htmlFor="password" className="block font-medium">
              <Trans>Password</Trans>
            </label>
            <TextInput
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              isDisabled={isLoading}
            />
          </div>
          {error && (
            <div>
              <ErrorMessage message={error} />
            </div>
          )}
          <Button type="submit" variant={ButtonVariant.Primary} isDisabled={isLoading}>
            {isLoading ? <Trans>Logging in...</Trans> : <Trans>Login</Trans>}
          </Button>
          <p className="mt-4 text-center">
            <Trans>Default credentials: admin / admin</Trans>
          </p>
        </form>
      </div>
    </div>
  );
}
