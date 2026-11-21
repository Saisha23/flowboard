import { supabase } from './supabase';

const LOCAL_API_URL = 'http://localhost:8000';

export function resolveApiBaseUrl(configuredUrl: string | undefined, isDevelopment: boolean): string | undefined {
  const trimmedUrl = configuredUrl?.trim().replace(/\/+$/, '');
  if (trimmedUrl) return trimmedUrl;
  return isDevelopment ? LOCAL_API_URL : undefined;
}

const apiUrl = resolveApiBaseUrl(import.meta.env.VITE_API_URL, import.meta.env.DEV);

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  if (!apiUrl) throw new Error('Backend API URL is not configured. Set VITE_API_URL for this deployment.');
  if (!supabase) throw new Error('Authentication is not configured.');
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const accessToken = data.session?.access_token;
  if (!accessToken) throw new Error('Sign in required.');

  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${accessToken}`);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

  return fetch(`${apiUrl}${path}`, { ...init, headers });
}
