// API base — uses env var in production, proxy in dev
const BASE = import.meta.env.VITE_API_URL || '';

let _token = localStorage.getItem('vh_token') || '';

export function setToken(t) { _token = t; localStorage.setItem('vh_token', t); }
export function clearToken() { _token = ''; localStorage.removeItem('vh_token'); }
export function getToken() { return _token; }

async function request(method, path, body, isFile = false) {
  const headers = {};
  if (_token) headers['Authorization'] = `Bearer ${_token}`;
  if (!isFile) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers,
    body: isFile ? body : (body ? JSON.stringify(body) : undefined),
  });

  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const e = await res.json(); msg = e.error || msg; } catch {}
    throw new Error(msg);
  }
  return res.json();
}

export const api = {
  get:    (path)        => request('GET', path),
  post:   (path, body)  => request('POST', path, body),
  put:    (path, body)  => request('PUT', path, body),
  patch:  (path, body)  => request('PATCH', path, body),
  delete: (path)        => request('DELETE', path),
  upload: (path, fd)    => request('POST', path, fd, true),
};
