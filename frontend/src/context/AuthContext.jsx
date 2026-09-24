import React, { createContext, useContext, useState, useEffect } from 'react';
import { api, setToken, clearToken, getToken } from '../hooks/api.js';

const Ctx = createContext(null);

/* 💛 QUEM É FIDELIDADE É VACINAS, também na tela (cobrança do master, 24/09:
   "o usuário de Mayara ainda está só consultas e ela agora é vacinas"). O
   servidor já corrige no login; esta é a rede de segurança do lado de cá,
   pra sessão antiga ou servidor atrasado: Poliana e Mayara/Maiara (marca ou
   nome) entram na tela com setor vacinas e só esse setor. */
const normalizarUsuario = (u) => {
  if (!u || u.role === 'master') return u;
  const n = String(u.nome || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const fidelidade = u.so_fidelidade === true || /(^|[^a-z])(poliana|ma[iy]ara)/.test(n);
  return fidelidade ? { ...u, so_fidelidade: true, setor: 'vacinas', setores: ['vacinas'] } : u;
};

export function AuthProvider({ children }) {
  const [userBruto, setUserBruto] = useState(null);
  const user = normalizarUsuario(userBruto);
  const setUser = (u) => setUserBruto(typeof u === 'function' ? (prev) => u(normalizarUsuario(prev)) : u);
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

  const logout = () => {
    clearToken(); setUser(null);
    // Sair limpa TAMBÉM o token de master guardado pelo "Entrar como" — sem
    // isso, num aparelho compartilhado o botão (e o poder) ficavam pra trás.
    try { localStorage.removeItem('vh_token_master'); } catch { /* ok */ }
  };

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
    blob:   (path)        => api.blob(path),
    post:   (path, body)  => api.post(path, body),
    put:    (path, body)  => api.put(path, body),
    patch:  (path, body)  => api.patch(path, body),
    del:    (path)        => api.delete(path),
    delete: (path)        => api.delete(path),
    upload: (path, fd)    => api.upload(path, fd),
  };
}
