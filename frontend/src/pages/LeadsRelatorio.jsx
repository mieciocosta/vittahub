import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, FileText, RefreshCw, MessageSquare } from 'lucide-react';
import { useApi } from '../context/AuthContext.jsx';
import { fmt } from '../hooks/utils.js';

/* 📊 CARTEIRA DE LEADS — pedido do José, repassado pelo master (27/08), e
   refinado no mesmo dia ("estava confuso"). A tela agora conta UMA história, de
   cima pra baixo, sem caixa concorrendo com caixa:
     1. que período eu estou olhando   → barra de período
     2. quantos leads chegaram por mês → faixa clicável
     3. o que aconteceu com eles       → 4 números e o funil
     4. onde afinar                    → dia da semana, dia, origem/setor/pessoa
     5. quem são                       → a lista, com a PROVA do fechamento
   LEAD = cliente novo no primeiro contato. FECHOU = venda no caixa OU o próprio
   cliente confirmando o pagamento na conversa (o master pediu pra ler as
   mensagens: muita venda fecha no WhatsApp antes de virar lançamento).
   Só o master enxerga. */

const DOW = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const n0 = (v) => new Intl.NumberFormat('pt-BR').format(v || 0);
const pct = (v) => `${String(v ?? 0).replace('.', ',')}%`;
const tempoTxt = (min) => {
  if (min == null) return '—';
  if (min < 60) return `${min} min`;
  if (min < 1440) return `${Math.round(min / 60)} h`;
  return `${Math.round(min / 1440)} d`;
};
const hojeSLZ = () => new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
const primeiroDoMes = (v = 0) => {
  const d = new Date(Date.now() - 3 * 3600 * 1000);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - v, 1)).toISOString().slice(0, 10);
};
const ultimoDoMes = (v = 0) => {
  const d = new Date(Date.now() - 3 * 3600 * 1000);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - v + 1, 0)).toISOString().slice(0, 10);
};

const Caixa = ({ children, style }) => (
  <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, boxShadow: 'var(--s1)', ...style }}>{children}</div>
);

export default function LeadsRelatorio() {
  const api = useApi();
  const nav = useNavigate();
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(true);

  // Período: atalho (N meses) ou datas escolhidas à mão
  const [meses, setMeses] = useState(6);
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');
  // Recorte dentro do período
  const [mes, setMes] = useState('');
  const [dia, setDia] = useState('');
  const [dow, setDow] = useState(null);
  const [setor, setSetor] = useState('');
  const [origem, setOrigem] = useState('');
  const [entrada, setEntrada] = useState(true);
  const [corte, setCorte] = useState('origem');
  const [busca, setBusca] = useState('');

  const limparRecorte = () => { setMes(''); setDia(''); setDow(null); setSetor(''); setOrigem(''); };

  const carregar = () => {
    setCarregando(true); setErro('');
    const q = new URLSearchParams({ entrada: entrada ? '1' : '0' });
    if (de) { q.set('de', de); if (ate) q.set('ate', ate); } else q.set('meses', meses);
    if (mes) q.set('mes', mes);
    if (dia) q.set('dia', dia);
    if (dow !== null) q.set('dow', dow);
    if (setor) q.set('setor', setor);
    if (origem) q.set('origem', origem);
    api.get(`/reports/leads-novos?${q}`)
      .then(d => { setDados(d); setCarregando(false); })
      .catch(e => { setErro(e.message); setCarregando(false); });
  };
  useEffect(carregar, [meses, de, ate, mes, dia, dow, setor, origem, entrada]); // eslint-disable-line

  const t = dados?.totais;
  const lista = useMemo(() => {
    const l = dados?.lista || [];
    const b = busca.trim().toLowerCase();
    return b ? l.filter(i => `${i.nome} ${i.telefone || ''}`.toLowerCase().includes(b)) : l;
  }, [dados, busca]);

  const cortes = { origem: dados?.origens || [], setor: dados?.setores || [], equipe: dados?.equipe || [] };
  const linhas = cortes[corte] || [];

  const periodoTxt = () => {
    if (!dados) return '';
    const j = dados.janela || {};
    if (dia) return `dia ${fmt.date(dia)}`;
    const mesLabel = mes ? (dados.meses || []).find(m => m.chave === mes)?.label : '';
    const base = j.manual || de ? `${fmt.date(j.de)} a ${fmt.date(j.ate)}` : `últimos ${j.meses} meses`;
    return [mes ? `mês ${mesLabel}` : base, dow !== null ? `só ${DOW[dow]}` : '', setor, origem].filter(Boolean).join(' · ');
  };

  // ── Exportações ────────────────────────────────────────────────────────────
  const COLS = ['Nome', 'Telefone', 'Chegou em', 'Dia da semana', 'Setor', 'Origem', 'Responsavel',
    'Respondido', 'Tempo 1a resposta (min)', 'Agendou', 'Fechou', 'Prova do fechamento', 'Valor'];
  const linhaDe = (l) => [l.nome, l.telefone || '', l.chegou, l.dowNome, l.setor, l.origem, l.responsavel || '',
    l.respondido ? 'sim' : 'nao', l.respMin ?? '', l.agendou ? 'sim' : 'nao', l.fechou ? 'sim' : 'nao',
    l.prova || '', l.valor || 0];

  const baixarCSV = () => {
    const csv = [COLS, ...(dados?.lista || []).map(l => linhaDe(l).map((c, i) => (i === 12 ? String(c).replace('.', ',') : c)))]
      .map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\n');
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = `leads-vittalis-${dia || mes || dados?.janela?.de || 'periodo'}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  /* PDF: abre a folha pronta pra impressão (o navegador salva como PDF). Mesmo
     caminho do Relatório Comercial — sem servidor no meio, imprime na hora. */
  const gerarPDF = () => {
    const cel = (v, cls = '') => `<td class="${cls}">${v ?? ''}</td>`;
    const linhaCorte = (l) => `<tr>${cel(l.chave)}${cel(n0(l.leads), 'n')}${cel(pct(l.txAgenda), 'n')}${cel(pct(l.txFechou), 'n')}${cel(fmt.brl(l.valor), 'n')}</tr>`;
    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/>
<title>Carteira de Leads — Vittalis Saúde</title><style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI',Arial,sans-serif;color:#0a1520;background:#fff}
.faixa{height:7px;background:linear-gradient(90deg,#00B8C0,#0E8C96)}
.pg{padding:30px 38px}
.cab{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px}
.cab img{height:74px}
.cab .tit{text-align:right}
.cab h1{font-size:21px;color:#06424A}
.cab .sub{font-size:12.5px;color:#5a7285;margin-top:3px}
.cab .per{display:inline-block;margin-top:7px;background:#e5f8f9;color:#007d83;padding:4px 12px;border-radius:20px;font-size:11px;font-weight:700}
.hr{height:1.5px;background:#e3ebf1;margin:16px 0 22px}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:24px}
.kpi{border:1px solid #e3ebf1;border-radius:12px;padding:13px 15px;background:#f8fbfc}
.kpi .v{font-size:23px;font-weight:800;color:#06424A}
.kpi .l{font-size:10px;color:#5a7285;margin-top:3px;font-weight:700;text-transform:uppercase;letter-spacing:.5px}
.kpi .s{font-size:10.5px;color:#7d94a6;margin-top:3px}
h2{font-size:13px;color:#06424A;margin:0 0 9px;padding-left:9px;border-left:4px solid #00B8C0}
.sec{margin-bottom:22px}
table{width:100%;border-collapse:collapse;border:1px solid #e3ebf1;border-radius:10px;overflow:hidden}
th{background:#06424A;color:#fff;padding:7px 11px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.5px}
td{padding:6px 11px;font-size:11.5px;border-top:1px solid #eef3f7}
td.n{text-align:right;font-weight:700}
tr:nth-child(even) td{background:#f8fbfc}
.fun{display:flex;flex-direction:column;gap:6px}
.fun .li{display:grid;grid-template-columns:135px 1fr 92px;align-items:center;gap:10px;font-size:11.5px}
.fun .bar{height:14px;background:#eef3f7;border-radius:5px;overflow:hidden}
.fun .bar i{display:block;height:100%;background:#0E8C96}
.rod{margin-top:18px;font-size:9.5px;color:#8fa3b3;line-height:1.55;border-top:1px solid #e3ebf1;padding-top:10px}
@page{size:A4;margin:12mm}
</style></head><body><div class="faixa"></div><div class="pg">
<div class="cab">
  <img src="${window.location.origin}/logos/logo-v-color.png" alt="Vittalis Saúde"/>
  <div class="tit"><h1>Carteira de Leads</h1>
  <div class="sub">Clientes novos no primeiro contato e o que eles viraram</div>
  <div class="per">${periodoTxt()}</div></div>
</div><div class="hr"></div>
<div class="kpis">
  <div class="kpi"><div class="v">${n0(t?.leads)}</div><div class="l">Leads novos</div><div class="s">${n0(t?.semResposta)} sem resposta</div></div>
  <div class="kpi"><div class="v">${pct(t?.txAgenda)}</div><div class="l">Agendaram</div><div class="s">${n0(t?.agendados)} clientes</div></div>
  <div class="kpi"><div class="v">${pct(t?.txFechou)}</div><div class="l">Fecharam</div><div class="s">${n0(t?.fechados)} clientes</div></div>
  <div class="kpi"><div class="v">${fmt.brl(t?.valor)}</div><div class="l">Faturamento</div><div class="s">ticket ${fmt.brl(t?.ticket)}</div></div>
</div>
<div class="sec"><h2>Do primeiro contato até o fechamento</h2><div class="fun">
${[['Mandaram mensagem', t?.leads || 0], ['Nós respondemos', t?.respondidos || 0], ['Agendaram', t?.agendados || 0], ['Fecharam', t?.fechados || 0]]
    .map(([r, v]) => `<div class="li"><span>${r}</span><span class="bar"><i style="width:${t?.leads ? Math.round((v / t.leads) * 100) : 0}%"></i></span><span><b>${n0(v)}</b> · ${t?.leads ? Math.round((v / t.leads) * 100) : 0}%</span></div>`).join('')}
</div></div>
<div class="sec"><h2>Por mês</h2><table><tr><th>Mês</th><th>Leads</th><th>Agendaram</th><th>Fecharam</th><th>Faturamento</th></tr>
${(dados?.meses || []).map(linhaCorte).join('')}</table></div>
<div class="sec"><h2>Por origem</h2><table><tr><th>Origem</th><th>Leads</th><th>Agendaram</th><th>Fecharam</th><th>Faturamento</th></tr>
${(dados?.origens || []).map(linhaCorte).join('')}</table></div>
<div class="sec"><h2>Por setor</h2><table><tr><th>Setor</th><th>Leads</th><th>Agendaram</th><th>Fecharam</th><th>Faturamento</th></tr>
${(dados?.setores || []).map(linhaCorte).join('')}</table></div>
<div class="sec"><h2>Leads do período (${n0((dados?.lista || []).length)})</h2><table>
<tr><th>Cliente</th><th>Chegou</th><th>Setor</th><th>Origem</th><th>Situação</th><th>Valor</th></tr>
${(dados?.lista || []).slice(0, 200).map(l => `<tr>${cel(l.nome)}${cel(`${fmt.date(l.dia)} ${DOW[l.dow]}`)}${cel(l.setor)}${cel(l.origem)}${cel(l.fechou ? 'Fechou · ' + (l.prova || '') : l.agendou ? 'Agendou' : l.respondido ? 'Em conversa' : 'Sem resposta')}${cel(l.valor ? fmt.brl(l.valor) : '', 'n')}</tr>`).join('')}
</table></div>
<div class="rod">Como a conta é feita: o lead entra no dia da PRIMEIRA mensagem que ele nos mandou (horário de São Luís) e cada conversa conta uma vez só.
Agendou = evento na agenda ou confirmação enviada na conversa. Fechou = venda lançada no caixa ou o próprio cliente confirmando o pagamento na conversa.
Agendamento e venda só contam se aconteceram DEPOIS da chegada do lead. Gerado em ${new Date().toLocaleString('pt-BR')} · Vittalis Saúde.</div>
</div></body></html>`;
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(html); w.document.close();
    setTimeout(() => w.print(), 600);
  };

  // ── Estilos curtos ─────────────────────────────────────────────────────────
  const btn = (ativo) => ({
    border: `1px solid ${ativo ? 'var(--tq)' : 'var(--border)'}`,
    background: ativo ? 'var(--tq3)' : 'var(--card)',
    color: ativo ? 'var(--tq2)' : 'var(--txt2)',
    borderRadius: 9, padding: '5px 11px', fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
  });
  const dataInput = { border: '1px solid var(--border)', background: 'var(--card)', borderRadius: 8, padding: '4px 8px', fontSize: 11.5, color: 'var(--txt)' };

  const atalho = (rot, fn, ativo) => <button key={rot} onClick={fn} style={btn(ativo)}>{rot}</button>;
  const semPeriodoManual = !de;

  return (
    <div style={{ padding: '18px 20px 40px', maxWidth: 1180, margin: '0 auto' }}>

      {/* 1 · Cabeçalho e período */}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
        <div style={{ flex: 1, minWidth: 230 }}>
          <h1 style={{ fontSize: 19, fontWeight: 800, letterSpacing: -.5, color: 'var(--txt)', margin: 0 }}>Carteira de Leads</h1>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3 }}>
            Cliente novo é quem manda a primeira mensagem. Aqui está quantos chegaram e quantos realmente fecharam.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={carregar} title="Atualizar" style={{ ...btn(false), padding: '5px 9px' }}><RefreshCw size={13} /></button>
          <button onClick={gerarPDF} style={{ ...btn(false), display: 'flex', alignItems: 'center', gap: 5 }}><FileText size={13} /> PDF</button>
          <button onClick={baixarCSV} style={{ ...btn(false), display: 'flex', alignItems: 'center', gap: 5 }}><Download size={13} /> Excel</button>
        </div>
      </div>

      <Caixa style={{ padding: '9px 12px', marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        {atalho('Este mês', () => { setDe(primeiroDoMes(0)); setAte(ultimoDoMes(0)); limparRecorte(); }, de === primeiroDoMes(0))}
        {atalho('Mês passado', () => { setDe(primeiroDoMes(1)); setAte(ultimoDoMes(1)); limparRecorte(); }, de === primeiroDoMes(1))}
        {[3, 6, 12].map(m => atalho(`${m} meses`, () => { setDe(''); setAte(''); setMeses(m); limparRecorte(); }, semPeriodoManual && meses === m))}
        <span style={{ width: 1, height: 18, background: 'var(--border)', margin: '0 2px' }} />
        <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700 }}>Período exato:</span>
        <input type="date" value={de} max={ate || hojeSLZ()} onChange={e => { setDe(e.target.value); limparRecorte(); }} style={dataInput} />
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>até</span>
        <input type="date" value={ate} min={de} max={hojeSLZ()} onChange={e => { setAte(e.target.value); limparRecorte(); }} style={dataInput} />
        {de && <button onClick={() => { setDe(''); setAte(''); }} style={{ ...btn(false), fontWeight: 600 }}>limpar</button>}
        <label style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--muted)', cursor: 'pointer' }}>
          <input type="checkbox" checked={entrada} onChange={e => setEntrada(e.target.checked)} />
          Só quem nos procurou primeiro {!!t?.prospeccao && <span style={{ color: 'var(--light)' }}>({n0(t.prospeccao)} fora)</span>}
        </label>
      </Caixa>

      {erro && <Caixa style={{ padding: 14, marginBottom: 12, color: 'var(--err)', fontSize: 12.5 }}>{erro}</Caixa>}

      {/* 2 · Meses — o primeiro clique */}
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', marginBottom: 12, paddingBottom: 2 }}>
        {(dados?.meses || []).map(m => {
          const ativo = mes === m.chave;
          return (
            <button key={m.chave} onClick={() => { setMes(ativo ? '' : m.chave); setDia(''); setDow(null); }}
              style={{ flexShrink: 0, minWidth: 122, textAlign: 'left', cursor: 'pointer', borderRadius: 12, padding: '9px 12px',
                border: `1.5px solid ${ativo ? 'var(--tq)' : 'var(--border)'}`, background: ativo ? 'var(--tq4)' : 'var(--card)', boxShadow: 'var(--s1)' }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: .6 }}>{m.label}</div>
              <div style={{ fontSize: 19, fontWeight: 800, color: 'var(--txt)', letterSpacing: -.6, marginTop: 1 }}>{n0(m.leads)}</div>
              <div style={{ fontSize: 10.5, color: 'var(--muted)' }}>{m.fechados} fecharam · {pct(m.txFechou)}</div>
            </button>
          );
        })}
        {!carregando && !(dados?.meses || []).length && (
          <div style={{ fontSize: 12.5, color: 'var(--muted)', padding: '8px 2px' }}>Nenhum lead no período escolhido.</div>
        )}
      </div>

      {/* 3 · Os quatro números + funil, lado a lado */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.15fr)', gap: 12, marginBottom: 12 }} className="vh-leads-topo">
        <Caixa style={{ padding: '4px 0' }}>
          {[
            { rot: 'Leads novos', val: n0(t?.leads), sub: `${n0(t?.semResposta)} ainda sem resposta nossa` },
            { rot: 'Respondemos', val: pct(t?.txResposta), sub: `1ª resposta em ${tempoTxt(t?.respostaMediana)} (mediana)` },
            { rot: 'Agendaram', val: pct(t?.txAgenda), sub: `${n0(t?.agendados)} clientes` },
            { rot: 'Fecharam', val: pct(t?.txFechou), sub: `${n0(t?.fechadosCaixa)} no caixa · ${n0(t?.fechadosConversa)} vistos na conversa`, forte: true },
            { rot: 'Faturamento', val: fmt.brl(t?.valor), sub: `ticket ${fmt.brl(t?.ticket)}`, ouro: true },
          ].map(k => (
            <div key={k.rot} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 15px', borderTop: '1px solid var(--border)' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: .6 }}>{k.rot}</div>
                <div style={{ fontSize: 11, color: 'var(--light)', marginTop: 1 }}>{k.sub}</div>
              </div>
              <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: -.6, whiteSpace: 'nowrap',
                color: k.ouro ? 'var(--gold)' : k.forte ? 'var(--tq2)' : 'var(--txt)' }}>{k.val}</div>
            </div>
          ))}
        </Caixa>

        <Caixa style={{ padding: '14px 16px 16px' }}>
          <div style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--txt)', marginBottom: 3 }}>Do primeiro contato até o fechamento</div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 11 }}>{periodoTxt()}</div>
          {[
            { rot: 'Mandaram mensagem', v: t?.leads || 0, cor: 'var(--bord2)' },
            { rot: 'Nós respondemos', v: t?.respondidos || 0, cor: 'var(--tq)' },
            { rot: 'Agendaram', v: t?.agendados || 0, cor: 'var(--pet)' },
            { rot: 'Fecharam', v: t?.fechados || 0, cor: 'var(--tq2)' },
          ].map((e, i, arr) => (
            <div key={e.rot} style={{ display: 'grid', gridTemplateColumns: '138px 1fr 78px', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <div style={{ fontSize: 11.5, color: 'var(--muted)', fontWeight: 700 }}>{e.rot}</div>
              <div style={{ height: 15, background: 'var(--bg2)', borderRadius: 5, overflow: 'hidden' }}>
                <div style={{ width: `${arr[0].v ? Math.min(100, (e.v / arr[0].v) * 100) : 0}%`, height: '100%', background: e.cor, borderRadius: 5 }} />
              </div>
              <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--txt)', textAlign: 'right' }}>
                {n0(e.v)}<span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--muted)' }}>{i > 0 && arr[0].v ? ` · ${Math.round((e.v / arr[0].v) * 100)}%` : ''}</span>
              </div>
            </div>
          ))}
          {!!(t?.querFechar || t?.objecoes) && (
            <div style={{ marginTop: 10, paddingTop: 9, borderTop: '1px solid var(--border)', fontSize: 11.5, color: 'var(--muted)' }}>
              Na conversa: <b style={{ color: 'var(--tq2)' }}>{n0(t.querFechar)}</b> disseram que querem fechar e ainda não fecharam ·
              <b style={{ color: 'var(--err)' }}> {n0(t.objecoes)}</b> recuaram (preço / "vou pensar").
            </div>
          )}
        </Caixa>
      </div>

      {/* 4 · Afinar: dia da semana, dia, e o corte escolhido */}
      <Caixa style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 15px 0', flexWrap: 'wrap' }}>
          <div style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--txt)', flex: 1 }}>Quando eles chegam</div>
          {(mes || dia || dow !== null || setor || origem) &&
            <button onClick={limparRecorte} style={{ ...btn(false), fontWeight: 600 }}>ver o período inteiro</button>}
        </div>

        <div style={{ display: 'flex', gap: 6, padding: '9px 15px 0', flexWrap: 'wrap' }}>
          {(dados?.semana || []).map(s => (
            <button key={s.dow} onClick={() => { setDow(dow === s.dow ? null : s.dow); setDia(''); }} disabled={!s.leads}
              style={{ ...btn(dow === s.dow), opacity: s.leads ? 1 : .42, cursor: s.leads ? 'pointer' : 'default' }}>
              {DOW[s.dow]} <b style={{ fontSize: 12.5 }}>{n0(s.leads)}</b>
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 4, padding: '10px 15px 14px', overflowX: 'auto' }}>
          {(dados?.dias || []).map(d => {
            const ativo = dia === d.dia;
            const alt = Math.max(1, ...(dados?.dias || []).map(x => x.leads));
            return (
              <button key={d.dia} onClick={() => { setDia(ativo ? '' : d.dia); setDow(null); }}
                title={`${d.dowNome} ${d.label} · ${d.leads} leads · ${d.agendados} agendaram · ${d.fechados} fecharam`}
                style={{ flexShrink: 0, width: 40, cursor: 'pointer', borderRadius: 9, padding: '5px 2px 4px', textAlign: 'center',
                  border: `1.5px solid ${ativo ? 'var(--tq)' : 'transparent'}`, background: ativo ? 'var(--tq4)' : 'transparent' }}>
                <div style={{ height: 30, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                  <div style={{ width: 11, borderRadius: 3, background: d.fechados ? 'var(--tq2)' : 'var(--bord2)', height: `${Math.max(4, (d.leads / alt) * 30)}px` }} />
                </div>
                <div style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--txt)', marginTop: 3 }}>{n0(d.leads)}</div>
                <div style={{ fontSize: 8.5, color: 'var(--muted)' }}>{d.label}</div>
              </button>
            );
          })}
          {!(dados?.dias || []).length && <div style={{ padding: '6px 0', fontSize: 12.5, color: 'var(--muted)' }}>Sem dias com lead.</div>}
        </div>

        {/* Cortes em abas — três quadros viraram um */}
        <div style={{ borderTop: '1px solid var(--border)', padding: '11px 15px 0', display: 'flex', gap: 6 }}>
          {[['origem', 'Por origem'], ['setor', 'Por setor'], ['equipe', 'Por atendente']].map(([k, rot]) => (
            <button key={k} onClick={() => setCorte(k)} style={btn(corte === k)}>{rot}</button>
          ))}
        </div>
        <div style={{ padding: '4px 15px 14px' }}>
          {!linhas.length && <div style={{ padding: '14px 0', fontSize: 12, color: 'var(--muted)' }}>Sem leads neste recorte.</div>}
          {linhas.map(l => {
            const maior = Math.max(1, ...linhas.map(x => x.leads));
            const selecionavel = corte !== 'equipe';
            const ativo = (corte === 'origem' && origem === l.chave) || (corte === 'setor' && setor === l.chave);
            return (
              <div key={l.chave} onClick={() => { if (!selecionavel) return;
                  if (corte === 'origem') setOrigem(ativo ? '' : l.chave); else setSetor(ativo ? '' : l.chave); }}
                style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 46px 58px 58px 88px', alignItems: 'center', gap: 8,
                  padding: '8px 6px', borderTop: '1px solid var(--border)', cursor: selecionavel ? 'pointer' : 'default',
                  background: ativo ? 'var(--tq4)' : 'transparent', borderRadius: 8 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--txt)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.chave}</div>
                  <div style={{ height: 5, background: 'var(--bg2)', borderRadius: 99, marginTop: 4, overflow: 'hidden' }}>
                    <div style={{ width: `${(l.leads / maior) * 100}%`, height: '100%', background: 'var(--tq)', borderRadius: 99 }} />
                  </div>
                </div>
                <div style={{ fontSize: 13, fontWeight: 800, textAlign: 'right', color: 'var(--txt)' }}>{n0(l.leads)}</div>
                <div style={{ fontSize: 11.5, textAlign: 'right', color: 'var(--muted)' }} title="Agendaram">{pct(l.txAgenda)}</div>
                <div style={{ fontSize: 11.5, textAlign: 'right', fontWeight: 700, color: l.txFechou > 0 ? 'var(--tq2)' : 'var(--muted)' }} title="Fecharam">{pct(l.txFechou)}</div>
                <div style={{ fontSize: 11.5, textAlign: 'right', color: 'var(--muted)' }}>{fmt.brl(l.valor)}</div>
              </div>
            );
          })}
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 46px 58px 58px 88px', gap: 8, padding: '6px 6px 0',
            borderTop: '1px solid var(--border)', fontSize: 9.5, color: 'var(--light)', textTransform: 'uppercase', letterSpacing: .5, fontWeight: 700 }}>
            <div />{['Leads', 'Agenda', 'Fechou', 'R$'].map(x => <div key={x} style={{ textAlign: 'right' }}>{x}</div>)}
          </div>
        </div>
      </Caixa>

      {/* 5 · Quem são */}
      <Caixa>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 15px 0', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 180 }}>
            <div style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--txt)' }}>Leads deste recorte</div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
              {n0(lista.length)} na tela{dados?.truncada ? ` · ${n0(dados.truncada)} no total (o Excel traz todos)` : ''} · clique pra abrir a conversa
            </div>
          </div>
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar nome ou telefone…"
            style={{ border: '1px solid var(--border)', background: 'var(--bg)', borderRadius: 9, padding: '6px 11px', fontSize: 12, color: 'var(--txt)', minWidth: 170 }} />
        </div>

        <div style={{ padding: '9px 10px 12px' }}>
          {!lista.length && <div style={{ padding: '18px 8px', fontSize: 12.5, color: 'var(--muted)' }}>{carregando ? 'Carregando…' : 'Nenhum lead neste recorte.'}</div>}
          {lista.map(l => (
            <div key={l.id} onClick={() => nav(`/inbox?conv=${l.id}`)}
              style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.4fr) 104px minmax(0,1.1fr) 26px', alignItems: 'center', gap: 10,
                padding: '9px 8px', borderTop: '1px solid var(--border)', cursor: 'pointer', borderRadius: 8 }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--txt)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.nome}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>{fmt.phone(l.telefone)} · {l.setor}{l.responsavel ? ` · ${l.responsavel}` : ''}</div>
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                {fmt.date(l.dia)}<br /><span style={{ fontSize: 10.5, color: 'var(--light)' }}>{DOW[l.dow]} · {l.chegou.slice(11)}</span>
              </div>
              <div style={{ minWidth: 0 }}>
                {l.fechou ? (
                  <>
                    <span style={{ fontSize: 10.5, fontWeight: 800, padding: '2px 8px', borderRadius: 99, background: 'var(--ok2)', color: 'var(--ok)' }}>
                      fechou{l.valor ? ` · ${fmt.brl(l.valor)}` : ''}
                    </span>
                    <div style={{ fontSize: 10, color: 'var(--light)', marginTop: 3 }}>{l.prova}</div>
                  </>
                ) : l.agendou ? (
                  <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: 'var(--tq3)', color: 'var(--tq2)' }}>agendou</span>
                ) : !l.respondido ? (
                  <span style={{ fontSize: 10.5, fontWeight: 800, padding: '2px 8px', borderRadius: 99, background: 'var(--err2)', color: 'var(--err)' }}>sem resposta nossa</span>
                ) : l.objecao ? (
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--muted)' }}>recuou · preço/depois</span>
                ) : l.querFechar ? (
                  <span style={{ fontSize: 10.5, fontWeight: 800, padding: '2px 8px', borderRadius: 99, background: 'var(--gold2)', color: 'var(--gold)' }}>quer fechar</span>
                ) : (
                  <span style={{ fontSize: 10.5, color: 'var(--light)' }}>em conversa · resp. {tempoTxt(l.respMin)}</span>
                )}
              </div>
              <MessageSquare size={14} style={{ color: 'var(--light)' }} />
            </div>
          ))}
        </div>
      </Caixa>

      <div style={{ fontSize: 10.5, color: 'var(--light)', marginTop: 12, lineHeight: 1.6 }}>
        Como a conta é feita: o lead entra no dia da <b>primeira mensagem que ele nos mandou</b> (horário de São Luís) e cada conversa conta uma vez só.
        <b> Agendou</b> = evento na agenda ou confirmação enviada na conversa. <b>Fechou</b> = venda lançada no caixa ou o próprio cliente
        confirmando o pagamento na conversa. Agenda e venda só contam se aconteceram <b>depois</b> da chegada do lead.
      </div>
    </div>
  );
}
