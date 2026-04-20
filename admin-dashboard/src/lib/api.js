const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

function tokenHeader() {
  if (typeof window === 'undefined') return {};
  const t = window.localStorage.getItem('skhata_token');
  return t ? { Authorization: `Bearer ${t}` } : {};
}

export async function apiFetch(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...tokenHeader(),
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}
