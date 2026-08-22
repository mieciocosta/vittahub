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
/* Ordem das COLUNAS: vacinas e consultas primeiro, que é o que a equipe manda
   o dia inteiro (pedido do master). Geral fecha a fila. */
const COLUNAS_SETOR = [['vacinas', '💉 Vacinas'], ['consultas', '🩺 Consultas'], ['terapias', '🧩 Terapias'], ['geral', '⭐ Geral']];

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
  /* Colunas por setor (pedido do master): com a foto da conversa entrando
     sozinha, a lista única vira um monte só. Em colunas a equipe bate o olho
     em "vacinas" ou "consultas" e escolhe o que mandar. */
  const [colunas, setColunas] = useState(true);
  const [temMais, setTemMais] = useState(false);
  const [importando, setImportando] = useState(false);
  const fileRef = useRef(null);

  /* A biblioteca cresce todo dia (a foto da conversa entra sozinha), então a
     lista vem por página — sem isso a tela puxaria tudo e iria ficando mais
     lenta a cada semana. */
  const load = useCallback((pulo = 0) => {
    const q = new URLSearchParams({ tipo, limite: '60', pulo: String(pulo) });
    if (setor) q.set('setor', setor);
    api.get(`/extras/biblioteca?${q}`).then(d => {
      const lista = Array.isArray(d) ? d : (d?.itens || []);
      setItens(prev => (pulo ? [...prev, ...lista] : lista));
      setTemMais(Array.isArray(d) ? false : !!d?.tem_mais);
    }).catch(() => {});
  }, [tipo, setor]); // eslint-disable-line
  useEffect(() => { load(0); }, [load]);

  // Carrega a prévia (base64) sob demanda, um por vez
  useEffect(() => {
    (async () => {
      for (const it of itens.slice(0, colunas ? 48 : 24)) {
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

  // Cartão da mídia — o mesmo nas duas visões (lista e colunas)
  const Cartao = ({ it }) => (
    <div className="card" onClick={() => it.tipo !== 'video' && previews[it.id] && setZoom({ titulo: it.titulo, src: previews[it.id] })}
      style={{ padding: 0, overflow: 'hidden', background: 'var(--card)', cursor: it.tipo !== 'video' ? 'zoom-in' : 'default' }}
      title={it.tipo !== 'video' ? 'Clique pra ver em tamanho grande' : ''}>
      <div style={{ height: 110, background: 'var(--bg2)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        {it.tipo === 'video'
          ? <Video size={30} color="var(--light)" />
          : previews[it.id]
            ? <img src={previews[it.id]} alt={it.titulo} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <ImgIcon size={26} color="var(--light)" />}
      </div>
      <div style={{ padding: '8px 10px' }}>
        <div style={{ fontWeight: 700, fontSize: 11.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={it.titulo}>{it.titulo}</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 3 }}>
          <span style={{ fontSize: 9.5, color: 'var(--muted)', fontWeight: 700 }}>
            {it.origem === 'conversa' ? '💬 da conversa' : (it.categoria || it.setor)}
          </span>
          {gestao && <button onClick={(e) => { e.stopPropagation(); excluir(it); }} style={{ border: 'none', background: 'none', color: 'var(--light)', cursor: 'pointer', padding: 2 }}><Trash2 size={12} /></button>}
        </div>
      </div>
    </div>
  );

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
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {gestao && tipoFixo !== 'figurinha' && (
            <button onClick={async () => {
              if (!window.confirm('Trazer para a biblioteca as fotos que já estão nas conversas dos últimos 60 dias?\n\nNão ocupa espaço a mais: a biblioteca aponta para a foto que já está guardada na mensagem.')) return;
              setImportando(true);
              try {
                const r = await api.post('/extras/biblioteca/importar-conversas', { dias: 60 });
                window.alert(`📸 ${r.importadas} foto(s) trazidas (${r.encontradas} encontradas nos últimos ${r.dias} dias).`);
                load(0);
              } catch (e) { window.alert('Erro: ' + e.message); }
              setImportando(false);
            }} className="btn btn-s" style={{ gap: 6 }} disabled={importando}>
              📸 {importando ? 'Trazendo…' : 'Trazer fotos das conversas'}
            </button>
          )}
          {gestao && <button onClick={() => setUp({ setor: setor || 'geral' })} className="btn btn-p" style={{ gap: 6 }}><Plus size={14} /> Adicionar</button>}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {!tipoFixo && TIPOS_BIB.map(({ k, l, Icon }) => (
          <button key={k} onClick={() => setTipo(k)} style={chip(tipo === k)}><Icon size={12} /> {l}</button>
        ))}
        <div style={{ width: 1, background: 'var(--border)', margin: '0 4px' }} />
        <button onClick={() => setSetor('')} style={chip(!setor)}>Todos</button>
        {SETORES.map(([k, l]) => <button key={k} onClick={() => setSetor(k)} style={chip(setor === k)}>{l}</button>)}
        {!setor && (
          <>
            <div style={{ width: 1, background: 'var(--border)', margin: '0 4px' }} />
            <button onClick={() => setColunas(c => !c)} style={chip(colunas)} title="Vacinas e consultas lado a lado">
              {colunas ? '▦ Em colunas' : '☰ Em lista'}
            </button>
          </>
        )}
      </div>

      {itens.length === 0 && (
        <div className="card" style={{ padding: '44px 20px', textAlign: 'center', color: 'var(--muted)', fontSize: 13.5, background: 'var(--card)' }}>
          Nada por aqui ainda.{gestao ? ' Clique em "Adicionar" pra alimentar a biblioteca. 📸' : ' A gestão vai alimentar em breve. 📸'}
        </div>
      )}

      {/* ── COLUNAS POR SETOR ── Pedido do master: vacinas de um lado, consultas
           do outro, pra equipe achar e mandar sem caçar no meio de tudo. */}
      {!setor && colunas ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 14, alignItems: 'start' }}>
          {COLUNAS_SETOR.map(([k, rotulo]) => {
            const doSetor = itens.filter(it => (it.setor || 'geral') === k);
            return (
              <div key={k} className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ padding: '10px 13px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, background: 'var(--card)', zIndex: 1 }}>
                  <b style={{ fontSize: 13 }}>{rotulo}</b>
                  <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--muted)' }}>{doSetor.length}</span>
                </div>
                <div style={{ padding: 10, display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(112px,1fr))', gap: 9, maxHeight: 560, overflowY: 'auto' }}>
                  {doSetor.length === 0 && <div style={{ gridColumn: '1 / -1', fontSize: 11.5, color: 'var(--muted)', padding: '14px 4px', textAlign: 'center' }}>Nada aqui ainda.</div>}
                  {doSetor.map(it => <Cartao key={it.id} it={it} />)}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(170px,1fr))', gap: 13 }}>
          {itens.map(it => <Cartao key={it.id} it={it} />)}
        </div>
      )}

      {temMais && (
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <button onClick={() => load(itens.length)} className="btn btn-s">Carregar mais</button>
        </div>
      )}

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
