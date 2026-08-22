import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Plus, Trash2, Image as ImgIcon, Video, Star, FileText, X } from 'lucide-react';
import { useApi, useAuth } from '../context/AuthContext.jsx';

/* ─── Biblioteca de Experiências ─────────────────────────────────────────────
   Fotos, vídeos, depoimentos e apresentações por setor. A gestão alimenta;
   a equipe envia na conversa pelo botão 🖼️ do Chat (filtrado pelo setor).
   Esta mesma engine serve a página de Figurinhas (tipo='figurinha').        */

export const TIPOS_BIB = [
  { k: 'foto', l: 'Fotos', Icon: ImgIcon },
  { k: 'video', l: 'Vídeos', Icon: Video },
  { k: 'depoimento', l: 'Depoimentos', Icon: Star },
  { k: 'apresentacao', l: 'Apresentações', Icon: FileText },
];
const SETORES = [['geral', '⭐ Geral'], ['vacinas', '💉 Vacinas'], ['consultas', '🩺 Consultas'], ['terapias', '🧩 Terapias']];

export function GridMidias({ tipoFixo = null, titulo, subtitulo, categorias = null }) {
  const api = useApi();
  const { user, isMaster } = useAuth();
  const gestao = isMaster || user?.role === 'supervisor';
  const [tipo, setTipo] = useState(tipoFixo || 'foto');
  const [setor, setSetor] = useState('');
  const [itens, setItens] = useState([]);
  const [previews, setPreviews] = useState({}); // id -> dataUrl
  const [up, setUp] = useState(null);
  const [erro, setErro] = useState('');
  const [subindo, setSubindo] = useState(false);
  const [zoom, setZoom] = useState(null); // { titulo, src } — visualização em tela cheia
  const fileRef = useRef(null);

  const load = useCallback(() => {
    const q = new URLSearchParams({ tipo });
    if (setor) q.set('setor', setor);
    api.get(`/extras/biblioteca?${q}`).then(setItens).catch(() => {});
  }, [tipo, setor]); // eslint-disable-line
  useEffect(load, [load]);

  // Carrega a prévia (base64) sob demanda, um por vez
  useEffect(() => {
    (async () => {
      for (const it of itens.slice(0, 24)) {
        if (previews[it.id] || it.tipo === 'video') continue;
        try {
          const m = await api.get(`/extras/biblioteca/${it.id}`);
          setPreviews(p => ({ ...p, [it.id]: `data:${m.mime};base64,${m.data}` }));
        } catch {}
      }
    })();
  }, [itens]); // eslint-disable-line

  /* 📎 VÁRIOS ARQUIVOS DE UMA VEZ (pedido do master): seleciona 10 fotos e
     sobe tudo junto — cada uma vira um item da biblioteca. */
  const escolherArquivo = (e) => {
    const files = [...(e.target.files || [])];
    e.target.value = '';
    if (!files.length) return;
    setErro('');
    const lidos = [];
    let pendentes = files.length;
    for (const f of files) {
      const ehVideo = f.type.startsWith('video/');
      const lim = ehVideo ? 12 * 1024 * 1024 : 3 * 1024 * 1024;
      if (f.size > lim) { setErro(`"${f.name}" é muito grande (máx ${ehVideo ? '12MB' : '3MB'}) — ficou de fora.`); pendentes--; continue; }
      const r = new FileReader();
      r.onload = () => {
        lidos.push({ data: String(r.result).split(',')[1], mime: f.type, ehVideo, nomeArq: f.name });
        if (--pendentes === 0 && lidos.length) {
          setUp(u => ({ ...u, arquivos: lidos, data: lidos[0].data, mime: lidos[0].mime, ehVideo: lidos[0].ehVideo, nomeArq: lidos[0].nomeArq }));
        }
      };
      r.readAsDataURL(f);
    }
    if (pendentes === 0 && !lidos.length) return;   // todos grandes demais
  };

  const enviar = async () => {
    setErro('');
    if (!up?.titulo?.trim()) return setErro('Dê um título.');
    const fila = (up.arquivos && up.arquivos.length) ? up.arquivos : (up?.data ? [{ data: up.data, mime: up.mime, ehVideo: up.ehVideo }] : []);
    if (!fila.length) return setErro('Escolha o(s) arquivo(s).');
    setSubindo(true);
    let subidos = 0;
    try {
      for (let i = 0; i < fila.length; i++) {
        const a = fila[i];
        // Vários arquivos: o título vira base numerada ("Sala sensorial — 2")
        const titulo = fila.length > 1 ? `${up.titulo.trim()} — ${i + 1}` : up.titulo.trim();
        await api.post('/extras/biblioteca', {
          titulo, tipo: tipoFixo || (a.ehVideo ? 'video' : tipo),
          setor: up.setor || 'geral', categoria: up.categoria || '', mime: a.mime, data: a.data,
        });
        subidos++;
      }
      setUp(null); load();
    } catch (e) { setErro(`${e.message}${subidos ? ` (${subidos} de ${fila.length} já subiram)` : ''}`); }
    finally { setSubindo(false); }
  };

  const excluir = async (it) => {
    if (!window.confirm(`Excluir "${it.titulo}"?`)) return;
    try { await api.delete(`/extras/biblioteca/${it.id}`); load(); } catch {}
  };

  return (
    <div style={{ padding: 28 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 27, fontWeight: 800 }}>{titulo}</h1>
          <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 2 }}>{subtitulo}</p>
        </div>
        {tipoFixo === 'figurinha' && (
          <button onClick={async () => {
            try {
              const r = await api.post('/extras/figurinhas/seed', {});
              window.alert(`💟 Figurinhas oficiais: ${r.inseridas} carregada(s) agora, ${r.existiam} já estavam na biblioteca.`);
              load();
            } catch (e) { window.alert('Erro ao carregar: ' + e.message); }
          }} className="btn btn-s" style={{ gap: 6, fontWeight: 700 }}>💟 Carregar figurinhas oficiais</button>
        )}
        {gestao && <button onClick={() => setUp({ setor: setor || 'geral' })} className="btn btn-p" style={{ gap: 6 }}><Plus size={14} /> Adicionar</button>}
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {!tipoFixo && TIPOS_BIB.map(({ k, l, Icon }) => (
          <button key={k} onClick={() => setTipo(k)} style={chip(tipo === k)}><Icon size={12} /> {l}</button>
        ))}
        <div style={{ width: 1, background: 'var(--border)', margin: '0 4px' }} />
        <button onClick={() => setSetor('')} style={chip(!setor)}>Todos</button>
        {SETORES.map(([k, l]) => <button key={k} onClick={() => setSetor(k)} style={chip(setor === k)}>{l}</button>)}
      </div>

      {itens.length === 0 && (
        <div className="card" style={{ padding: '44px 20px', textAlign: 'center', color: 'var(--muted)', fontSize: 13.5, background: 'var(--card)' }}>
          Nada por aqui ainda.{gestao ? ' Clique em "Adicionar" pra alimentar a biblioteca. 📸' : ' A gestão vai alimentar em breve. 📸'}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(170px,1fr))', gap: 13 }}>
        {itens.map(it => (
          <div key={it.id} className="card" onClick={() => it.tipo !== 'video' && previews[it.id] && setZoom({ titulo: it.titulo, src: previews[it.id] })}
            style={{ padding: 0, overflow: 'hidden', background: 'var(--card)', cursor: it.tipo !== 'video' ? 'zoom-in' : 'default' }}
            title={it.tipo !== 'video' ? 'Clique pra ver em tamanho grande' : ''}>
            <div style={{ height: 120, background: 'var(--bg2)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
              {it.tipo === 'video'
                ? <Video size={30} color="var(--light)" />
                : previews[it.id]
                  ? <img src={previews[it.id]} alt={it.titulo} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <ImgIcon size={26} color="var(--light)" />}
            </div>
            <div style={{ padding: '9px 11px' }}>
              <div style={{ fontWeight: 700, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.titulo}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 3 }}>
                <span style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 700, textTransform: 'capitalize' }}>{it.setor}{it.categoria ? ` · ${it.categoria}` : ''}</span>
                {gestao && <button onClick={(e) => { e.stopPropagation(); excluir(it); }} style={{ border: 'none', background: 'none', color: 'var(--light)', cursor: 'pointer', padding: 2 }}><Trash2 size={12} /></button>}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 🔍 Visualização em tela cheia (clicou na figurinha/foto → abre grande) */}
      {zoom && (
        <div onClick={() => setZoom(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(3,43,48,.82)', zIndex: 700, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20, cursor: 'zoom-out' }}>
          <img src={zoom.src} alt={zoom.titulo} style={{ maxWidth: 'min(88vw, 520px)', maxHeight: '72vh', borderRadius: 18, boxShadow: '0 20px 60px rgba(0,0,0,.45)', background: '#fff' }} />
          <div style={{ marginTop: 14, color: '#fff', fontWeight: 800, fontSize: 14 }}>{zoom.titulo}</div>
          <div style={{ marginTop: 4, color: 'rgba(255,255,255,.7)', fontSize: 11.5 }}>Toque em qualquer lugar pra fechar</div>
        </div>
      )}

      {up && (
        <div onClick={e => e.target === e.currentTarget && setUp(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(3,43,48,.55)', zIndex: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ width: '100%', maxWidth: 420, background: 'var(--card)', borderRadius: 16, boxShadow: 'var(--s4)', padding: '18px 22px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 13 }}>
              <div style={{ fontWeight: 800, fontSize: 15 }}>Adicionar à biblioteca</div>
              <button onClick={() => setUp(null)} style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--muted)', cursor: 'pointer' }}><X size={14} /></button>
            </div>
            {erro && <div style={{ marginBottom: 10, padding: '8px 12px', borderRadius: 9, background: 'var(--err2)', color: 'var(--err)', fontSize: 12, fontWeight: 600 }}>{erro}</div>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div className="field"><label>Título *</label>
                <input value={up.titulo || ''} maxLength={80} onChange={e => setUp({ ...up, titulo: e.target.value })} placeholder={tipoFixo === 'figurinha' ? 'Ex: Bom dia coração' : 'Ex: Bebê vacinando com Buzzy'} /></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div className="field"><label>Setor</label>
                  <select value={up.setor || 'geral'} onChange={e => setUp({ ...up, setor: e.target.value })}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 10, border: '1.5px solid var(--border)', fontSize: 12.5, background: 'var(--card)', color: 'var(--txt)' }}>
                    {SETORES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </select></div>
                <div className="field"><label>Categoria</label>
                  {categorias
                    ? <select value={up.categoria || ''} onChange={e => setUp({ ...up, categoria: e.target.value })}
                        style={{ width: '100%', padding: '8px 10px', borderRadius: 10, border: '1.5px solid var(--border)', fontSize: 12.5, background: 'var(--card)', color: 'var(--txt)' }}>
                        <option value="">—</option>
                        {categorias.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    : <input value={up.categoria || ''} maxLength={40} onChange={e => setUp({ ...up, categoria: e.target.value })} placeholder="Ex: Buzzy, Domiciliar…" />}
                </div>
              </div>
              <button onClick={() => fileRef.current?.click()} className="btn btn-s" style={{ justifyContent: 'center', gap: 7 }}>
                {up.arquivos?.length > 1 ? `✅ ${up.arquivos.length} arquivos selecionados` : up.data ? `✅ ${up.nomeArq || 'Arquivo escolhido'}` : `Escolher ${tipoFixo === 'figurinha' ? 'imagens (png/webp)' : 'fotos ou vídeos (vários de uma vez)'}`}
              </button>
              <input ref={fileRef} type="file" multiple accept={tipoFixo === 'figurinha' ? 'image/png,image/webp' : 'image/*,video/mp4'} style={{ display: 'none' }} onChange={escolherArquivo} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 13 }}>
              <button onClick={() => setUp(null)} className="btn btn-s">Cancelar</button>
              <button onClick={enviar} disabled={subindo} className="btn btn-p" style={{ opacity: subindo ? .6 : 1 }}>{subindo ? 'Enviando…' : 'Salvar'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const chip = (ativo) => ({
  display: 'flex', alignItems: 'center', gap: 5, padding: '6px 13px', borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: 'pointer',
  border: `1.5px solid ${ativo ? 'var(--tq)' : 'var(--border)'}`,
  background: ativo ? 'var(--tq)' : 'var(--card)', color: ativo ? '#fff' : 'var(--muted)',
});

export default function Biblioteca() {
  return <GridMidias titulo="🖼️ Biblioteca de Experiências" subtitulo="Fotos, vídeos, depoimentos e apresentações — a equipe envia direto na conversa" />;
}
