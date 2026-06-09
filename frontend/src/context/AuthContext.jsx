import React, { createContext, useContext, useState, useEffect } from 'react';
const Ctx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem('vh_token'));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (token) {
      fetch('/api/auth/me', { headers: { Authorization:`Bearer ${token}` } })
        .then(r => r.ok ? r.json() : null)
        .then(u => { setUser(u); setLoading(false); })
        .catch(() => { logout(); setLoading(false); });
    } else setLoading(false);
  }, []);

  const login = async (email, senha) => {
    const r = await fetch('/api/auth/login', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ email, senha }) });
    if (!r.ok) { const e = await r.json(); throw new Error(e.error); }
    const { token: tk, user: u } = await r.json();
    localStorage.setItem('vh_token', tk);
    setToken(tk); setUser(u);
  };

  const logout = () => { localStorage.removeItem('vh_token'); setToken(null); setUser(null); };

  return <Ctx.Provider value={{ user, token, login, logout, isMaster: user?.role==='master', loading }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);

export function useApi() {
  const { token } = useContext(Ctx);
  const call = async (method, path, body, isFile=false) => {
    const headers = { Authorization: `Bearer ${token}` };
    if (!isFile) headers['Content-Type'] = 'application/json';
    const r = await fetch(`/api${path}`, { method, headers, body: isFile ? body : (body ? JSON.stringify(body) : undefined) });
    if (!r.ok) { const e = await r.json().catch(()=>({})); throw new Error(e.error||`HTTP ${r.status}`); }
    return r.json();
  };
  return {
    get:    (p)    => call('GET', p),
    post:   (p,b)  => call('POST', p, b),
    put:    (p,b)  => call('PUT', p, b),
    patch:  (p,b)  => call('PATCH', p, b),
    del:    (p)    => call('DELETE', p),
    upload: (p,fd) => call('POST', p, fd, true),
  };
}
