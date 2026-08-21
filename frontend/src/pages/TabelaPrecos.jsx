import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FileText, Paperclip, Download, Trash2, Plus, X, Copy, Check, Pencil, Calculator, Eye, Search, Send, Sparkles, RotateCcw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useApi, useAuth } from '../context/AuthContext.jsx';
import { fmt } from '../hooks/utils.js';
import { Toast } from '../hooks/toast.js';

/* 💲 TABELA DE PREÇOS (pedido do master — visível pra TODOS).
   Duas metades que se completam:
   · em cima, as TABELAS OFICIAIS anexadas (PDF/planilha/foto) — a fonte da
     verdade que a gestão publica, com visualização na própria tela;
   · embaixo, a lista de itens digitada, de onde a atendente MONTA O ORÇAMENTO
     em cliques: busca, marca os itens, ajusta quantidade/desconto/parcelas e
     manda direto pra conversa. Orçamento montado aqui nunca diverge da tabela
     — era o risco de cada uma digitar preço de cabeça.
   Cada orçamento copiado/enviado fica REGISTRADO (memória da proposta): a
   gestão enxerga o que saiu e a atendente reencontra o de ontem. */

const fileToDataUrl = (file) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
// Busca sem acento — mesma régua da lupa do Chat ("coimbra" acha "Coimbrã")
const semAcento = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const DESCONTO_MAX_ATENDENTE = 0.10; // acima de 10% só a gestão libera (protege a margem)
const inputStyle = { padding: '7px 10px', borderRadius: 9, border: '1.5px solid var(--border)', fontSize: 12.5, background: 'var(--card)', color: 'var(--txt)' };

export default function TabelaPrecos() {
  const api = useApi();
  const navigate = useNavigate();
  const { user } = useAuth();
  // Visível pra todos — só a edição continua com a gestão.
  const ehGestao = ['master', 'supervisor'].includes(user?.role);
  // Última conversa que a atendente abriu no Chat — destino do "Enviar pra conversa"
  const [ultimaConv] = useState(() => { try { return JSON.parse(sessionStorage.getItem('vh_ultima_conversa') || 'null'); } catch { return null; } });

  // ── tabelas anexadas (mesma infra das pastas) ──────────────────────────────
  /* Abas por setor (pedido do master: repartido igual Profissionais) —
     itens E anexos de cada setor vivem na sua aba. */
  const [aba, setAba] = useState('consultas');
  const CHAVE = 'tabela_precos_' + aba;
  const fileRef = useRef(null);
  const [arqs, setArqs] = useState([]);
  const [enviando, setEnviando] = useState(false);
  const [confirmDel, setConfirmDel] = useState(null); // id aguardando confirmação (window.confirm quebra no celular)
  const [ver, setVer] = useState(null);               // {nome, arquivo, mimetype} — visualização inline
  const loadArqs = () => api.get(`/extras/pasta-arquivos?chave=${CHAVE}`).then(d => setArqs(Array.isArray(d) ? d : [])).catch(() => {});
  const anexar = async (e) => {
    const f = e.target.files?.[0]; e.target.value = ''; if (!f) return;
    const url = await fileToDataUrl(f);
    if (url.length > 52_000_000) { Toast.show('Arquivo muito grande (máx. ~40MB).', 'error'); return; }
    setEnviando(true);
    try { const a = await api.post('/extras/pasta-arquivos', { chave: CHAVE, nome: f.name, arquivo: url, mimetype: f.type }); setArqs(p => [a, ...p]); }
    catch (err) { Toast.show(err.message, 'error'); }
    setEnviando(false);
  };
  const baixar = async (a) => {
    const d = await api.get(`/extras/pasta-arquivos/${a.id}/download`).catch(() => null);
    if (!d) return;
    const el = document.createElement('a'); el.href = d.arquivo; el.download = d.nome || 'tabela'; el.click();
  };
  const visualizar = async (a) => {
    const d = await api.get(`/extras/pasta-arquivos/${a.id}/download`).catch(() => null);
    if (!d) { Toast.show('Não consegui abrir o arquivo.', 'error'); return; }
    setVer({ nome: d.nome || a.nome, arquivo: d.arquivo, mimetype: d.mimetype || a.mimetype || '' });
  };
  const removerArq = async (a) => {
    setConfirmDel(null);
    setArqs(p => p.filter(x => x.id !== a.id));
    try { await api.del(`/extras/pasta-arquivos/${a.id}`); } catch { loadArqs(); }
  };
  // 🤖 IA lê a tabela anexada e preenche o editor (gestão revisa e salva)
  const [lendoIA, setLendoIA] = useState(null);
  const lerAnexo = async (a) => {
    setLendoIA(a.id);
    try {
      const d = await api.post('/extras/tabela-precos/ler-anexo', { id: a.id });
      const lidos = d.itens || [];
      const daAba = itens.filter(i => (i.setor || 'consultas') === aba);
      const jaTem = new Set(daAba.map(i => semAcento(i.nome)));
      const novos = lidos.filter(i => !jaTem.has(semAcento(i.nome))).map(i => ({ ...i, setor: aba }));
      setRascunho([...daAba.map(i => ({ ...i })), ...novos]);
      setEditando(true);
      Toast.show(`A IA leu ${lidos.length} serviço(s)${novos.length < lidos.length ? ` (${lidos.length - novos.length} já estavam na tabela)` : ''} — revise os valores e salve! 🤖`, 'success');
    } catch (e) { Toast.show(e.message, 'error'); }
    setLendoIA(null);
  };

  // ── itens de preço + orçamento ─────────────────────────────────────────────
  const [itens, setItens] = useState([]);
  const [meta, setMeta] = useState({ por: null, em: null }); // quem publicou e quando
  const [editando, setEditando] = useState(false);
  const [rascunho, setRascunho] = useState([]);   // cópia editável (gestão)
  const [sel, setSel] = useState({});             // id → quantidade
  const [busca, setBusca] = useState('');
  const [desconto, setDesconto] = useState('');
  const [tipoDesc, setTipoDesc] = useState('rs'); // 'rs' | 'pct'
  const [parcelas, setParcelas] = useState(1);
  const [clienteNome, setClienteNome] = useState('');
  const [copiado, setCopiado] = useState(false);
  const [orcs, setOrcs] = useState({ itens: [], gestao: false });
  const loadItens = () => api.get('/extras/tabela-precos').then(d => { setItens(d.itens || []); setMeta({ por: d.por, em: d.em }); }).catch(() => {});
  const loadOrcs = () => api.get('/extras/orcamentos').then(d => setOrcs({ itens: d.itens || [], gestao: !!d.gestao })).catch(() => {});
  useEffect(() => { loadArqs(); loadItens(); loadOrcs(); }, []); // eslint-disable-line
  useEffect(() => { loadArqs(); setEditando(false); setBusca(''); }, [aba]); // eslint-disable-line — cada aba tem seus anexos

  const salvarItens = async () => {
    try {
      // O rascunho e SO da aba atual — os itens das outras abas vao intactos
      const outros = itens.filter(i => (i.setor || 'consultas') !== aba);
      const d = await api.put('/extras/tabela-precos', { itens: [...outros, ...rascunho.map(i => ({ ...i, setor: aba }))] });
      setItens(d.itens || []); setEditando(false); loadItens();
      Toast.show('Tabela salva! 💙', 'success');
    } catch (e) { Toast.show(e.message, 'error'); }
  };

  // Busca + agrupamento por categoria (categorias na ordem em que aparecem)
  const filtrados = useMemo(() => {
    const q = semAcento(busca.trim());
    const daAba = itens.filter(i => (i.setor || 'consultas') === aba);
    return q ? daAba.filter(i => semAcento(`${i.nome} ${i.obs || ''} ${i.categoria || ''}`).includes(q)) : daAba;
  }, [itens, busca, aba]);
  const grupos = useMemo(() => {
    const temCat = filtrados.some(i => i.categoria);
    if (!temCat) return [{ cat: null, itens: filtrados }];
    const ordem = []; const mapa = {};
    for (const i of filtrados) {
      const c = i.categoria || 'Outros';
      if (!mapa[c]) { mapa[c] = []; ordem.push(c); }
      mapa[c].push(i);
    }
    // "Outros" sempre por último
    ordem.sort((a, b) => (a === 'Outros') - (b === 'Outros'));
    return ordem.map(c => ({ cat: c, itens: mapa[c] }));
  }, [filtrados]);
  const categoriasExistentes = useMemo(() => [...new Set([...itens, ...rascunho].map(i => i.categoria).filter(Boolean))], [itens, rascunho]);

  const marcados = itens.filter(i => (sel[i.id] || 0) > 0);
  const subtotal = marcados.reduce((a, i) => a + i.valor * (sel[i.id] || 0), 0);
  // Desconto em R$ OU em % (a equipe pensa "dou 5%", não "dou R$ 41,50")
  const dNum = Math.max(parseFloat(String(desconto).replace(',', '.')) || 0, 0);
  const descPedido = Math.min(tipoDesc === 'pct' ? subtotal * Math.min(dNum, 100) / 100 : dNum, subtotal);
  // Trava de desconto: atendente vai até 10%; acima disso só gestão (protege a margem)
  const descTeto = ehGestao ? subtotal : subtotal * DESCONTO_MAX_ATENDENTE;
  const desc = Math.min(descPedido, descTeto);
  const descTravado = descPedido > desc + 0.004;
  const total = subtotal - desc;
  const validade = new Date(Date.now() + 7 * 86400000);
  const validadeTxt = `${String(validade.getDate()).padStart(2, '0')}/${String(validade.getMonth() + 1).padStart(2, '0')}`;

  const textoOrcamento = () => {
    const linhas = marcados.map(i => {
      const q = sel[i.id] || 0;
      return `• ${i.nome}${q > 1 ? ` (${q}x)` : ''} — ${fmt.brl(i.valor * q)}`;
    });
    const nome = clienteNome.trim();
    return [
      `*Orçamento — Vittalis Saúde* 💙${nome ? `\nPra você, ${nome}! 😊` : ''}`,
      '',
      ...linhas,
      '',
      desc > 0 ? `Subtotal: ${fmt.brl(subtotal)}\nDesconto: -${fmt.brl(desc)}\n*Total: ${fmt.brl(total)}*` : `*Total: ${fmt.brl(total)}*`,
      ...(parcelas > 1 ? [`_ou ${parcelas}x de ${fmt.brl(total / parcelas)} no cartão_`] : []),
      '',
      `Orçamento válido até ${validadeTxt}. Aceitamos Pix, débito e crédito. Qual horário fica melhor pra você? 😊`,
    ].join('\n');
  };
  // Memória da proposta: todo orçamento copiado/enviado fica registrado
  const registrar = (conversaId) => api.post('/extras/orcamentos', {
    cliente_nome: clienteNome.trim() || (conversaId && ultimaConv?.nome) || '',
    conversa_id: conversaId || null,
    itens: marcados.map(i => ({ nome: i.nome, valor: i.valor, qtd: sel[i.id] || 1 })),
    subtotal, desconto: desc, total, parcelas,
  }).then(loadOrcs).catch(() => {});
  const copiar = async () => {
    try { await navigator.clipboard.writeText(textoOrcamento()); }
    catch { const ta = document.createElement('textarea'); ta.value = textoOrcamento(); document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); }
    setCopiado(true); setTimeout(() => setCopiado(false), 2000);
    registrar(null);
    Toast.show('Orçamento copiado — é só colar na conversa! 📋', 'success');
  };
  const enviarPraConversa = () => {
    if (!ultimaConv?.id) return;
    // Deixa o texto escrito na caixa do Chat — quem aperta enviar é a atendente
    try { sessionStorage.setItem('vh_rascunho_' + ultimaConv.id, textoOrcamento()); } catch { /* ok */ }
    registrar(ultimaConv.id);
    navigate(`/inbox?conv=${ultimaConv.id}`);
  };
  // 📄 PDF com o papel timbrado da Vittalis — proposta com marca fecha mais
  const payloadOrc = () => ({
    cliente_nome: clienteNome.trim() || ultimaConv?.nome || '',
    itens: marcados.map(i => ({ nome: i.nome, obs: i.obs, valor: i.valor, qtd: sel[i.id] || 1 })),
    subtotal, desconto: desc, total, parcelas,
  });
  const [pdfConfirm, setPdfConfirm] = useState(false);
  const [pdfEnviando, setPdfEnviando] = useState(false);
  const [pdfBaixando, setPdfBaixando] = useState(false);
  const enviarPdfConversa = async () => {
    setPdfConfirm(false); setPdfEnviando(true);
    try {
      await api.post(`/inbox/conversations/${ultimaConv.id}/orcamento-pdf`, payloadOrc());
      registrar(ultimaConv.id);
      Toast.show(`Orçamento em PDF enviado pra ${String(ultimaConv.nome || 'a conversa').split(' ')[0]}! 📄💙`, 'success');
    } catch (e) { Toast.show(e.message, 'error'); }
    setPdfEnviando(false);
  };
  const baixarPdf = async () => {
    setPdfBaixando(true);
    try {
      const d = await api.post('/extras/orcamentos/pdf', payloadOrc());
      const el = document.createElement('a');
      el.href = 'data:application/pdf;base64,' + d.pdf; el.download = d.filename || 'Orcamento-Vittalis.pdf'; el.click();
      registrar(null);
    } catch (e) { Toast.show(e.message, 'error'); }
    setPdfBaixando(false);
  };
  // 💰 Orçamento virou venda → registra no Caixa sem redigitar
  const [confirmVenda, setConfirmVenda] = useState(null);
  const virouVenda = async (o) => {
    setConfirmVenda(null);
    try {
      await api.post(`/extras/orcamentos/${o.id}/virou-venda`, {});
      Toast.show('Venda registrada no Caixa! 🎉', 'success');
      loadOrcs();
    } catch (e) { Toast.show(e.message, 'error'); }
  };
  // ↻ Reaproveitar um orçamento antigo (itens repreçados pela tabela ATUAL)
  const reusar = (o) => {
    const os = Array.isArray(o.itens) ? o.itens : [];
    const novoSel = {}; const faltam = [];
    os.forEach(oi => {
      const alvo = itens.find(i => semAcento(i.nome) === semAcento(oi.nome));
      if (alvo) novoSel[alvo.id] = Math.max(1, parseInt(oi.qtd) || 1); else faltam.push(oi.nome);
    });
    setSel(novoSel); setClienteNome(o.cliente_nome || ''); setParcelas(o.parcelas || 1);
    setTipoDesc('rs'); setDesconto(parseFloat(o.desconto) > 0 ? String(o.desconto).replace('.', ',') : '');
    Toast.show(faltam.length ? `Reaproveitei — mas ${faltam.length} item(ns) saíram da tabela: ${faltam.join(', ')}` : 'Orçamento reaproveitado — ajuste e envie! ↻', faltam.length ? 'info' : 'success');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const atualizadaTxt = meta.em ? `Atualizada em ${new Date(meta.em).toLocaleDateString('pt-BR')}${meta.por ? ` por ${String(meta.por).split(' ')[0]}` : ''}` : null;

  return (
    <div style={{ padding: 28, maxWidth: 1000, margin: '0 auto' }}>
      {/* Cabeçalho premium — mesma identidade dos Cases (pedido do master) */}
      <div style={{ borderRadius: 18, padding: '22px 26px', marginBottom: 18, color: '#fff', position: 'relative', overflow: 'hidden',
        background: 'linear-gradient(135deg,#0369a1,#0ea5e9 60%,#38bdf8)', boxShadow: '0 10px 30px rgba(14,165,233,.30)' }}>
        <div style={{ position: 'absolute', right: -25, top: -25, width: 130, height: 130, borderRadius: '50%', background: 'rgba(255,255,255,.10)' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 23, fontWeight: 800 }}><Calculator size={24} /> Tabela de Preços</div>
        <div style={{ fontSize: 13.5, opacity: .95, marginTop: 6, maxWidth: 620, lineHeight: 1.5 }}>
          As tabelas oficiais de cada setor + o <b>orçamento montado em cliques</b>, sem preço de cabeça.
          {atualizadaTxt && <span style={{ display: 'inline-block', marginLeft: 8, fontWeight: 800, background: 'rgba(255,255,255,.18)', borderRadius: 20, padding: '1px 10px', fontSize: 11.5 }}>{atualizadaTxt}</span>}
        </div>
      </div>

      {/* 🗂️ ABAS POR SETOR (pedido do master: repartido igual Profissionais) */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
        {[['vacinas', '💉 Vacinas', '#7c5cbf'], ['consultas', '🩺 Consultas', '#00B8C0'], ['terapias', '🧩 Terapias', '#C4973B']].map(([k, rot, cor]) => {
          const nAba = itens.filter(i => (i.setor || 'consultas') === k).length;
          return (
          <button key={k} onClick={() => setAba(k)}
            style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 18px', borderRadius: 12, cursor: 'pointer', fontSize: 13, fontWeight: 900,
              border: `1.5px solid ${aba === k ? cor : 'var(--border)'}`, borderBottom: aba === k ? `3px solid ${cor}` : '1.5px solid var(--border)',
              background: aba === k ? cor : 'var(--card)', color: aba === k ? '#fff' : 'var(--muted)',
              boxShadow: aba === k ? `0 4px 14px ${cor}55` : 'none', transition: 'all .15s' }}>
            {rot}
            <span style={{ fontSize: 10, fontWeight: 900, borderRadius: 10, padding: '1px 7px',
              background: aba === k ? 'rgba(255,255,255,.25)' : 'var(--bg2)', color: aba === k ? '#fff' : 'var(--muted)' }}>{nAba}</span>
          </button>
          );
        })}
      </div>

      {/* 📎 Tabelas anexadas (da aba escolhida) */}
      <div className="card" style={{ padding: '15px 18px', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: arqs.length ? 10 : 0 }}>
          <Paperclip size={15} color="var(--tq2)" />
          <span style={{ fontWeight: 800, fontSize: 14, flex: 1 }}>Tabelas anexadas {arqs.length > 0 && <span style={{ color: 'var(--muted)', fontWeight: 600 }}>({arqs.length})</span>}</span>
          <input ref={fileRef} type="file" accept="application/pdf,.doc,.docx,.xls,.xlsx,image/*" style={{ display: 'none' }} onChange={anexar} />
          <button onClick={() => fileRef.current?.click()} disabled={enviando} className="btn btn-p btn-sm" style={{ gap: 6 }}>
            <Plus size={13} /> {enviando ? 'Enviando…' : 'Anexar tabela'}
          </button>
        </div>
        {arqs.length === 0 && <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 8 }}>Anexe aqui a tabela oficial (PDF, planilha ou foto) — a equipe abre na tela quando precisar conferir.</div>}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {arqs.map(a => (
            <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 7, background: 'var(--bg2)', borderRadius: 10, padding: '7px 11px' }}>
              <FileText size={14} color="var(--tq2)" />
              <span style={{ fontSize: 12.5, fontWeight: 700, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.nome}</span>
              <button onClick={() => visualizar(a)} title="Ver na tela" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tq2)', padding: 2 }}><Eye size={14} /></button>
              <button onClick={() => baixar(a)} title="Baixar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tq2)', padding: 2 }}><Download size={13} /></button>
              {ehGestao && (
                <button onClick={() => lerAnexo(a)} disabled={lendoIA === a.id} title="A IA lê esta tabela e preenche os itens pra você revisar"
                  style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--tq4)', border: '1px solid var(--tq3)', borderRadius: 7,
                    cursor: 'pointer', color: 'var(--tq2)', padding: '3px 8px', fontSize: 11, fontWeight: 800 }}>
                  <Sparkles size={11} /> {lendoIA === a.id ? 'Lendo…' : 'Ler com IA'}
                </button>
              )}
              {ehGestao && (confirmDel === a.id
                ? <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11.5, fontWeight: 800, color: 'var(--err)' }}>
                    Remover?
                    <button onClick={() => removerArq(a)} style={{ background: 'var(--err)', color: '#fff', border: 'none', borderRadius: 6, padding: '2px 7px', cursor: 'pointer', fontSize: 11, fontWeight: 800 }}>Sim</button>
                    <button onClick={() => setConfirmDel(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 2 }}><X size={13} /></button>
                  </span>
                : <button onClick={() => setConfirmDel(a.id)} title="Remover" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--err)', padding: 2 }}><Trash2 size={13} /></button>)}
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 16 }}>
        {/* 💲 Itens da tabela */}
        <div className="card" style={{ padding: '15px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span style={{ fontWeight: 800, fontSize: 14, flex: 1 }}>💲 Itens e valores</span>
            {ehGestao && !editando && (
              <button onClick={() => { setRascunho(itens.filter(i => (i.setor || 'consultas') === aba).map(i => ({ ...i }))); setEditando(true); }} className="btn btn-s btn-sm" style={{ gap: 5 }}>
                <Pencil size={12} /> Editar
              </button>
            )}
          </div>

          {!editando ? (
            <>
              {itens.length > 6 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10, padding: '7px 11px', borderRadius: 10, border: '1.5px solid var(--border)', background: 'var(--bg2)' }}>
                  <Search size={13} color="var(--muted)" />
                  <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar serviço…"
                    style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 12.5, color: 'var(--txt)' }} />
                  {busca && <button onClick={() => setBusca('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 0 }}><X size={13} /></button>}
                </div>
              )}
              {itens.length === 0
                ? <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>
                    Nenhum item ainda.{ehGestao ? ' Clique em Editar e digite os serviços com os valores — é daqui que o orçamento nasce.' : ' Peça pra gestão cadastrar os serviços.'}
                  </div>
                : filtrados.length === 0
                  ? <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>Nada com "{busca}" — confira a escrita ou limpe a busca.</div>
                  : grupos.map(g => (
                      <div key={g.cat || '_'}>
                        {g.cat && <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5, margin: '10px 2px 5px' }}>{g.cat}</div>}
                        {g.itens.map(i => {
                          const q = sel[i.id] || 0;
                          return (
                            <div key={i.id} onClick={() => setSel(p => ({ ...p, [i.id]: q > 0 ? 0 : 1 }))}
                              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 10, cursor: 'pointer', marginBottom: 4,
                                background: q > 0 ? 'var(--tq4)' : 'transparent', border: `1.5px solid ${q > 0 ? 'var(--tq3)' : 'transparent'}` }}>
                              <span style={{ width: 18, height: 18, borderRadius: 6, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                border: `2px solid ${q > 0 ? 'var(--tq)' : 'var(--border)'}`, background: q > 0 ? 'var(--tq)' : 'transparent', color: '#fff' }}>
                                {q > 0 && <Check size={12} strokeWidth={3} />}
                              </span>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: 700, fontSize: 13 }}>{i.nome}</div>
                                {i.obs && <div style={{ fontSize: 11, color: 'var(--muted)' }}>{i.obs}</div>}
                              </div>
                              <span style={{ fontWeight: 800, fontSize: 13, color: 'var(--tq2)' }}>{fmt.brl(i.valor)}</span>
                              {q > 0 && (
                                <span onClick={e => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                  <button onClick={() => setSel(p => ({ ...p, [i.id]: Math.max(q - 1, 0) }))} className="btn btn-sm" style={{ padding: '2px 8px' }}>−</button>
                                  <b style={{ minWidth: 16, textAlign: 'center', fontSize: 13 }}>{q}</b>
                                  <button onClick={() => setSel(p => ({ ...p, [i.id]: q + 1 }))} className="btn btn-sm" style={{ padding: '2px 8px' }}>+</button>
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ))}
            </>
          ) : (
            <>
              <datalist id="vh-cats-tp">{categoriasExistentes.map(c => <option key={c} value={c} />)}</datalist>
              {rascunho.map((i, idx) => (
                <div key={i.id} style={{ borderBottom: '1px dashed var(--border)', paddingBottom: 8, marginBottom: 8 }}>
                  <div style={{ display: 'flex', gap: 6, marginBottom: 5 }}>
                    <input value={i.nome} onChange={e => setRascunho(r => r.map((x, j) => j === idx ? { ...x, nome: e.target.value } : x))}
                      placeholder="Serviço (ex.: Consulta Pediátrica)" style={{ ...inputStyle, flex: 2, minWidth: 0 }} />
                    <input value={i.valor} onChange={e => setRascunho(r => r.map((x, j) => j === idx ? { ...x, valor: e.target.value } : x))}
                      placeholder="R$" inputMode="decimal" style={{ ...inputStyle, width: 84 }} />
                    <button onClick={() => setRascunho(r => r.filter((_, j) => j !== idx))} title="Remover"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--err)' }}><X size={14} /></button>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input value={i.categoria || ''} list="vh-cats-tp" onChange={e => setRascunho(r => r.map((x, j) => j === idx ? { ...x, categoria: e.target.value } : x))}
                      placeholder="Categoria (ex.: Consultas)" style={{ ...inputStyle, width: 150 }} />
                    <input value={i.obs || ''} onChange={e => setRascunho(r => r.map((x, j) => j === idx ? { ...x, obs: e.target.value } : x))}
                      placeholder="Observação (ex.: com a Dra. Ana)" style={{ ...inputStyle, flex: 1, minWidth: 0 }} />
                  </div>
                </div>
              ))}
              <button onClick={() => setRascunho(r => [...r, { id: Math.random().toString(36).slice(2, 10), nome: '', valor: '', categoria: r[r.length - 1]?.categoria || '', obs: '' }])}
                className="btn btn-s btn-sm" style={{ gap: 5, marginTop: 4 }}><Plus size={12} /> Adicionar item</button>
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button onClick={salvarItens} className="btn btn-p" style={{ flex: 1, fontWeight: 800 }}>Salvar tabela</button>
                <button onClick={() => setEditando(false)} className="btn">Cancelar</button>
              </div>
            </>
          )}
        </div>

        {/* 🧾 Orçamento montado */}
        <div className="card" style={{ padding: '15px 18px', alignSelf: 'start', position: 'sticky', top: 70 }}>
          <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 10 }}>🧾 Orçamento</div>
          {marcados.length === 0 ? (
            <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>Marque os itens na tabela ao lado — o orçamento se monta sozinho aqui, com total, desconto e parcelas.</div>
          ) : (
            <>
              <input value={clienteNome} onChange={e => setClienteNome(e.target.value)} placeholder="Nome do cliente (opcional)"
                style={{ ...inputStyle, width: '100%', marginBottom: 8 }} />
              {marcados.map(i => (
                <div key={i.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '4px 0', borderBottom: '1px dashed var(--border)' }}>
                  <span>{i.nome}{(sel[i.id] || 0) > 1 ? ` (${sel[i.id]}x)` : ''}</span>
                  <b>{fmt.brl(i.valor * (sel[i.id] || 0))}</b>
                </div>
              ))}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '10px 0 6px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 700 }}>Desconto</span>
                <span style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', border: '1.5px solid var(--border)' }}>
                  {[['rs', 'R$'], ['pct', '%']].map(([k, l]) => (
                    <button key={k} onClick={() => setTipoDesc(k)}
                      style={{ padding: '5px 10px', fontSize: 11.5, fontWeight: 800, border: 'none', cursor: 'pointer',
                        background: tipoDesc === k ? 'var(--tq)' : 'var(--card)', color: tipoDesc === k ? '#fff' : 'var(--muted)' }}>{l}</button>
                  ))}
                </span>
                <input value={desconto} onChange={e => setDesconto(e.target.value)} inputMode="decimal" placeholder={tipoDesc === 'pct' ? '0' : '0,00'}
                  style={{ ...inputStyle, width: 74, padding: '6px 9px', fontSize: 12.5 }} />
                <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 700, marginLeft: 4 }}>Parcelas</span>
                <select value={parcelas} onChange={e => setParcelas(parseInt(e.target.value))} style={{ ...inputStyle, padding: '6px 9px' }}>
                  {[1, 2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n === 1 ? 'à vista' : `${n}x`}</option>)}
                </select>
              </div>
              {descTravado && (
                <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--err)', marginBottom: 6 }}>
                  ⚠️ Desconto acima de 10% só com a gestão — apliquei o máximo ({fmt.brl(desc)}).
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 900, padding: '8px 0', borderTop: '2px solid var(--border)' }}>
                <span>Total</span><span style={{ color: 'var(--ok,#16a34a)' }}>{fmt.brl(total)}</span>
              </div>
              {parcelas > 1 && <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 700, marginTop: -4, marginBottom: 4, textAlign: 'right' }}>ou {parcelas}x de {fmt.brl(total / parcelas)} no cartão</div>}
              {ultimaConv?.id && (
                <button onClick={enviarPraConversa} className="btn btn-p" style={{ width: '100%', gap: 6, fontWeight: 800, marginTop: 6 }}>
                  <Send size={14} /> Enviar pra conversa{ultimaConv.nome ? ` de ${String(ultimaConv.nome).split(' ')[0]}` : ''}
                </button>
              )}
              <button onClick={copiar} className={ultimaConv?.id ? 'btn' : 'btn btn-p'} style={{ width: '100%', gap: 6, fontWeight: 800, marginTop: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {copiado ? <Check size={14} /> : <Copy size={14} />} {copiado ? 'Copiado!' : 'Copiar orçamento'}
              </button>
              {/* 📄 PDF timbrado — o envio é imediato (arquivo não passa pela caixa), por isso confirma antes */}
              <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                {ultimaConv?.id && (pdfConfirm ? (
                  <span style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 12, fontWeight: 800, color: 'var(--err)' }}>
                    Enviar o PDF agora?
                    <button onClick={enviarPdfConversa} className="btn btn-p btn-sm">Sim</button>
                    <button onClick={() => setPdfConfirm(false)} className="btn btn-sm">Não</button>
                  </span>
                ) : (
                  <button onClick={() => setPdfConfirm(true)} disabled={pdfEnviando} className="btn btn-sm" style={{ flex: 1, gap: 5, fontWeight: 800 }}>
                    <FileText size={13} /> {pdfEnviando ? 'Enviando PDF…' : 'PDF na conversa'}
                  </button>
                ))}
                <button onClick={baixarPdf} disabled={pdfBaixando} className="btn btn-sm" style={{ flex: 1, gap: 5, fontWeight: 800 }}>
                  <Download size={13} /> {pdfBaixando ? 'Gerando…' : 'Baixar PDF'}
                </button>
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 7, lineHeight: 1.5 }}>
                Sai formatado pro WhatsApp (negrito e emoji), com validade de 7 dias (até {validadeTxt}).
                {ultimaConv?.id ? ' O "Enviar" deixa o texto escrito na caixa do Chat — você revisa e aperta enviar.' : ''}
              </div>
            </>
          )}
        </div>
      </div>

      {/* 📚 Últimos orçamentos — memória da proposta */}
      {orcs.itens.length > 0 && (
        <div className="card" style={{ padding: '15px 18px', marginTop: 16 }}>
          <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 8 }}>
            📚 Últimos orçamentos {orcs.gestao && <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>
              (da casa toda · {orcs.itens.filter(o => o.fechado).length} de {orcs.itens.length} viraram venda)</span>}
          </div>
          {orcs.itens.map(o => (
            <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5, padding: '6px 0', borderBottom: '1px dashed var(--border)', flexWrap: 'wrap' }}>
              <span style={{ color: 'var(--muted)', fontWeight: 600, width: 78, flexShrink: 0 }}>{new Date(o.created_at).toLocaleDateString('pt-BR')}</span>
              <span style={{ flex: 1, minWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                <b>{o.cliente_nome || 'Cliente sem nome'}</b>
                <span style={{ color: 'var(--muted)' }}> · {(Array.isArray(o.itens) ? o.itens : []).map(i => i.nome).join(', ')}</span>
              </span>
              {orcs.gestao && <span style={{ color: 'var(--muted)', fontWeight: 600, flexShrink: 0 }}>{String(o.criado_por_nome || '').split(' ')[0]}</span>}
              <b style={{ color: 'var(--tq2)', flexShrink: 0 }}>{fmt.brl(o.total)}</b>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                <button onClick={() => reusar(o)} title="Reaproveitar este orçamento" className="btn btn-sm" style={{ padding: '3px 8px', gap: 4 }}>
                  <RotateCcw size={11} /> Reusar
                </button>
                {o.fechado ? (
                  <span style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--ok,#16a34a)', background: 'rgba(22,163,74,.1)', borderRadius: 7, padding: '3px 8px' }}>✅ Venda</span>
                ) : (orcs.gestao || String(o.criado_por) === String(user?.id)) && (
                  confirmVenda === o.id ? (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11.5, fontWeight: 800 }}>
                      Registrar {fmt.brl(o.total)} no Caixa?
                      <button onClick={() => virouVenda(o)} className="btn btn-p btn-sm" style={{ padding: '3px 8px' }}>Sim</button>
                      <button onClick={() => setConfirmVenda(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 2 }}><X size={12} /></button>
                    </span>
                  ) : (
                    <button onClick={() => setConfirmVenda(o.id)} title="Cliente fechou! Registra a venda no Caixa com estes itens" className="btn btn-sm"
                      style={{ padding: '3px 8px', gap: 4, fontWeight: 800, color: 'var(--ok,#16a34a)', borderColor: 'var(--ok,#16a34a)' }}>
                      💰 Virou venda
                    </button>
                  )
                )}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* 👁️ Visualização do anexo na tela (baixar no celular é chato) */}
      {ver && (
        <div onClick={() => setVer(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.72)', zIndex: 1000, display: 'flex', flexDirection: 'column', padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <span style={{ color: '#fff', fontWeight: 800, fontSize: 14, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ver.nome}</span>
            <button onClick={e => { e.stopPropagation(); const el = document.createElement('a'); el.href = ver.arquivo; el.download = ver.nome; el.click(); }}
              className="btn btn-sm" style={{ gap: 5 }}><Download size={13} /> Baixar</button>
            <button onClick={() => setVer(null)} style={{ background: 'rgba(255,255,255,.15)', border: 'none', borderRadius: 8, cursor: 'pointer', color: '#fff', padding: 6, display: 'flex' }}><X size={16} /></button>
          </div>
          <div onClick={e => e.stopPropagation()} style={{ flex: 1, minHeight: 0, background: '#fff', borderRadius: 12, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {String(ver.mimetype).startsWith('image/')
              ? <img src={ver.arquivo} alt={ver.nome} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
              : String(ver.mimetype).includes('pdf')
                ? <iframe title={ver.nome} src={ver.arquivo} style={{ width: '100%', height: '100%', border: 'none' }} />
                : <div style={{ padding: 30, textAlign: 'center', fontSize: 13, color: '#334' }}>Esse tipo de arquivo não abre aqui na tela — use o botão Baixar. 😉</div>}
          </div>
        </div>
      )}
    </div>
  );
}
