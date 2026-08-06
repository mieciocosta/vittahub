import React, { useEffect, useState } from 'react';
import { Printer, CalendarPlus, Check } from 'lucide-react';
import { useApi } from '../context/AuthContext.jsx';

/* 💉 CARTEIRA VACINAL DO PACIENTE (0-18 meses e além)
   Mostra o esquema do bebê conforme o calendário cadastrado (espelho do
   Vittasys): o que já foi aplicado, o que está no ponto, o que atrasou e o
   que vem. Marca dose aplicada, imprime e agenda — do chat ou da Fidelidade. */

const ST = {
  aplicada:  ['✅ Aplicada',  '#16a34a', '#f0fdf4'],
  atrasada:  ['🔴 Atrasada',  '#dc2626', '#fef2f2'],
  no_ponto:  ['🟢 No ponto',  '#0E8C96', '#ecfeff'],
  chegando:  ['🔵 Chegando',  '#2563eb', '#eff6ff'],
  futura:    ['⚪ Futura',    '#94a3b8', 'transparent'],
};
const fmtBR = (d) => (d ? new Date(String(d).slice(0, 10) + 'T12:00:00').toLocaleDateString('pt-BR') : '—');

export default function CarteiraVacinal({ convId, onAgendar, compacto = false }) {
  const api = useApi();
  const [dados, setDados] = useState(null);
  const [salvando, setSalvando] = useState(null);

  const carregar = () => api.get(`/inbox/conversations/${convId}/carteira`).then(setDados).catch(() => setDados({ erro: true }));
  useEffect(() => { setDados(null); carregar(); }, [convId]); // eslint-disable-line

  const marcar = async (m) => {
    const aplicando = m.status !== 'aplicada';
    setSalvando(m.mes);
    try {
      await api.post(`/inbox/conversations/${convId}/carteira`, { marco_mes: m.mes, vacina: m.vacinas, aplicada: aplicando });
      await carregar();
    } catch (e) { window.alert('Erro: ' + e.message); }
    setSalvando(null);
  };

  const imprimir = () => {
    if (!dados) return;
    const w = window.open('', '_blank'); if (!w) return;
    const linhas = dados.marcos.map(m => `<tr${m.status === 'atrasada' ? ' class="atr"' : ''}>
      <td><b>${m.nome}</b></td><td>${m.vacinas}</td>
      <td style="text-align:center">${m.previsao ? fmtBR(m.previsao) : '—'}</td>
      <td style="text-align:center">${m.status === 'aplicada' ? '✔ ' + (m.aplicada_em ? fmtBR(m.aplicada_em) : 'aplicada') : ''}</td>
      <td style="text-align:center">${m.status === 'aplicada' ? '' : ST[m.status][0].replace(/^\S+\s/, '')}</td></tr>`).join('');
    w.document.write(`<html><head><title>Carteira vacinal — ${dados.paciente || ''}</title><meta charset="utf-8">
      <style>body{font-family:Arial,Helvetica,sans-serif;color:#111;padding:26px}
      h1{color:#0E8C96;margin:0 0 2px;font-size:21px}
      .sub{color:#555;font-size:13px;margin-bottom:16px}
      table{width:100%;border-collapse:collapse;font-size:12.5px}
      th,td{border:1px solid #ddd;padding:7px 9px;text-align:left;vertical-align:top}
      th{background:#f0fdf9;color:#0E8C96}
      tr.atr td{background:#fff5f5}
      .rod{margin-top:22px;font-size:11px;color:#777;border-top:1px solid #ddd;padding-top:10px}</style></head><body>
      <h1>Carteira Vacinal — Vittalis Saúde</h1>
      <div class="sub">
        <b>${dados.paciente || 'Paciente'}</b>${dados.nascimento ? ` · nascimento ${fmtBR(dados.nascimento)}` : ''}${dados.idade_meses != null ? ` · ${dados.idade_meses} meses` : ''}<br/>
        ${dados.responsavel ? `Responsável: ${dados.responsavel} · ` : ''}${dados.telefone ? `Contato: ${dados.telefone}` : ''}
      </div>
      <table><thead><tr><th>Idade</th><th>Vacinas</th><th style="width:92px">Previsto</th><th style="width:110px">Aplicada em</th><th style="width:90px">Situação</th></tr></thead>
      <tbody>${linhas}</tbody></table>
      <div class="rod">Esquema conforme o calendário da rede privada cadastrado no sistema · impresso em ${new Date().toLocaleString('pt-BR')}</div>
      <script>window.onload=()=>window.print()</script></body></html>`);
    w.document.close();
  };

  if (!dados) return <div style={{ fontSize: 12.5, color: 'var(--muted)', padding: '8px 0' }}>Carregando carteira vacinal…</div>;
  if (dados.erro) return <div style={{ fontSize: 12.5, color: 'var(--err)' }}>Não consegui carregar a carteira.</div>;

  return (
    <div>
      {/* Cabeçalho: bebê + resumo + ações */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
        <div style={{ flex: 1, minWidth: 170 }}>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: .6, textTransform: 'uppercase', color: 'var(--muted)' }}>💉 Carteira vacinal</div>
          <div style={{ fontSize: 14.5, fontWeight: 800, lineHeight: 1.3 }}>{dados.paciente || '— sem nome cadastrado —'}</div>
          <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>
            {dados.nascimento ? `${dados.idade_meses} meses · nasceu ${fmtBR(dados.nascimento)}` : '⚠️ cadastre a data de nascimento pra montar o esquema'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {dados.resumo.atrasadas > 0 && (
            <span style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: 20, padding: '3px 10px', fontSize: 11, fontWeight: 800 }}>
              {dados.resumo.atrasadas} atrasada{dados.resumo.atrasadas > 1 ? 's' : ''}
            </span>
          )}
          <span style={{ background: 'var(--bg2)', borderRadius: 20, padding: '3px 10px', fontSize: 11, fontWeight: 800, color: 'var(--txt2)' }}>
            {dados.resumo.aplicadas}/{dados.resumo.total} aplicadas
          </span>
          <button onClick={imprimir} title="Imprimir a carteira" className="btn btn-sm" style={{ gap: 5, fontWeight: 700, padding: '5px 10px' }}>
            <Printer size={12} /> Imprimir
          </button>
        </div>
      </div>

      {/* Linha do tempo do esquema */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: compacto ? 260 : 'none', overflowY: compacto ? 'auto' : 'visible' }}>
        {dados.marcos.map(m => {
          const st = ST[m.status] || ST.futura;
          return (
            <div key={m.mes} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 10px', borderRadius: 10, background: st[2], border: `1px solid ${m.status === 'futura' ? 'var(--border)' : st[1] + '44'}` }}>
              <button onClick={() => marcar(m)} disabled={salvando === m.mes} title={m.status === 'aplicada' ? 'Desmarcar' : 'Marcar como aplicada'}
                style={{ width: 22, height: 22, borderRadius: 7, flexShrink: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
                  border: `2px solid ${m.status === 'aplicada' ? '#16a34a' : 'var(--border)'}`,
                  background: m.status === 'aplicada' ? '#16a34a' : 'var(--card)', color: '#fff' }}>
                {m.status === 'aplicada' && <Check size={13} strokeWidth={3} />}
              </button>
              <div style={{ minWidth: 74 }}>
                <div style={{ fontSize: 12.5, fontWeight: 800, color: st[1] }}>{m.nome}</div>
                {m.previsao && <div style={{ fontSize: 10, color: 'var(--muted)' }}>{fmtBR(m.previsao)}</div>}
              </div>
              <div style={{ flex: 1, minWidth: 0, fontSize: 11.5, lineHeight: 1.45, color: m.status === 'aplicada' ? 'var(--muted)' : 'var(--txt)', textDecoration: m.status === 'aplicada' ? 'line-through' : 'none' }}>
                {m.vacinas}
              </div>
              {m.status === 'aplicada' ? (
                <span style={{ fontSize: 10.5, color: '#16a34a', fontWeight: 700, whiteSpace: 'nowrap' }}>{m.aplicada_em ? fmtBR(m.aplicada_em) : 'ok'}</span>
              ) : ['atrasada', 'no_ponto', 'chegando'].includes(m.status) && onAgendar ? (
                <button onClick={() => onAgendar(m)} title="Agendar esta etapa" className="btn btn-sm"
                  style={{ gap: 4, padding: '4px 9px', fontSize: 10.5, fontWeight: 800, background: st[1], color: '#fff', border: 'none', whiteSpace: 'nowrap' }}>
                  <CalendarPlus size={11} /> Agendar
                </button>
              ) : (
                <span style={{ fontSize: 10, fontWeight: 800, color: st[1], whiteSpace: 'nowrap' }}>{st[0]}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
