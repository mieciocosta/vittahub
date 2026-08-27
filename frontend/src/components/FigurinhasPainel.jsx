import React, { useEffect, useMemo, useRef, useState } from 'react';

/* 💟 FIGURINHAS DA VITTALIS — aba própria dentro da conversa (ordem do master,
   24/08: "uma aba só de figurinhas dentro do chat, fora da biblioteca, do lado
   dos emojis"). Abre no mesmo lugar do painel de emoji, com as categorias em
   cima e a grade embaixo. Um toque envia. */

export default function FigurinhasPainel({ convId, api, onClose, onEnviada }) {
  const [itens, setItens] = useState([]);
  const [erro, setErro] = useState('');
  const [aba, setAba] = useState('todas');
  const [enviando, setEnviando] = useState(null);
  const [imgs, setImgs] = useState({});        // id -> data URL (carrega sob demanda)
  const pedidos = useRef(new Set());

  useEffect(() => {
    api.get('/extras/biblioteca?tipo=figurinha&limite=200')
      .then(d => setItens(Array.isArray(d) ? d : (d?.itens || [])))
      .catch(e => setErro(e.message));
  }, []); // eslint-disable-line

  const categorias = useMemo(() => {
    const c = [...new Set(itens.map(i => i.categoria || 'Vittalis'))];
    // A casa primeiro, depois o resto em ordem
    c.sort((a, b) => (a === 'Vittalis' ? -1 : b === 'Vittalis' ? 1 : a.localeCompare(b)));
    return c;
  }, [itens]);

  const lista = useMemo(
    () => (aba === 'todas' ? itens : itens.filter(i => (i.categoria || 'Vittalis') === aba)),
    [itens, aba]
  );

  // Carrega a imagem só de quem está na tela — a grade abre instantânea
  const carregarImg = (id) => {
    if (imgs[id] || pedidos.current.has(id)) return;
    pedidos.current.add(id);
    api.get(`/extras/biblioteca/${id}`)
      .then(d => {
        const src = d?.data ? `data:${d.mime || 'image/webp'};base64,${d.data}` : null;
        if (src) setImgs(p => ({ ...p, [id]: src }));
      })
      .catch(() => {});
  };
  useEffect(() => { lista.slice(0, 24).forEach(i => carregarImg(i.id)); }, [lista]); // eslint-disable-line

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
      maxHeight: 300, display: 'flex', flexDirection: 'column' }}>

      {/* Cabeçalho: título e fechar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px 6px' }}>
        <span style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: .6, flex: 1 }}>
          💟 Figurinhas da Vittalis <span style={{ textTransform: 'none', fontWeight: 600 }}>· toque pra enviar</span>
        </span>
        <button onClick={onClose}
          style={{ border: 'none', borderRadius: 8, padding: '3px 10px', cursor: 'pointer',
            background: 'var(--err2,#fde8e8)', color: 'var(--err,#dc2626)', fontSize: 11, fontWeight: 900 }}>✕ Fechar</button>
      </div>

      {/* Categorias */}
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

      {/* Grade */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 12px',
        display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(84px, 1fr))', gap: 8 }}>
        {!itens.length && !erro && (
          <div style={{ gridColumn: '1/-1', padding: '22px 4px', textAlign: 'center', color: 'var(--muted)', fontSize: 12.5 }}>
            Carregando as figurinhas da casa…
          </div>
        )}
        {lista.map(it => (
          <button key={it.id} onClick={() => enviar(it)} title={it.titulo}
            onMouseEnter={() => carregarImg(it.id)}
            style={{ aspectRatio: '1', border: '1px solid var(--border)', borderRadius: 13, cursor: 'pointer',
              background: 'var(--bg2)', padding: 4, display: 'flex', alignItems: 'center', justifyContent: 'center',
              opacity: enviando === it.id ? .5 : 1, transition: 'transform .1s, box-shadow .12s' }}
            onMouseDown={e => { e.currentTarget.style.transform = 'scale(.94)'; }}
            onMouseUp={e => { e.currentTarget.style.transform = 'scale(1)'; }}>
            {imgs[it.id]
              ? <img src={imgs[it.id]} alt={it.titulo} style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: 10 }} />
              : <span style={{ fontSize: 10, color: 'var(--muted)', textAlign: 'center', lineHeight: 1.3, padding: 3 }}>
                  {String(it.titulo || '').replace('Vitta · ', '')}
                </span>}
          </button>
        ))}
      </div>
    </div>
  );
}
