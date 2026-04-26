import { authStorage } from './storage';
import { useAuthStore } from '../stores/authStore';

const BASE_URL = process.env['EXPO_PUBLIC_API_URL'] ?? 'http://localhost:3000';

// Deduplicate concurrent refresh attempts — only one in-flight at a time.
let _refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (_refreshPromise) return _refreshPromise;

  _refreshPromise = (async () => {
    try {
      const refreshToken = authStorage.getString('refreshToken');
      if (!refreshToken) return null;

      const res = await fetch(`${BASE_URL}/v1/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });

      if (!res.ok) return null;

      const { accessToken, refreshToken: newRefresh } = (await res.json()) as {
        accessToken: string;
        refreshToken: string;
      };

      // Persist to storage AND update Zustand in-memory state
      useAuthStore.getState().setTokens(accessToken, newRefresh);
      return accessToken;
    } catch {
      return null;
    } finally {
      _refreshPromise = null;
    }
  })();

  return _refreshPromise;
}

async function doFetch(
  method: string,
  path: string,
  body: unknown,
  isMultipart: boolean,
  token: string | undefined,
  timeoutMs: number,
): Promise<Response> {
  const headers: Record<string, string> = {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(!isMultipart && body !== undefined ? { 'Content-Type': 'application/json' } : {}),
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      signal: controller.signal,
      body: isMultipart
        ? (body as FormData)
        : body !== undefined
        ? JSON.stringify(body)
        : undefined,
    });
  } catch (err: unknown) {
    const e = err as { name?: string };
    if (e.name === 'AbortError') throw new Error(`Request timed out: ${method} ${path}`);
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  isMultipart = false,
  timeoutMs = 30_000,
): Promise<T> {
  let token = authStorage.getString('accessToken');

  let response = await doFetch(method, path, body, isMultipart, token, timeoutMs);

  // On 401, try once to refresh the access token then retry
  if (response.status === 401) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      token = newToken;
      response = await doFetch(method, path, body, isMultipart, token, timeoutMs);
    }
  }

  if (response.status === 401) {
    // Refresh also failed — session is dead
    useAuthStore.getState().logout().catch(() => undefined);
    throw new Error('Session expired. Please sign in again.');
  }

  if (!response.ok) {
    const err = (await response
      .json()
      .catch(() => ({ message: response.statusText }))) as {
      message?: string;
      error?: string;
    };
    throw new Error(err.message ?? err.error ?? response.statusText);
  }

  return response.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  // Default 90 s timeout for multipart uploads (audio files can be large)
  postForm: <T>(path: string, form: FormData, timeoutMs = 90_000) =>
    request<T>('POST', path, form, true, timeoutMs),
};
