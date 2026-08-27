import React, { useEffect, useMemo, useState } from 'react';

/* 💟 FIGURINHAS DA VITTALIS — aba própria dentro da conversa (ordem do master,
   24/08: "uma aba só de figurinhas dentro do chat, fora da biblioteca, do lado
   dos emojis"). Um toque envia.

   27/08 — o master cobrou lentidão e figurinha que não aparecia. A causa: cada
   figurinha vinha por uma chamada de API que devolvia base64 dentro de um JSON,
   sem cache, e só as 24 primeiras carregavam sozinhas; o resto dependia de
   passar o mouse por cima (no celular isso nunca acontece). Agora cada uma é um
   ARQUIVO com endereço próprio: o navegador carrega sob demanda, guarda em
   cache e a segunda abertura é instantânea. */

const BASE = import.meta.env.VITE_API_URL || '';
const urlFigurinha = (id) => `${BASE}/api/publico/figurinha/${id}`;

export default function FigurinhasPainel({ convId, api, onClose, onEnviada }) {
  const [itens, setItens] = useState([]);
  const [erro, setErro] = useState('');
  const [aba, setAba] = useState('todas');
  const [enviando, setEnviando] = useState(null);
  const [busca, setBusca] = useState('');

  useEffect(() => {
    api.get('/extras/biblioteca?tipo=figurinha&limite=200')
      .then(d => setItens(Array.isArray(d) ? d : (d?.itens || [])))
      .catch(e => setErro(e.message));
  }, []); // eslint-disable-line

  const categorias = useMemo(() => {
    const c = [...new Set(itens.map(i => i.categoria || 'Vittalis'))];
    c.sort((a, b) => (a === 'Vittalis' ? -1 : b === 'Vittalis' ? 1 : a.localeCompare(b)));
    return c;
  }, [itens]);

  // A ordem vem pronta do servidor (as mais usadas em cima) — aqui só filtra
  const lista = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return itens.filter(i =>
      (aba === 'todas' || (i.categoria || 'Vittalis') === aba) &&
      (!t || String(i.titulo || '').toLowerCase().includes(t))
    );
  }, [itens, aba, busca]);

  const nomeCurto = (t) => String(t || '').replace('Vitta · ', '');

  const enviar = async (it) => {
    if (enviando) return;
    setEnviando(it.id);
    try {
      await api.post(`/inbox/conversations/${convId}/send-midia`, { midiaId: it.id });
      onEnviada?.(it);
      onClose?.();
    } catch (e) { setErro(e.message); }
    setEnviando(null);
  };

  return (
    <div style={{ background: 'var(--card,#fff)', borderTop: '1px solid var(--border)', flexShrink: 0,
      maxHeight: 320, display: 'flex', flexDirection: 'column' }}>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px 6px' }}>
        <span style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: .6 }}>
          💟 Figurinhas da Vittalis
        </span>
        <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar…"
          style={{ flex: 1, minWidth: 90, maxWidth: 190, border: '1px solid var(--border)', background: 'var(--bg)',
            borderRadius: 8, padding: '3px 9px', fontSize: 11.5, color: 'var(--txt)' }} />
        <button onClick={onClose}
          style={{ border: 'none', borderRadius: 8, padding: '3px 10px', cursor: 'pointer',
            background: 'var(--err2,#fde8e8)', color: 'var(--err,#dc2626)', fontSize: 11, fontWeight: 900 }}>✕ Fechar</button>
      </div>

      <div style={{ display: 'flex', gap: 5, padding: '0 12px 8px', overflowX: 'auto' }}>
        {['todas', ...categorias].map(c => (
          <button key={c} onClick={() => setAba(c)}
            style={{ flexShrink: 0, padding: '4px 11px', borderRadius: 99, fontSize: 11, fontWeight: 800, cursor: 'pointer',
              border: `1.5px solid ${aba === c ? 'var(--tq)' : 'var(--border)'}`,
              background: aba === c ? 'var(--tq3,#e6fffb)' : 'var(--bg2)',
              color: aba === c ? 'var(--tq2)' : 'var(--muted)', whiteSpace: 'nowrap' }}>
            {c === 'todas' ? `Todas (${itens.length})` : c}
          </button>
        ))}
      </div>

      {erro && <div style={{ padding: '6px 12px', fontSize: 11.5, color: 'var(--err)' }}>{erro}</div>}

      <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 12px',
        display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(84px, 1fr))', gap: 8 }}>
        {!itens.length && !erro && (
          <div style={{ gridColumn: '1/-1', padding: '22px 4px', textAlign: 'center', color: 'var(--muted)', fontSize: 12.5 }}>
            Carregando as figurinhas da casa…
          </div>
        )}
        {itens.length > 0 && !lista.length && (
          <div style={{ gridColumn: '1/-1', padding: '18px 4px', textAlign: 'center', color: 'var(--muted)', fontSize: 12.5 }}>
            Nenhuma figurinha com esse nome.
          </div>
        )}
        {lista.map(it => (
          <button key={it.id} onClick={() => enviar(it)} title={nomeCurto(it.titulo)}
            style={{ aspectRatio: '1', border: '1px solid var(--border)', borderRadius: 13, cursor: 'pointer',
              background: 'var(--bg2)', padding: 4, display: 'flex', alignItems: 'center', justifyContent: 'center',
              opacity: enviando === it.id ? .5 : 1, transition: 'transform .1s' }}
            onMouseDown={e => { e.currentTarget.style.transform = 'scale(.94)'; }}
            onMouseUp={e => { e.currentTarget.style.transform = 'scale(1)'; }}>
            <img src={urlFigurinha(it.id)} alt={nomeCurto(it.titulo)} loading="lazy" decoding="async"
              style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: 10 }}
              onError={e => { e.currentTarget.replaceWith(Object.assign(document.createElement('span'),
                { textContent: nomeCurto(it.titulo), style: 'font-size:10px;color:var(--muted);text-align:center;line-height:1.3;padding:3px' })); }} />
          </button>
        ))}
      </div>
    </div>
  );
}
