import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest';

const { getSession } = vi.hoisted(() => ({
  getSession: vi.fn(async () => ({
    data: { session: { access_token: 'test-access-token' } },
    error: null,
  })),
}));

vi.mock('./supabase', () => ({
  supabase: {
    auth: {
      getSession,
    },
  },
}));

import { apiFetch } from './api';

beforeEach(() => {
  getSession.mockReset().mockResolvedValue({
    data: { session: { access_token: 'test-access-token' } },
    error: null,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('apiFetch', () => {
  it('adds the Supabase access token as a Bearer token', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await apiFetch('/me');

    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const [url, init] = call;
    const apiUrl = import.meta.env.VITE_API_URL?.replace(/\/$/, '') ?? 'http://localhost:8000';
    expect(url).toBe(`${apiUrl}/me`);
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer test-access-token');
  });

  it('waits for Supabase session restoration before issuing the request', async () => {
    let resolveSession!: (result: Awaited<ReturnType<typeof getSession>>) => void;
    getSession.mockImplementationOnce(() => new Promise((resolve) => {
      resolveSession = resolve;
    }));
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const request = apiFetch('/me');
    await Promise.resolve();
    expect(fetchMock).not.toHaveBeenCalled();

    resolveSession({
      data: { session: { access_token: 'test-access-token' } },
      error: null,
    });
    await request;
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
