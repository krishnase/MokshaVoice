import { MMKV } from 'react-native-mmkv';

const storage = new MMKV({ id: 'auth' });

const BASE_URL = process.env['EXPO_PUBLIC_API_URL'] ?? 'http://localhost:3000';

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  isMultipart = false,
): Promise<T> {
  const token = storage.getString('accessToken');
  const headers: Record<string, string> = {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(!isMultipart ? { 'Content-Type': 'application/json' } : {}),
  };

  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: isMultipart
      ? (body as FormData)
      : body !== undefined
      ? JSON.stringify(body)
      : undefined,
  });

  if (!response.ok) {
    const err = (await response.json().catch(() => ({ message: response.statusText }))) as {
      message: string;
    };
    const error = Object.assign(new Error(err.message), { statusCode: response.status });
    throw error;
  }

  return response.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  postForm: <T>(path: string, form: FormData) => request<T>('POST', path, form, true),
};
