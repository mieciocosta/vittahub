import React, { createContext, useContext, useState, useEffect } from 'react';
import { api, setToken, clearToken, getToken } from '../hooks/api.js';

const Ctx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const tk = getToken();
    if (tk) {
      api.get('/auth/me')
        .then(u => { setUser(u); setLoading(false); })
        .catch(() => { clearToken(); setLoading(false); });
    } else { setLoading(false); }
  }, []);

  const login = async (loginId, senha) => {
    const { token, user: u } = await api.post('/auth/login', { login: loginId, senha });
    setToken(token);
    setUser(u);
  };

  const logout = () => { clearToken(); setUser(null); };

  return (
    <Ctx.Provider value={{ user, setUser, login, logout, isMaster: user?.role === 'master', loading }}>
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);

export function useApi() {
  return {
    get:    (path)        => api.get(path),
    post:   (path, body)  => api.post(path, body),
    put:    (path, body)  => api.put(path, body),
    patch:  (path, body)  => api.patch(path, body),
    del:    (path)        => api.delete(path),
    upload: (path, fd)    => api.upload(path, fd),
  };
}
