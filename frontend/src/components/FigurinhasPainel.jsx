import React, { useEffect, useMemo, useState } from 'react';

/* 💟 FIGURINHAS DA VITTALIS — aba própria dentro da conversa (ordem do master,
   24/08: "uma aba só de figurinhas dentro do chat, fora da biblioteca, do lado
   dos emojis"). Um toque envia.

   27/08 — o master mostrou o print com quadrados vazios: "não carregam todas".
   Duas causas e dois consertos:
   · cada figurinha vinha por uma chamada de API com base64 dentro de um JSON,
     sem cache. Agora cada uma é um ARQUIVO com endereço próprio, que o
     navegador guarda em cache (segunda abertura é instantânea);
   · quando o arquivo demora ou falha, o quadrado ficava VAZIO, parecendo
     defeito. Agora cada quadrado mostra o NOME da figurinha desde o primeiro
     instante e, se o arquivo não vier, ele tenta o caminho antigo sozinho.
     Vazio nunca mais. */

const BASE = import.meta.env.VITE_API_URL || '';

/* Um quadrado da grade: nome sempre visível por baixo, imagem por cima quando
   chega. Se o endereço novo falhar (backend ainda subindo), cai no antigo. */
function Figurinha({ item, api, enviando, onEnviar, ansiosa }) {
  const [src, setSrc] = useState(`${BASE}/api/publico/figurinha/${item.id}`);
  const [ok, setOk] = useState(false);
  const [tentouPlanoB, setTentouPlanoB] = useState(false);
  const nome = String(item.titulo || '').replace('Vitta · ', '');

  const planoB = () => {
    if (tentouPlanoB) return;
    setTentouPlanoB(true);
    api.get(`/extras/biblioteca/${item.id}`)
      .then(d => { if (d?.data) setSrc(`data:${d.mime || 'image/webp'};base64,${d.data}`); })
      .catch(() => {});
  };

  return (
    <button onClick={() => onEnviar(item)} title={nome}
      /* 📐 Altura FIXA por quadrado. Com aspect-ratio a célula colapsava e as
         figurinhas apareciam empilhadas umas sobre as outras (print do master,
         27/08). Altura fixa + contain resolve em qualquer navegador. */
      style={{ position: 'relative', height: 92, border: '1px solid var(--border)', borderRadius: 13,
        cursor: 'pointer', background: 'var(--bg2)', padding: 5, overflow: 'hidden',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        opacity: enviando ? .5 : 1, transition: 'transform .1s' }}
      onMouseDown={e => { e.currentTarget.style.transform = 'scale(.94)'; }}
      onMouseUp={e => { e.currentTarget.style.transform = 'scale(1)'; }}>
      {/* Nome por baixo: enquanto a arte não chega, a atendente já sabe o que é */}
      <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        textAlign: 'center', fontSize: 10, lineHeight: 1.3, padding: 5, color: 'var(--muted)', fontWeight: 700 }}>
        {nome}
      </span>
      <img src={src} alt={nome} decoding="async" loading={ansiosa ? 'eager' : 'lazy'}
        onLoad={() => setOk(true)} onError={planoB}
        style={{ position: 'relative', maxWidth: '100%', maxHeight: '100%', width: 'auto', height: 'auto',
          objectFit: 'contain', borderRadius: 10, opacity: ok ? 1 : 0, transition: 'opacity .18s' }} />
    </button>
  );
}

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
    c.sort((a, b) => (a === 'Vittalis Premium' ? -1 : b === 'Vittalis Premium' ? 1 : a.localeCompare(b)));
    return c;
  }, [itens]);

  const conta = (c) => itens.filter(i => (i.categoria || 'Vittalis') === c).length;

  // A ordem vem pronta do servidor (as mais usadas em cima) — aqui só filtra
  const lista = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return itens.filter(i =>
      (aba === 'todas' || (i.categoria || 'Vittalis') === aba) &&
      (!t || String(i.titulo || '').toLowerCase().includes(t))
    );
  }, [itens, aba, busca]);

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

  /* 🎨 As abas ganharam destaque (ordem do master, 27/08: "destaca esses botões
     de cima"): a escolhida fica com o fundo da marca e letra branca; as outras,
     com contorno e o número de figurinhas dentro. Dá pra achar de longe. */
  const chip = (ativo) => ({
    flexShrink: 0, padding: '6px 14px', borderRadius: 99, fontSize: 12, fontWeight: 800, cursor: 'pointer',
    display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
    border: `1.5px solid ${ativo ? 'var(--tq)' : 'var(--bord2)'}`,
    background: ativo ? 'linear-gradient(135deg,#00B8C0,#0E8C96)' : 'var(--card)',
    color: ativo ? '#fff' : 'var(--txt2)',
    boxShadow: ativo ? '0 3px 12px rgba(0,184,192,.35)' : 'var(--s1)',
    transition: 'all .14s',
  });
  const selo = (ativo) => ({
    fontSize: 10, fontWeight: 900, padding: '1px 6px', borderRadius: 99,
    background: ativo ? 'rgba(255,255,255,.26)' : 'var(--bg2)',
    color: ativo ? '#fff' : 'var(--muted)',
  });

  return (
    <div style={{ background: 'var(--card,#fff)', borderTop: '1px solid var(--border)', flexShrink: 0,
      maxHeight: 340, display: 'flex', flexDirection: 'column' }}>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px 6px' }}>
        <span style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: .6 }}>
          💟 Figurinhas da Vittalis
        </span>
        <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar…"
          style={{ flex: 1, minWidth: 90, maxWidth: 190, border: '1px solid var(--border)', background: 'var(--bg)',
            borderRadius: 8, padding: '4px 10px', fontSize: 12, color: 'var(--txt)' }} />
        <button onClick={onClose}
          style={{ border: 'none', borderRadius: 8, padding: '3px 10px', cursor: 'pointer',
            background: 'var(--err2,#fde8e8)', color: 'var(--err,#dc2626)', fontSize: 11, fontWeight: 900 }}>✕ Fechar</button>
      </div>

      <div style={{ display: 'flex', gap: 7, padding: '2px 12px 10px', overflowX: 'auto' }}>
        <button onClick={() => setAba('todas')} style={chip(aba === 'todas')}>
          ⭐ Todas <span style={selo(aba === 'todas')}>{itens.length}</span>
        </button>
        {categorias.map(c => (
          <button key={c} onClick={() => setAba(c)} style={chip(aba === c)}>
            {c} <span style={selo(aba === c)}>{conta(c)}</span>
          </button>
        ))}
      </div>

      {erro && <div style={{ padding: '6px 12px', fontSize: 11.5, color: 'var(--err)' }}>{erro}</div>}

      <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 12px',
        display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(92px, 1fr))',
        gridAutoRows: '92px', alignContent: 'start', gap: 8 }}>
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
        {lista.map((it, i) => (
          <Figurinha key={it.id} item={it} api={api} ansiosa={i < 40}
            enviando={enviando === it.id} onEnviar={enviar} />
        ))}
      </div>
    </div>
  );
}
