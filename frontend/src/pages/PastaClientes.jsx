import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Trash2, Star, Database, Phone, CalendarDays, UserPlus, X, Syringe, Stethoscope, Brain, MessageSquare, Pencil, List, Kanban, Check, ArrowRightLeft, Paperclip, FileText, Download, ChevronDown, ChevronRight } from 'lucide-react';
import { useApi, useAuth } from '../context/AuthContext.jsx';
import { fmt, openWA } from '../hooks/utils.js';
import PastaFunil from './PastaFunil.jsx';

const fileToDataUrl = (file) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });

/* Arquivos da aba: PDF/Word/imagem anexados dentro de cada pasta (materiais,
   tabelas de preço, protocolos etc.) — visíveis a todos do setor. */
function ArquivosAba({ chave, cor }) {
  const api = useApi();
  const [arqs, setArqs] = useState([]);
  const [aberto, setAberto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const ref = React.useRef(null);
  const load = () => api.get(`/extras/pasta-arquivos?chave=${chave}`).then(d => setArqs(Array.isArray(d) ? d : [])).catch(() => {});
  useEffect(() => { load(); }, [chave]); // eslint-disable-line
  const enviar = async (e) => {
    const f = e.target.files?.[0]; e.target.value = ''; if (!f) return;
    const url = await fileToDataUrl(f);
    if (url.length > 42_000_000) { setErro('Arquivo muito grande (máx. ~30MB).'); return; }
    setEnviando(true); setErro('');
    try { const a = await api.post('/extras/pasta-arquivos', { chave, nome: f.name, arquivo: url, mimetype: f.type }); setArqs(p => [a, ...p]); setAberto(true); }
    catch (err) { setErro(err.message); }
    setEnviando(false);
  };
  const baixar = async (a) => {
    const d = await api.get(`/extras/pasta-arquivos/${a.id}/download`).catch(() => null);
    if (!d) return;
    const el = document.createElement('a'); el.href = d.arquivo; el.download = d.nome || 'arquivo'; el.click();
  };
  const excluir = async (a) => {
    if (!window.confirm(`Remover "${a.nome}"?`)) return;
    setArqs(p => p.filter(x => x.id !== a.id));
    try { await api.del(`/extras/pasta-arquivos/${a.id}`); } catch { load(); }
  };
  return (
    <div className="card" style={{ padding: '10px 14px', marginBottom: 14, borderLeft: `3px solid ${cor}` }}>
      <input ref={ref} type="file" accept="application/pdf,.doc,.docx,.xls,.xlsx,image/*" style={{ display: 'none' }} onChange={enviar} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button onClick={() => setAberto(a => !a)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 800, fontSize: 13, color: 'var(--txt)', flex: 1 }}>
          {aberto ? <ChevronDown size={15} /> : <ChevronRight size={15} />} <Paperclip size={14} color={cor} /> Arquivos desta aba {arqs.length > 0 && <span style={{ fontSize: 11, color: 'var(--muted)' }}>({arqs.length})</span>}
        </button>
        <button onClick={() => ref.current?.click()} disabled={enviando} className="btn btn-p btn-sm" style={{ gap: 5 }}><Paperclip size={13} /> {enviando ? 'Enviando…' : 'Anexar'}</button>
      </div>
      {erro && <div style={{ fontSize: 12, color: 'var(--err)', fontWeight: 600, marginTop: 6 }}>{erro}</div>}
      {aberto && (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {arqs.length === 0 ? <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>Nenhum arquivo ainda. Anexe PDF, Word, planilha ou imagem.</div>
          : arqs.map(a => (
            <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 10px', background: 'var(--bg2)', borderRadius: 9 }}>
              <FileText size={15} color={cor} style={{ flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.nome}</div>
                <div style={{ fontSize: 10.5, color: 'var(--muted)' }}>{a.criado_por?.split(' ')[0] || ''}{a.created_at ? ` · ${new Date(a.created_at).toLocaleDateString('pt-BR')}` : ''}</div>
              </div>
              <button onClick={() => baixar(a)} title="Baixar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tq2)' }}><Download size={15} /></button>
              <button onClick={() => excluir(a)} title="Remover" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* Pasta de organização de clientes — usada por Fidelidade, Banco de Dados e
   Planos Vacinais. Lista os clientes (por categoria OU por classificação),
   agrupados por MÊS de referência. Permite puxar/cadastrar clientes. */
const CFG = {
  fidelidade:      { titulo: 'Clientes Fidelidade', Icon: Star, cor: '#C4973B', modo: 'categoria',
    sub: 'Clientes que vacinam todo mês (mensalistas). Organizados por mês — marque o dia de vacinação pra não perder ninguém.' },
  banco_dados:     { titulo: 'Banco de Dados', Icon: Database, cor: '#0E8C96', modo: 'categoria',
    sub: 'Contatos que pegaram só 1 vacina e nada mais (ex.: idosos). Organizados por mês de entrada pra nenhum cliente ser esquecido.' },
  planos_vacinais: { titulo: 'Planos Vacinais', Icon: Syringe, cor: '#3b82f6', modo: 'classificacao',
    sub: 'Todos os clientes interessados em planos vacinais, organizados por mês. Puxe atendimentos ou cadastre novos interessados aqui.' },
  vacinacao:       { titulo: 'Vacinação', Icon: Syringe, cor: '#7c5cbf', modo: 'classificacao',
    sub: 'Todos os clientes de vacinação avulsa, organizados por mês. Puxe atendimentos ou cadastre novos.' },
  consultas:       { titulo: 'Consultas', Icon: Stethoscope, cor: '#00B8C0', modo: 'classificacao',
    sub: 'Todos os clientes interessados em consultas, organizados por mês. Puxe atendimentos ou cadastre novos.' },
  terapias:        { titulo: 'Terapias', Icon: Brain, cor: '#C4973B', modo: 'classificacao',
    sub: 'Todos os clientes interessados em terapias, organizados por mês. Puxe atendimentos ou cadastre novos.' },
};

export default function PastaClientes({ categoria, classificacao }) {
  const api = useApi();
  const nav = useNavigate();
  const { user, isMaster } = useAuth();
  const gestao = user?.role === 'master' || user?.role === 'supervisor' || user?.ve_tudo;
  const valor = classificacao || categoria;          // o que filtra a pasta
  const cfg = CFG[valor] || CFG.banco_dados;
  const modo = cfg.modo;                              // 'categoria' | 'classificacao'
  const [lista, setLista] = useState([]);
  const [busca, setBusca] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [modal, setModal] = useState(false);         // modal "Adicionar cliente"
  const [editAlvo, setEditAlvo] = useState(null);    // cliente em edição (nome/telefone)
  const [transfAlvo, setTransfAlvo] = useState(null);// cliente em transferência
  const [vista, setVista] = useState('lista');       // 'lista' (por mês) | 'funil' (Kanban)
  // Carteira individual: atendente vê só a SUA; gestão escolhe de quem ver.
  const [carteira, setCarteira] = useState(gestao ? 'todos' : 'minhas');
  const [equipe, setEquipe] = useState([]);          // atendentes (seletor + transferência)
  const ehFidelidade = valor === 'fidelidade';

  // Dono ao adicionar: atendente vira dono; gestão atribui ao atendente escolhido.
  const donoId = !gestao ? user?.id : (carteira !== 'todos' && carteira !== 'minhas' ? carteira : (carteira === 'minhas' ? user?.id : null));

  useEffect(() => {
    api.get('/leads/meta').then(m => setEquipe((m.users || []).filter(u => u.id !== user?.id))).catch(() => {});
  }, []); // eslint-disable-line

  const load = useCallback(() => {
    setCarregando(true);
    const base = modo === 'classificacao' ? `classificacao=${valor}` : `categoria=${valor}`;
    const cart = !gestao ? '&minhas=true'
      : carteira === 'minhas' ? '&minhas=true'
      : carteira !== 'todos' ? `&responsavel=${carteira}` : '';
    api.get(`/inbox/conversations?${base}${cart}&limit=500`)
      .then(d => setLista(Array.isArray(d?.data) ? d.data : (Array.isArray(d) ? d : [])))
      .catch(() => setLista([]))
      .finally(() => setCarregando(false));
  }, [valor, modo, gestao, carteira]); // eslint-disable-line
  useEffect(load, [load]);

  const tirar = async (c) => {
    if (!window.confirm(`Tirar "${c.contact_name || c.phone}" da pasta? Ele volta para o fluxo normal de atendimento.`)) return;
    setLista(p => p.filter(x => x.id !== c.id));
    try {
      if (modo === 'classificacao') await api.patch(`/inbox/conversations/${c.id}/classificar`, { classificacao: null });
      else await api.patch(`/inbox/conversations/${c.id}/categoria`, { categoria: null });
    } catch { load(); }
  };

  const definirDia = async (c) => {
    const atual = c.pasta_dia ? String(c.pasta_dia) : '';
    const v = window.prompt(`Dia do mês que ${c.contact_name || 'o cliente'} costuma vacinar (1 a 31). Deixe vazio para limpar:`, atual);
    if (v === null) return; // cancelou
    const dia = v.trim() === '' ? null : Math.max(1, Math.min(31, parseInt(v) || 0)) || null;
    setLista(p => p.map(x => x.id === c.id ? { ...x, pasta_dia: dia } : x));
    try { await api.patch(`/inbox/conversations/${c.id}/pasta-dia`, { dia }); } catch { load(); }
  };

  const filtrada = lista.filter(c => {
    const s = busca.toLowerCase().trim();
    if (!s) return true;
    return (c.contact_name || '').toLowerCase().includes(s) || (c.phone || '').includes(s);
  });

  // Agrupa por mês de referência (categoria_em → último contato → criação)
  const refDate = (c) => c.categoria_em || c.last_message_at || c.created_at || null;
  const chaveMes = (c) => { const d = refDate(c); if (!d) return '0000-00'; const dt = new Date(d); return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`; };
  const nomeMes = (chave) => {
    if (chave === '0000-00') return 'Sem data';
    const [y, m] = chave.split('-').map(Number);
    const s = new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    return s.charAt(0).toUpperCase() + s.slice(1);
  };
  const grupos = {};
  for (const c of filtrada) { const k = chaveMes(c); (grupos[k] = grupos[k] || []).push(c); }
  const mesesOrdenados = Object.keys(grupos).sort((a, b) => b.localeCompare(a)); // mais recente primeiro
  // Dentro do mês: por dia de vacinação (quem tem dia primeiro), depois nome
  for (const k of mesesOrdenados) {
    grupos[k].sort((a, b) => {
      const da = a.pasta_dia || 99, db = b.pasta_dia || 99;
      if (da !== db) return da - db;
      return (a.contact_name || a.phone || '').localeCompare(b.contact_name || b.phone || '');
    });
  }

  return (
    <div style={{ padding: '28px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
        <div style={{ width: 42, height: 42, borderRadius: 12, background: cfg.cor + '22', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <cfg.Icon size={22} color={cfg.cor} />
        </div>
        <div>
          <h1 style={{ fontSize: 27, fontWeight: 800 }}>{cfg.titulo}</h1>
          <p style={{ color: 'var(--muted)', fontSize: 13, maxWidth: 620 }}>{cfg.sub}</p>
        </div>
      </div>

      <ArquivosAba chave={valor} cor={cfg.cor} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '18px 0', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 280px', maxWidth: 360 }}>
          <Search size={15} style={{ position: 'absolute', left: 11, top: 11, color: 'var(--muted)' }} />
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por nome ou telefone…"
            style={{ width: '100%', padding: '9px 12px 9px 34px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--card)' }} />
        </div>
        <span style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 700 }}>{filtrada.length} cliente(s){vista === 'lista' ? ` · ${mesesOrdenados.length} mês(es)` : ''}</span>
        {gestao && (
          <select value={carteira} onChange={e => setCarteira(e.target.value)} title="Carteira de"
            style={{ padding: '8px 10px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--card)', fontSize: 12.5, fontWeight: 700 }}>
            <option value="todos">👥 Carteira: Todos</option>
            <option value="minhas">⭐ Minha carteira</option>
            {equipe.map(u => <option key={u.id} value={u.id}>👤 {(u.nome || '').split(' ')[0]}</option>)}
          </select>
        )}
        {/* Alternância Lista (por mês) / Funil (Kanban) */}
        <div style={{ display: 'flex', background: 'var(--card)', borderRadius: 10, border: '1px solid var(--border)', overflow: 'hidden', marginLeft: 'auto' }}>
          {[['lista', 'Lista', List], ['funil', 'Funil', Kanban]].map(([k, l, Ico]) => (
            <button key={k} onClick={() => setVista(k)} title={l}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px', border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 700,
                background: vista === k ? cfg.cor : 'transparent', color: vista === k ? '#fff' : 'var(--muted)' }}>
              <Ico size={14} /> {l}
            </button>
          ))}
        </div>
        <button onClick={() => setModal(true)} className="btn btn-p" style={{ gap: 7 }}>
          <UserPlus size={15} /> Adicionar cliente
        </button>
      </div>

      {carregando ? (
        <div style={{ color: 'var(--muted)', padding: 30 }}>Carregando…</div>
      ) : filtrada.length === 0 ? (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
          <cfg.Icon size={34} color="var(--border)" style={{ marginBottom: 10 }} />
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Nenhum cliente nesta pasta ainda.</div>
          <div style={{ fontSize: 12.5 }}>Use o botão <b>“Adicionar cliente”</b> acima para puxar um atendimento ou cadastrar um novo.</div>
        </div>
      ) : vista === 'funil' ? (
        <PastaFunil api={api} contexto={valor} cor={cfg.cor} lista={filtrada} setLista={setLista} nav={nav} isMaster={isMaster} />
      ) : (
        mesesOrdenados.map(mes => (
          <div key={mes} style={{ marginBottom: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 2px 10px' }}>
              <CalendarDays size={15} color={cfg.cor} />
              <span style={{ fontWeight: 800, fontSize: 14, textTransform: 'capitalize' }}>{nomeMes(mes)}</span>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: '#fff', background: cfg.cor, borderRadius: 20, padding: '1px 9px' }}>{grupos[mes].length}</span>
            </div>
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              {grupos[mes].map((c, i) => (
                <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: i < grupos[mes].length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <div style={{ width: 38, height: 38, borderRadius: '50%', background: cfg.cor, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, flexShrink: 0 }}>
                    {fmt.initials(c.contact_name || c.phone || '?')}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{c.contact_name || fmt.phone(c.phone)}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.phone ? fmt.phone(c.phone) : ''}{c.last_message ? ` · ${c.last_message}` : ''}
                    </div>
                  </div>
                  {ehFidelidade && (
                    <button onClick={() => definirDia(c)} title="Dia do mês que costuma vacinar"
                      style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 8, border: `1px solid ${c.pasta_dia ? cfg.cor : 'var(--border)'}`, background: c.pasta_dia ? cfg.cor + '18' : 'var(--card)', color: c.pasta_dia ? cfg.cor : 'var(--muted)', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
                      <CalendarDays size={13} />{c.pasta_dia ? `dia ${c.pasta_dia}` : 'definir dia'}
                    </button>
                  )}
                  <button onClick={() => nav(`/inbox?conv=${c.id}`)} title="Abrir a conversa no chat" className="btn btn-sm" style={{ padding: '6px 9px' }}><MessageSquare size={13} /></button>
                  <button onClick={() => setTransfAlvo(c)} title="Transferir para outro funil / atendente" className="btn btn-sm" style={{ padding: '6px 9px', color: 'var(--tq2)' }}><ArrowRightLeft size={13} /></button>
                  <button onClick={() => setEditAlvo(c)} title="Editar nome/telefone" className="btn btn-sm" style={{ padding: '6px 9px' }}><Pencil size={13} /></button>
                  <button onClick={() => openWA(c.phone)} title="Abrir no WhatsApp" className="btn btn-sm" style={{ padding: '6px 9px' }}><Phone size={13} /></button>
                  <button onClick={() => tirar(c)} title="Tirar da pasta" className="btn btn-sm" style={{ padding: '6px 9px', color: 'var(--err)' }}><Trash2 size={13} /></button>
                </div>
              ))}
            </div>
          </div>
        ))
      )}

      {modal && (
        <AddClienteModal
          api={api} modo={modo} valor={valor} titulo={cfg.titulo} cor={cfg.cor} donoId={donoId}
          onClose={() => setModal(false)}
          onAdded={() => { setModal(false); load(); }}
        />
      )}
      {editAlvo && (
        <EditarClienteModal
          api={api} cliente={editAlvo} cor={cfg.cor}
          onClose={() => setEditAlvo(null)}
          onSaved={(upd) => { setLista(prev => prev.map(x => x.id === upd.id ? { ...x, ...upd } : x)); setEditAlvo(null); }}
        />
      )}
      {transfAlvo && (
        <TransferirModal
          api={api} cliente={transfAlvo} origem={valor} equipe={equipe} cor={cfg.cor}
          onClose={() => setTransfAlvo(null)}
          onSaved={() => { setTransfAlvo(null); load(); }}
        />
      )}
    </div>
  );
}

/* Transferir o cliente para outro FUNIL (pasta/setor) e/ou outra ATENDENTE. */
const DESTINOS_PASTA = [
  ['vacinacao', '💉 Vacinação', 'cls'], ['planos_vacinais', '🗓️ Planos Vacinais', 'cls'],
  ['consultas', '🩺 Consultas', 'cls'], ['terapias', '🧩 Terapias', 'cls'],
  ['fidelidade', '⭐ Fidelidade', 'cat'], ['banco_dados', '🗄️ Banco de Dados', 'cat'],
];
function TransferirModal({ api, cliente, origem, equipe, cor, onClose, onSaved }) {
  const [dest, setDest] = useState(origem);
  const [resp, setResp] = useState(cliente.responsavel_id || '');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const transferir = async () => {
    setSalvando(true); setErro('');
    try {
      const tipoDest = (DESTINOS_PASTA.find(d => d[0] === dest) || [])[2];
      if (dest !== origem) {
        if (tipoDest === 'cls') await api.patch(`/inbox/conversations/${cliente.id}/classificar`, { classificacao: dest, responsavel_id: resp || undefined });
        else { await api.patch(`/inbox/conversations/${cliente.id}/categoria`, { categoria: dest }); if (resp) await api.patch(`/inbox/conversations/${cliente.id}/assign`, { responsavel_id: resp }); }
      } else if (resp !== (cliente.responsavel_id || '')) {
        await api.patch(`/inbox/conversations/${cliente.id}/assign`, { responsavel_id: resp || null });
      }
      onSaved();
    } catch (e) { setErro(e.message || 'Erro ao transferir'); setSalvando(false); }
  };
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
      <div onClick={e => e.stopPropagation()} className="card" style={{ width: 420, maxWidth: '100%', padding: 0, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '15px 18px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontWeight: 800, fontSize: 15 }}>Transferir {cliente.contact_name || fmt.phone(cliente.phone)}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={18} /></button>
        </div>
        <div style={{ padding: 18 }}>
          {erro && <div style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 9, background: '#fdecec', color: '#c0392b', fontSize: 12.5, fontWeight: 600 }}>{erro}</div>}
          <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: 'var(--muted)', marginBottom: 5 }}>FUNIL / PASTA</label>
          <select value={dest} onChange={e => setDest(e.target.value)} style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--card)', marginBottom: 12 }}>
            {DESTINOS_PASTA.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: 'var(--muted)', marginBottom: 5 }}>ATENDENTE (CARTEIRA)</label>
          <select value={resp} onChange={e => setResp(e.target.value)} style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--card)', marginBottom: 16 }}>
            <option value="">— Sem responsável —</option>
            {equipe.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
          </select>
          <button onClick={transferir} disabled={salvando} className="btn btn-p" style={{ width: '100%', gap: 7, background: cor, borderColor: cor }}>
            {salvando ? <span className="spin" style={{ width: 15, height: 15 }} /> : <ArrowRightLeft size={15} />} Transferir
          </button>
        </div>
      </div>
    </div>
  );
}

/* Modal de edição do cadastro (nome + telefone) do cliente da pasta. */
function EditarClienteModal({ api, cliente, cor, onClose, onSaved }) {
  const [nome, setNome] = useState(cliente.contact_name || '');
  const [tel, setTel] = useState(cliente.phone || '');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const salvar = async () => {
    setSalvando(true); setErro('');
    try {
      const r = await api.patch(`/inbox/conversations/${cliente.id}/contato`, { nome, phone: tel });
      onSaved({ id: cliente.id, contact_name: r.contact_name, phone: r.phone });
    } catch (e) { setErro(e.message || 'Erro ao salvar'); setSalvando(false); }
  };
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
      <div onClick={e => e.stopPropagation()} className="card" style={{ width: 400, maxWidth: '100%', padding: 0, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '15px 18px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontWeight: 800, fontSize: 15 }}>Editar cadastro</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={18} /></button>
        </div>
        <div style={{ padding: 18 }}>
          {erro && <div style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 9, background: '#fdecec', color: '#c0392b', fontSize: 12.5, fontWeight: 600 }}>{erro}</div>}
          <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: 'var(--muted)', marginBottom: 5 }}>NOME</label>
          <input autoFocus value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome do cliente"
            style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--card)', marginBottom: 12 }} />
          <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: 'var(--muted)', marginBottom: 5 }}>TELEFONE</label>
          <input value={tel} onChange={e => setTel(e.target.value)} placeholder="(98) 98888-8888" inputMode="tel"
            style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--card)', marginBottom: 16 }} />
          <button onClick={salvar} disabled={salvando} className="btn btn-p" style={{ width: '100%', gap: 7, background: cor, borderColor: cor }}>
            {salvando ? <span className="spin" style={{ width: 15, height: 15 }} /> : <Check size={15} />} Salvar
          </button>
        </div>
      </div>
    </div>
  );
}

/* Modal "Adicionar cliente": puxar um atendimento existente (busca) ou
   cadastrar um novo só com nome + telefone. */
function AddClienteModal({ api, modo, valor, titulo, cor, donoId, onClose, onAdded }) {
  const [aba, setAba] = useState('buscar');
  const [q, setQ] = useState('');
  const [res, setRes] = useState([]);
  const [buscando, setBuscando] = useState(false);
  const [nome, setNome] = useState('');
  const [tel, setTel] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const jaEsta = (c) => modo === 'classificacao' ? c.classificacao === valor : c.categoria === valor;

  useEffect(() => {
    if (aba !== 'buscar' || q.trim().length < 2) { setRes([]); return; }
    const t = setTimeout(() => {
      setBuscando(true);
      api.get(`/inbox/conversations/buscar?q=${encodeURIComponent(q.trim())}`)
        .then(d => setRes(Array.isArray(d) ? d : [])).catch(() => setRes([]))
        .finally(() => setBuscando(false));
    }, 350);
    return () => clearTimeout(t);
  }, [q, aba]); // eslint-disable-line

  const puxar = async (c) => {
    try {
      if (modo === 'classificacao') await api.patch(`/inbox/conversations/${c.id}/classificar`, { classificacao: valor, responsavel_id: donoId || undefined });
      else {
        await api.patch(`/inbox/conversations/${c.id}/categoria`, { categoria: valor });
        if (donoId) await api.patch(`/inbox/conversations/${c.id}/assign`, { responsavel_id: donoId });
      }
      onAdded();
    } catch (e) { setErro(e.message || 'Erro ao adicionar'); }
  };
  const cadastrar = async () => {
    if (!nome.trim() && !tel.trim()) { setErro('Informe o nome ou o telefone.'); return; }
    setSalvando(true); setErro('');
    const body = modo === 'classificacao'
      ? { nome, phone: tel, classificacao: valor, responsavel_id: donoId || undefined }
      : { nome, phone: tel, categoria: valor, responsavel_id: donoId || undefined };
    try { await api.post('/inbox/conversations/manual', body); onAdded(); }
    catch (e) { setErro(e.message || 'Erro ao cadastrar'); setSalvando(false); }
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
      <div onClick={e => e.stopPropagation()} className="card" style={{ width: 460, maxWidth: '100%', padding: 0, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '15px 18px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontWeight: 800, fontSize: 15 }}>Adicionar a {titulo}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={18} /></button>
        </div>
        <div style={{ display: 'flex', gap: 6, padding: '12px 18px 0' }}>
          {[['buscar', 'Puxar atendimento'], ['novo', 'Cadastrar novo']].map(([k, l]) => (
            <button key={k} onClick={() => { setAba(k); setErro(''); }}
              style={{ padding: '7px 12px', borderRadius: 9, border: '1px solid var(--border)', cursor: 'pointer', fontSize: 12.5, fontWeight: 700,
                background: aba === k ? cor : 'transparent', color: aba === k ? '#fff' : 'var(--muted)' }}>{l}</button>
          ))}
        </div>

        <div style={{ padding: 18 }}>
          {erro && <div style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 9, background: '#fdecec', color: '#c0392b', fontSize: 12.5, fontWeight: 600 }}>{erro}</div>}

          {aba === 'buscar' ? (
            <>
              <div style={{ position: 'relative', marginBottom: 12 }}>
                <Search size={15} style={{ position: 'absolute', left: 11, top: 11, color: 'var(--muted)' }} />
                <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar atendimento por nome ou telefone…"
                  style={{ width: '100%', padding: '9px 12px 9px 34px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--card)' }} />
              </div>
              <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                {buscando ? <div style={{ color: 'var(--muted)', fontSize: 12.5, padding: 12 }}>Buscando…</div>
                  : q.trim().length < 2 ? <div style={{ color: 'var(--muted)', fontSize: 12.5, padding: 12 }}>Digite ao menos 2 letras para buscar.</div>
                  : res.length === 0 ? <div style={{ color: 'var(--muted)', fontSize: 12.5, padding: 12 }}>Nenhum atendimento encontrado.</div>
                  : res.map(c => (
                    <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 4px', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 13 }}>{c.contact_name || fmt.phone(c.phone)}</div>
                        <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>{fmt.phone(c.phone)}{jaEsta(c) ? ' · já está nesta pasta' : ''}</div>
                      </div>
                      <button disabled={jaEsta(c)} onClick={() => puxar(c)} className="btn btn-sm"
                        style={{ padding: '6px 12px', opacity: jaEsta(c) ? .5 : 1 }}>
                        {jaEsta(c) ? 'Já está' : 'Adicionar'}
                      </button>
                    </div>
                  ))}
              </div>
            </>
          ) : (
            <>
              <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: 'var(--muted)', marginBottom: 5 }}>NOME</label>
              <input autoFocus value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome do cliente"
                style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--card)', marginBottom: 12 }} />
              <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: 'var(--muted)', marginBottom: 5 }}>TELEFONE (com DDD)</label>
              <input value={tel} onChange={e => setTel(e.target.value)} placeholder="(98) 98888-8888" inputMode="tel"
                style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--card)', marginBottom: 16 }} />
              <button onClick={cadastrar} disabled={salvando} className="btn btn-p" style={{ width: '100%', gap: 7 }}>
                {salvando ? <span className="spin" style={{ width: 15, height: 15 }} /> : <UserPlus size={15} />} Cadastrar na pasta
              </button>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 9 }}>Se já existir um atendimento com esse telefone, ele é movido para a pasta.</div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
