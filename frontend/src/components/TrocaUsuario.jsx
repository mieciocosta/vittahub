import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';

/* 👤 TROCA RÁPIDA DE USUÁRIO — barra fixa no topo (pedido do master).
   Escolhe o nome na lista e cai dentro da conta da pessoa, de qualquer tela.
   Antes isso morava num botão dentro do card da barra lateral: quem não sabia
   que existia, não achava. Aqui está sempre à vista.

   Só aparece pra quem tem a permissão (user.dono, decidida pelo servidor) ou
   pra quem já está impersonando — pra ter como voltar. */

export default function TrocaUsuario() {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [busy, setBusy] = useState(false);
  const impersonando = !!localStorage.getItem('vh_token_master');
  const podeTrocar = user?.dono === true || impersonando;

  // Sempre com o token do MASTER: já impersonando, o token atual é da atendente
  // e não teria permissão pra listar a equipe nem pra trocar de novo.
  const tokenMaster = () => localStorage.getItem('vh_token_master') || localStorage.getItem('vh_token') || '';

  useEffect(() => {
    if (!podeTrocar) return;
    const BASE = import.meta.env.VITE_API_URL || '';
    /* A lista vem do /impersonaveis, não do /usuarios: aquela é a lista de
       cadastro, do master. Esta já chega filtrada pelas regras da troca — a
       gestora comercial não vê nomes que o servidor recusaria depois, e as
       contas da direção não aparecem pra ninguém além do dono (01/09). */
    fetch(`${BASE}/api/auth/impersonaveis`, { headers: { Authorization: `Bearer ${tokenMaster()}` } })
      .then(r => r.json())
      .then(d => setUsers(Array.isArray(d) ? d.filter(u => u.ativo !== false) : []))
      .catch(() => setUsers([]));
  }, [podeTrocar]); // eslint-disable-line

  const trocar = async (id) => {
    if (!id || busy) return;
    setBusy(true);
    try {
      const BASE = import.meta.env.VITE_API_URL || '';
      const resp = await fetch(`${BASE}/api/auth/impersonar/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenMaster()}` },
      });
      const r = await resp.json();
      if (!resp.ok) throw new Error(r.error || 'Não foi possível trocar.');
      // Guarda o token do master ANTES de sobrescrever — é o caminho de volta.
      if (!localStorage.getItem('vh_token_master')) {
        localStorage.setItem('vh_token_master', localStorage.getItem('vh_token') || '');
      }
      localStorage.setItem('vh_token', r.token);
      window.location.href = '/';
    } catch (e) {
      window.alert('Erro: ' + e.message);
      setBusy(false);
    }
  };

  const voltar = () => {
    const mk = localStorage.getItem('vh_token_master');
    if (mk) { localStorage.setItem('vh_token', mk); localStorage.removeItem('vh_token_master'); window.location.href = '/'; }
  };

  if (!user || !podeTrocar) return null;

  return (
    <div style={{
      position: 'sticky', top: 0, zIndex: 95,
      display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
      padding: '7px 16px',
      background: impersonando ? '#7c3aed' : 'var(--card)',
      borderBottom: `1px solid ${impersonando ? '#6d28d9' : 'var(--border)'}`,
      color: impersonando ? '#fff' : 'var(--txt)',
    }}>
      <span style={{ fontSize: 12, fontWeight: 800, whiteSpace: 'nowrap' }}>
        {impersonando ? <>👤 Você está como <u>{user.nome}</u></> : '👤 Ver como:'}
      </span>

      <select value="" disabled={busy} onChange={e => trocar(e.target.value)}
        style={{
          padding: '5px 10px', borderRadius: 9, fontSize: 12.5, fontWeight: 700, cursor: busy ? 'wait' : 'pointer',
          border: `1.5px solid ${impersonando ? 'rgba(255,255,255,.45)' : 'var(--border)'}`,
          background: impersonando ? 'rgba(255,255,255,.16)' : 'var(--card)',
          color: impersonando ? '#fff' : 'var(--txt)', maxWidth: 260,
        }}>
        <option value="">{busy ? 'Entrando…' : 'Escolha uma pessoa…'}</option>
        {users.filter(u => u.id !== user.id).map(u => (
          <option key={u.id} value={u.id} style={{ color: 'var(--txt)', background: 'var(--card)' }}>
            {u.nome}{u.role === 'master' ? ' · master' : u.role === 'supervisor' ? ' · supervisora' : u.setor ? ` · ${u.setor}` : ''}
          </option>
        ))}
      </select>

      {impersonando && (
        <button onClick={voltar}
          style={{ background: '#fff', color: '#7c3aed', border: 'none', borderRadius: 8, padding: '5px 11px', fontWeight: 800, fontSize: 11.5, cursor: 'pointer' }}>
          ↩️ Voltar ao meu usuário
        </button>
      )}
    </div>
  );
}
