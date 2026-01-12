import { ErrorCode } from 'csdm/common/error-code';

export type ApiResponse<T = unknown> = {
  success: true;
  data: T;
};

export type ApiErrorResponse = {
  success: false;
  error: ErrorCode | string;
  message?: string;
};

export type ApiResult<T = unknown> = ApiResponse<T> | ApiErrorResponse;

class HttpClient {
  private baseUrl: string;
  private sessionId: string | null = null;

  constructor(baseUrl: string = '') {
    this.baseUrl = baseUrl;
    // Tentar carregar sessionId do localStorage
    if (typeof window !== 'undefined') {
      this.sessionId = localStorage.getItem('csdm-session-id');
    }
  }

  /**
   * Define o sessionId para autenticação
   */
  setSessionId(sessionId: string | null): void {
    this.sessionId = sessionId;
    if (typeof window !== 'undefined') {
      if (sessionId) {
        localStorage.setItem('csdm-session-id', sessionId);
      } else {
        localStorage.removeItem('csdm-session-id');
      }
    }
  }

  /**
   * Obtém o sessionId atual
   */
  getSessionId(): string | null {
    return this.sessionId;
  }

  private async request<T = unknown>(endpoint: string, options: RequestInit = {}): Promise<ApiResult<T>> {
    try {
      const url = `${this.baseUrl}${endpoint}`;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(options.headers as Record<string, string>),
      };

      // Adicionar sessionId se disponível
      if (this.sessionId) {
        headers['X-Session-Id'] = this.sessionId;
      }

      const response = await fetch(url, {
        ...options,
        headers,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return {
          success: false,
          error: errorData.error || ErrorCode.UnknownError,
          message: errorData.message || `HTTP ${response.status}: ${response.statusText}`,
        };
      }

      const data = await response.json();
      return {
        success: true,
        data: data.data !== undefined ? data.data : data,
      };
    } catch (error) {
      return {
        success: false,
        error: ErrorCode.UnknownError,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async get<T = unknown>(endpoint: string, params?: Record<string, unknown>): Promise<ApiResult<T>> {
    let url = endpoint;
    if (params && Object.keys(params).length > 0) {
      const searchParams = new URLSearchParams();
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) {
          searchParams.append(key, String(value));
        }
      }
      url += `?${searchParams.toString()}`;
    }
    return this.request<T>(url, { method: 'GET' });
  }

  async post<T = unknown>(endpoint: string, body?: unknown): Promise<ApiResult<T>> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  async put<T = unknown>(endpoint: string, body?: unknown): Promise<ApiResult<T>> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  async delete<T = unknown>(endpoint: string, params?: Record<string, unknown>): Promise<ApiResult<T>> {
    let url = endpoint;
    if (params && Object.keys(params).length > 0) {
      const searchParams = new URLSearchParams();
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) {
          searchParams.append(key, String(value));
        }
      }
      url += `?${searchParams.toString()}`;
    }
    return this.request<T>(url, { method: 'DELETE' });
  }

  // Helper para chamadas de API que mapeiam handlers do WebSocket
  async callHandler<T = unknown>(messageName: string, payload?: unknown): Promise<ApiResult<T>> {
    return this.post<T>(`/api/${messageName}`, payload);
  }
}

// Criar instância singleton
// @ts-ignore - Vite define import.meta.env
const API_BASE_URL = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL) || '';
export const httpClient = new HttpClient(API_BASE_URL);
