import React, { useEffect, useState } from 'react';
import RotaAtiva from '../components/RotaAtiva.jsx';
import { rotaApi } from '../hooks/rota.js';

/* 🛰 PÁGINA DO MOTORISTA — sem login, pelo link que a equipe manda no
   WhatsApp (/rota/<token>). O motorista não tem conta no CRM e não precisa:
   o token só abre ESTA rota, com as visitas do dia, e some quando ela acaba.
   Ordem do master (24/09/2026): iniciar a rota é obrigatório; o trajeto, as
   paradas e a hora de volta ficam registrados pro master ver. */

export default function RotaMotorista() {
  const token = (window.location.pathname.match(/^\/rota\/([a-f0-9]{32})/) || [])[1] || '';
  const [estado, setEstado] = useState({ carregando: true });

  useEffect(() => {
    if (!token) { setEstado({ erro: 'Link inválido. Peça o link da rota pra equipe.' }); return; }
    rotaApi.publico(token).then(d => setEstado({ rota: d.rota })).catch(e => setEstado({ erro: e.message }));
  }, [token]);

  const dataRotulo = estado.rota?.data ? new Date(estado.rota.data + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }) : '';

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(160deg,#f7fbfc,#e8f4f6)', fontFamily: 'Inter, system-ui, sans-serif', color: '#14202b' }}>
      <div style={{ maxWidth: 560, margin: '0 auto', padding: '18px 12px 40px' }}>
        <div style={{ textAlign: 'center', marginBottom: 12 }}>
          <img src="/logos/logo-v-color.png" alt="Vittalis Saúde" style={{ height: 64 }} onError={e => { e.currentTarget.style.display = 'none'; }} />
          <div style={{ fontSize: 18, fontWeight: 900, color: '#0e7490', marginTop: 4 }}>🚚 Rota de visitas</div>
          {dataRotulo && <div style={{ fontSize: 12.5, color: '#64748b', textTransform: 'capitalize' }}>{dataRotulo}</div>}
        </div>
        <div style={{ background: '#fff', borderRadius: 16, boxShadow: '0 8px 30px rgba(14,116,144,.10)', overflow: 'hidden', border: '1px solid #dbe3ea' }}>
          {estado.carregando && <div style={{ padding: 24, textAlign: 'center', color: '#64748b' }}>Carregando a rota…</div>}
          {estado.erro && <div style={{ padding: 24, color: '#b91c1c', fontWeight: 700 }}>⚠️ {estado.erro}</div>}
          {estado.rota && <RotaAtiva token={token} rotaInicial={estado.rota} modo="motorista" />}
        </div>
        <div style={{ fontSize: 11.5, color: '#64748b', textAlign: 'center', marginTop: 14, lineHeight: 1.5 }}>
          Mantenha esta página aberta durante a rota. Ela usa o GPS do celular só enquanto está aberta e não guarda nada depois que a rota termina.
          <br />Vittalis Saúde · São Luís/MA
        </div>
      </div>
    </div>
  );
}
