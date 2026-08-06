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
    const linhas = dados.marcos.map(m => {
      const cls = m.status === 'aplicada' ? 'ok' : m.status === 'atrasada' ? 'atr' : m.status === 'no_ponto' ? 'pto' : '';
      const situacao = m.status === 'aplicada' ? 'Aplicada'
        : m.status === 'atrasada' ? 'EM ATRASO'
        : m.status === 'no_ponto' ? 'Fazer agora'
        : m.status === 'chegando' ? 'Proxima' : 'Futura';
      return `<tr class="${cls}">
        <td class="idade"><b>${m.nome}</b></td>
        <td>${m.vacinas}</td>
        <td class="c">${m.previsao ? fmtBR(m.previsao) : '-'}</td>
        <td class="c">${m.status === 'aplicada' ? (m.aplicada_em ? fmtBR(m.aplicada_em) : 'OK') : ''}</td>
        <td class="c lote"></td>
        <td class="c sit">${situacao}</td></tr>`;
    }).join('');
    const r = dados.resumo || {};
    w.document.write(`<html><head><title>Carteira vacinal - ${dados.paciente || ''}</title><meta charset="utf-8">
      <style>
        @page { size: A4; margin: 12mm }
        *{box-sizing:border-box}
        body{font-family:Arial,Helvetica,sans-serif;color:#14202b;margin:0}
        .topo{display:flex;align-items:center;gap:14px;border-bottom:3px solid #0E8C96;padding-bottom:10px;margin-bottom:14px}
        .topo img{height:52px}
        .topo h1{margin:0;font-size:19px;color:#0E8C96}
        .topo .t2{font-size:11.5px;color:#64748b;margin-top:2px}
        .ficha{display:flex;flex-wrap:wrap;border:1px solid #cbd5e1;border-radius:8px;overflow:hidden;margin-bottom:14px}
        .ficha div{flex:1;min-width:150px;padding:8px 12px;border-right:1px solid #e2e8f0}
        .ficha div:last-child{border-right:none}
        .ficha span{display:block;font-size:9px;letter-spacing:1px;text-transform:uppercase;color:#64748b;font-weight:bold}
        .ficha b{font-size:13px}
        .resumo{display:flex;gap:8px;margin-bottom:12px;font-size:11px}
        .resumo i{font-style:normal;padding:4px 11px;border-radius:20px;border:1px solid #cbd5e1;font-weight:bold}
        .resumo .a{background:#f0fdf4;border-color:#86efac;color:#15803d}
        .resumo .b{background:#fef2f2;border-color:#fca5a5;color:#b91c1c}
        table{width:100%;border-collapse:collapse;font-size:11.5px}
        th{background:#0E8C96;color:#fff;padding:7px 8px;text-align:left;font-size:10.5px}
        td{border:1px solid #dbe3ea;padding:7px 8px}
        td.c{text-align:center}
        td.idade{white-space:nowrap;background:#f8fafc}
        td.sit{font-weight:bold;font-size:10.5px}
        tr.ok td{color:#64748b} tr.ok td.sit{color:#15803d}
        tr.atr td{background:#fff5f5} tr.atr td.sit{color:#b91c1c}
        tr.pto td.sit{color:#0E8C96}
        .legenda{margin-top:12px;font-size:10px;color:#64748b}
        .rod{margin-top:16px;border-top:1px solid #dbe3ea;padding-top:9px;font-size:9.5px;color:#94a3b8;display:flex;justify-content:space-between}
      </style></head><body>
      <div class="topo">
        <img src="/logos/logo-h-color.png" onerror="this.style.display='none'"/>
        <div><h1>Carteira de Vacinacao</h1>
        <div class="t2">Vittalis Saude &middot; Pediatria e Vacinacao &middot; Sao Luis/MA</div></div>
      </div>
      <div class="ficha">
        <div><span>Paciente</span><b>${dados.paciente || '-'}</b></div>
        <div><span>Nascimento</span><b>${dados.nascimento ? fmtBR(dados.nascimento) : '-'}</b></div>
        <div><span>Idade atual</span><b>${dados.idade_meses != null ? `${dados.idade_meses} meses` : '-'}</b></div>
        <div><span>Responsavel</span><b>${dados.responsavel || '-'}</b></div>
        <div><span>Contato</span><b>${dados.telefone || '-'}</b></div>
      </div>
      <div class="resumo">
        <i class="a">${r.aplicadas || 0} de ${r.total || 0} etapas aplicadas</i>
        ${r.atrasadas ? `<i class="b">${r.atrasadas} em atraso</i>` : ''}
      </div>
      <table><thead><tr>
        <th style="width:78px">IDADE</th><th>VACINAS</th>
        <th style="width:78px" class="c">PREVISTO</th><th style="width:82px" class="c">APLICADA</th>
        <th style="width:78px" class="c">LOTE</th><th style="width:82px" class="c">SITUACAO</th>
      </tr></thead><tbody>${linhas}</tbody></table>
      <div class="legenda">Preencha o campo LOTE no ato da aplicacao. Esquema conforme o calendario da rede privada cadastrado no sistema.</div>
      <div class="rod"><span>Vittalis Saude - cuidando de quem voce mais ama</span><span>Emitida em ${new Date().toLocaleString('pt-BR')}</span></div>
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
