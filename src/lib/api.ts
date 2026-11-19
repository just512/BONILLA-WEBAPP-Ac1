const CART_SESSION_KEY = 'jb_cart_session_token';

let inMemoryAuthToken: string | null = null;

export function setInMemoryAuthToken(token: string | null) {
  inMemoryAuthToken = token;
}

export function getInMemoryAuthToken(): string | null {
  return inMemoryAuthToken;
}

export function getCartSessionId(): string {
  let token = localStorage.getItem(CART_SESSION_KEY);
  if (!token) {
    token = `cart-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
    localStorage.setItem(CART_SESSION_KEY, token);
  }
  return token;
}

export function formatMoney(cents: number, symbol = '$'): string {
  const safe = Number.isFinite(cents) ? cents : 0;
  return `${symbol}${(safe / 100).toFixed(2)}`;
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-cart-session': getCartSessionId(),
    ...(options.headers as Record<string, string> | undefined),
  };

  if (inMemoryAuthToken) {
    headers.Authorization = `Bearer ${inMemoryAuthToken}`;
  }

  const res = await fetch(path, {
    ...options,
    headers,
    credentials: 'include',
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `Request failed (${res.status})`);
  }
  return data as T;
}
