import { useAuth } from '../context/AuthContext.jsx';
import { apiFetch } from '../context/AuthContext.jsx';

export function useApi() {
  const { token } = useAuth();
  return {
    get: (path) => apiFetch(path, { method: 'GET' }, token),
    post: (path, body) => apiFetch(path, { method: 'POST', body: JSON.stringify(body) }, token),
    put: (path, body) => apiFetch(path, { method: 'PUT', body: JSON.stringify(body) }, token),
    patch: (path, body) => apiFetch(path, { method: 'PATCH', body: body !== undefined ? JSON.stringify(body) : undefined }, token),
    del: (path) => apiFetch(path, { method: 'DELETE' }, token),
    upload: (path, formData) => fetch(`/api${path}`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: formData }).then(r => r.json()),
  };
}
