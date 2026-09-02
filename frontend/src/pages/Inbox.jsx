import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import {
  Send, Paperclip, Mic, MicOff, Sparkles, Search, RefreshCw, X,
  UserPlus, Hash, Bot, FileText, Volume2, File, Tag,
  Smile, PanelLeftClose, PanelLeftOpen, Play, ChevronUp, Loader2, Zap, Plus,
  CheckCircle2, Clock, MessageCircle, Phone, Image,
  MailOpen, VolumeX, CalendarDays, Bell, Trash2, Sticker, MessageSquare, ChevronLeft } from 'lucide-react';
import { useApi, useAuth } from '../context/AuthContext.jsx';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { fmt, openWA, avatarGrad } from '../hooks/utils.js';
import { Toast } from '../hooks/toast.js';

// Mesma lista do cadastro de lead (LeadModal) — duas listas divergentes fariam
// a mesma base ser classificada de dois jeitos.
const INTERESSES_FAIXA = ['Vacina','Plano Vacinal','Consulta','Terapia','Plano Infantil','Gestante','Outro'];
/* 🩺 Perguntas oficiais da qualificação de consultas/terapias — a lista é do
   master, palavra por palavra. Uma por mensagem, nunca em bloco. */
const PERGUNTAS_QUALIFICACAO = [
  'Olá! Como vai? 😊',
  'O que sua criança tem apresentado, mãe/pai?',
  'Ela já estuda? Como é na escola?',
  'Como ela interage na família?',
  'Como é a interação dela com colegas da mesma faixa etária?',
  'Já tem algum diagnóstico ou encaminhamento?',
  'Tem pediatra ou neuropediatra?',
  'O que espera que a Clínica Vittalis ajude? 💙',
];
import PropostaModal from '../components/PropostaModal.jsx';
import TerapiaOrcamentoModal from '../components/TerapiaOrcamentoModal.jsx';
import Calculadora from '../components/Calculadora.jsx';
import Copiloto from '../components/Copiloto.jsx';
import FigurinhasPainel from '../components/FigurinhasPainel.jsx';

/* ── Icons ──────────────────────────────────────────────────────────────────── */
const WA = ({s=13})=><svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.124.556 4.118 1.523 5.847L0 24l6.302-1.496A11.934 11.934 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.807 9.807 0 01-5.032-1.388l-.361-.214-3.741.888.948-3.651-.235-.374A9.786 9.786 0 012.182 12C2.182 6.58 6.58 2.182 12 2.182S21.818 6.58 21.818 12 17.42 21.818 12 21.818z"/></svg>;
const IG = ({s=13})=><svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>;

/* ── Status de atendimento ──────────────────────────────────────────────────── */
const STATUS_CFG = {
  aberto:          { label: 'Aberto',       color: '#10b981', bg: '#d1fae5', icon: MessageCircle },
  em_atendimento:  { label: 'Em atend.',    color: '#0ea5e9', bg: '#e0f2fe', icon: Clock },
  resolvido:       { label: 'Resolvido',    color: 'var(--muted)', bg: '#f3f4f6', icon: CheckCircle2 },
};
const ITEM_HEIGHT = 80;

// Temperatura do lead — a Vitta classifica e a equipe prioriza os quentes
const SCORE_CFG = {
  quente: { label: 'QUENTE', emoji: '🔥', color: '#dc2626', bg: '#fee2e2', rank: 0 },
  morno:  { label: 'MORNO',  emoji: '🟡', color: '#d97706', bg: '#fef3c7', rank: 1 },
  frio:   { label: 'FRIO',   emoji: '❄️', color: '#2563eb', bg: '#dbeafe', rank: 2 },
};
const scoreRank = (s) => SCORE_CFG[s]?.rank ?? 3;

// Memória do lead → linhas legíveis para a ficha (o que a Vitta já sabe)
function memoriaLinhas(m) {
  if (!m || typeof m !== 'object') return [];
  const L = [];
  const push = (lbl, v) => { if (v) L.push(`${lbl}: ${v}`); };
  push('Paciente', m.paciente); push('Nascimento', m.nascimento); push('Idade', m.idade);
  push('Responsável', m.responsavel); push('Endereço', m.endereco); push('E-mail', m.email);
  if (Array.isArray(m.interesses) && m.interesses.length) L.push(`Interesses: ${m.interesses.join(', ')}`);
  push('Já recebeu proposta', m.proposta_enviada); push('Preferências', m.preferencias); push('Observações', m.observacoes);
  return L;
}

/* ── Avatar ─────────────────────────────────────────────────────────────────── */
const Avatar = React.memo(function Avatar({ conv, size = 38, fontSize = 13 }) {
  const initials = (conv.contact_name || conv.phone || '?').split(' ').slice(0, 2).map(w => w[0] || '?').join('').toUpperCase();
  // Gradiente determinístico por contato (referência WhatsApp/Telegram):
  // cada pessoa tem sempre a mesma cor, iniciais brancas com bom contraste
  const bg = avatarGrad(conv.contact_id || conv.phone || conv.contact_name);
  const badge = Math.round(size * 0.37);
  const icon  = Math.round(size * 0.18);
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', flexShrink: 0, background: bg,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontWeight: 800, fontSize, color: '#fff', letterSpacing: .3,
      textShadow: '0 1px 2px rgba(0,0,0,.18)', position: 'relative', overflow: 'hidden' }}>
      {conv.profile_pic
        ? <img src={conv.profile_pic} alt="" loading="lazy"
            style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover', position: 'absolute', inset: 0 }}
            onError={e => e.target.style.display = 'none'} />
        : initials}
      <span style={{ position: 'absolute', bottom: -1, right: -1, width: badge, height: badge, borderRadius: '50%',
        background: conv.channel === 'whatsapp' ? 'var(--wa)' : 'var(--ig)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid var(--card,#fff)' }}>
        {conv.channel === 'whatsapp' ? <WA s={icon}/> : <IG s={icon}/>}
      </span>
    </div>
  );
});

/* ── StatusBadge ────────────────────────────────────────────────────────────── */
const StatusBadge = ({ status, size = 'sm' }) => {
  const cfg = STATUS_CFG[status] || STATUS_CFG.aberto;
  const Icon = cfg.icon;
  const p = size === 'xs' ? '2px 6px' : '4px 10px';
  const fs = size === 'xs' ? 9.5 : 11.5;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: p,
      borderRadius: 20, background: cfg.bg, color: cfg.color, fontWeight: 700, fontSize: fs, flexShrink: 0 }}>
      <Icon size={size === 'xs' ? 8 : 10} />
      {cfg.label}
    </span>
  );
};

/* ── VirtualList ─────────────────────────────────────────────────────────────── */
function VirtualList({ items, selectedId, onSelect, containerHeight, loadMore, hasMore, loadingMore, usersById, fixadasIds, onToggleFix }) {
  const scrollRef = useRef(null);
  const [scrollTop, setScrollTop] = useState(0);

  const visibleStart = Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - 3);
  const visibleCount = Math.ceil(containerHeight / ITEM_HEIGHT) + 6;
  const visibleEnd   = Math.min(items.length, visibleStart + visibleCount);
  const visibleItems = items.slice(visibleStart, visibleEnd);
  const totalHeight  = items.length * ITEM_HEIGHT;

  const onScroll = useCallback(e => {
    const st = e.currentTarget.scrollTop;
    setScrollTop(st);
    const near = st + containerHeight >= totalHeight - ITEM_HEIGHT * 4;
    if (near && hasMore && !loadingMore) loadMore();
  }, [containerHeight, totalHeight, hasMore, loadingMore, loadMore]);

  return (
    <div ref={scrollRef} onScroll={onScroll}
      style={{ flex: 1, overflowY: 'auto', position: 'relative', height: containerHeight }}>
      <div style={{ height: totalHeight, position: 'relative' }}>
        <div style={{ position: 'absolute', top: visibleStart * ITEM_HEIGHT, left: 0, right: 0 }}>
          {visibleItems.map(c => (
            <ConvoRow key={c.id} conv={c} selected={selectedId === c.id} onSelect={onSelect} usersById={usersById}
              fixada={!!fixadasIds?.has?.(c.id)} onToggleFix={onToggleFix} />
          ))}
        </div>
      </div>
      {loadingMore && (
        <div style={{ textAlign: 'center', padding: 12 }}>
          <Loader2 size={16} color="var(--tq)" style={{ animation: 'spin 1s linear infinite' }} />
        </div>
      )}
    </div>
  );
}

/* ── ConvoRow ────────────────────────────────────────────────────────────────── */
const MEDIA_PREVIEW = {
  '[image]': 'Foto', '[video]': 'Vídeo', '[audio]': 'Áudio',
  '[document]': 'Documento', '[sticker]': 'Figurinha',
};
/* 📥 FILA DE DISTRIBUIÇÃO (ordem do master, 28/08: "Danielle recebe todos os
   leads e distribui... ela fica com essa responsabilidade, e não o sistema").

   Aqui o segredo é distribuir SEM ABRIR a conversa: cada linha traz o que ela
   precisa pra decidir — quem é, o que escreveu, há quanto tempo espera e de que
   setor parece ser — e as iniciais da equipe do lado. Um toque entrega e a
   conversa sai da fila. Quem quiser ler antes é só clicar no nome.

   Lista simples de propósito (sem rolagem virtual): com o corte de 7 dias, a
   fila é pequena — e a fila que cresce demais é sinal de problema, não de tela. */
/* 💎 O QUE É GRANDE FICA COM ELA (ordem do master, 28/08: "a Danielle fica com
   os atendimentos de plano vacinal e com o cliente em potencial pra fechar um
   plano terapêutico grande — e é ela que distribui o resto").

   O selo não decide nada: só chama a atenção pra ela não deixar passar um
   negócio grande no meio da correria da fila. Quem decide é ela, sempre. */
const PISTA_GRANDE = /(plano\s*vacinal|plano\s*fidelidade|pacote|todas as vacinas|calend[áa]rio|terapia|fono|psico|ocupacional|\baba\b|avalia[çc][ãa]o|acompanhamento|mensal)/i;
const ehPotencialAlto = (c) => PISTA_GRANDE.test(String(c.last_message || '')) || c.lead_score === 'quente';

function FilaDistribuicao({ convos, equipe, onSelect, onDistribuir, entregando, eu, grandesPrimeiro, setGrandesPrimeiro }) {
  const iniciais = (n) => String(n || '?').trim().split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase();
  const espera = (c) => Math.max(0, Math.floor((Date.now() - new Date(c.last_message_at || 0).getTime()) / 60000));
  const rotuloEspera = (m) => (m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}` : `${m}m`);
  const setorDe = (c) => c.setor || c.classificacao || null;
  const CORSETOR = { vacinas: '#22c55e', consultas: '#0ea5e9', terapias: '#a855f7' };

  if (!convos.length) {
    return (
      <div style={{ padding: '46px 22px', textAlign: 'center', color: 'var(--muted)' }}>
        <div style={{ fontSize: 34, marginBottom: 8 }}>🎉</div>
        <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--txt)' }}>Fila zerada!</div>
        <div style={{ fontSize: 12.5, marginTop: 4 }}>Todo lead novo já tem uma responsável.</div>
      </div>
    );
  }

  // Ordem: por padrão quem espera há mais tempo; no modo dela, os grandes na frente
  const lista = grandesPrimeiro
    ? [...convos].sort((a2, b2) => (ehPotencialAlto(b2) ? 1 : 0) - (ehPotencialAlto(a2) ? 1 : 0))
    : convos;
  const nGrandes = convos.filter(ehPotencialAlto).length;

  return (
    <div style={{ height: '100%', overflowY: 'auto' }}>
      {/* Atalho de leitura: quantos parecem negociação grande, e o botão de
          jogá-los pra frente da fila */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
        borderBottom: '1px solid var(--border)', background: 'var(--bg)', position: 'sticky', top: 0, zIndex: 2 }}>
        <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700 }}>
          {convos.length} na fila{nGrandes ? ` · ${nGrandes} com cara de negócio grande` : ''}
        </span>
        {nGrandes > 0 && (
          <button onClick={() => setGrandesPrimeiro(v => !v)}
            style={{ marginLeft: 'auto', border: `1px solid ${grandesPrimeiro ? 'var(--gold,#C4973B)' : 'var(--border)'}`,
              background: grandesPrimeiro ? 'var(--gold2,#fdf5e8)' : 'var(--card)',
              color: grandesPrimeiro ? 'var(--gold,#C4973B)' : 'var(--muted)',
              borderRadius: 99, padding: '3px 11px', fontSize: 10.5, fontWeight: 800, cursor: 'pointer' }}>
            💎 Grandes primeiro
          </button>
        )}
      </div>
      {lista.map(c => {
        const min = espera(c);
        const atrasado = min >= 15;   // 15 min esperando = a fila está devendo
        const st = setorDe(c);
        return (
          <div key={c.id} style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)',
            background: atrasado ? 'rgba(220,38,38,.06)' : 'transparent',
            borderLeft: `3px solid ${atrasado ? '#dc2626' : 'transparent'}` }}>
            <div onClick={() => onSelect(c)} style={{ display: 'flex', gap: 9, cursor: 'pointer' }}>
              <div style={{ width: 34, height: 34, borderRadius: '50%', flexShrink: 0, background: 'var(--bg2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: 'var(--muted)' }}>
                {iniciais(c.contact_name)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
                  <b style={{ fontSize: 12.5, color: 'var(--txt)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.contact_name || 'Contato'}
                  </b>
                  <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 800, flexShrink: 0,
                    color: atrasado ? '#dc2626' : 'var(--light)' }}>
                    {atrasado ? '⏰ ' : ''}{rotuloEspera(min)}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {c.last_message || '…'}
                </div>
                <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
                  {st && (
                    <span style={{ fontSize: 8.5, fontWeight: 800, borderRadius: 99,
                      padding: '1px 8px', background: CORSETOR[st] || 'var(--bord2)', color: '#0b1420' }}>{st}</span>
                  )}
                  {/* 💎 Cheiro de negociação grande — plano, pacote, terapia */}
                  {ehPotencialAlto(c) && (
                    <span style={{ fontSize: 8.5, fontWeight: 900, borderRadius: 99, padding: '1px 8px',
                      background: 'var(--gold,#C4973B)', color: '#fff' }}>💎 potencial alto</span>
                  )}
                </div>
              </div>
            </div>

            {/* 🚫 A FILEIRA DE INICIAIS SAIU (ordem do master, 01/09: "retira
                isso, pois já tem dentro de cada conversa para transferência").

                Eram onze botões embaixo de CADA lead — uma parede colorida que
                empurrava a próxima conversa pra fora da tela e repetia o que a
                conversa aberta já faz melhor, com o nome inteiro da colega na
                frente. Aqui a fila volta a ser o que precisa ser: a lista de
                quem está esperando. Abre a conversa e entrega por lá. */}
          </div>
        );
      })}
    </div>
  );
}

const ConvoRow = React.memo(function ConvoRow({ conv, selected, onSelect, usersById, fixada, onToggleFix }) {
  const st = STATUS_CFG[conv.status_atend] || STATUS_CFG.aberto;
  const hasUnread = conv.unread > 0;
  const resp = conv.responsavel_id ? usersById?.[conv.responsavel_id] : null;
  const preview = MEDIA_PREVIEW[conv.last_message] || conv.last_message || '…';
  // Cliente esperando resposta (última msg foi dele): cronômetro de urgência
  const esperando = conv.last_from === 'contact' && !String(conv.contact_id || '').endsWith('@g.us');
  const waitMin = esperando && conv.last_message_at
    ? Math.max(0, Math.floor((Date.now() - new Date(conv.last_message_at).getTime()) / 60000))
    : 0;
  const waitColor = waitMin >= 120 ? '#dc2626' : waitMin >= 30 ? '#f97316' : '#f59e0b';
  const waitLabel = waitMin >= 60 ? `${Math.floor(waitMin / 60)}h${waitMin % 60 ? ' ' + (waitMin % 60) + 'm' : ''}` : `${waitMin}m`;
  return (
    <div onClick={() => onSelect(conv)} className={`conv-row${selected ? ' sel' : ''}`}
      style={{
        display: 'flex', gap: 11, padding: '0 13px', cursor: 'pointer',
        height: ITEM_HEIGHT, alignItems: 'center',
        borderBottom: '1px solid var(--border)',
        borderLeft: `3px solid ${selected ? 'var(--tq)' : hasUnread ? st.color : 'transparent'}`,
      }}>
      <Avatar conv={conv} size={44} fontSize={14} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
          <span style={{ fontWeight: hasUnread ? 800 : 600, fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, marginRight: 6 }}>
            {conv.contact_name || fmt.phone(conv.phone) || '…'}
          </span>
          {/* ⏱ Cronômetro vermelho saiu da lista (pedido do master) — o tempo
              de espera agora mora no painel de perfil da conversa aberta. */}
          <span title={esperando ? `Cliente esperando resposta há ${waitLabel}` : ''}
            style={{ fontSize: 10.5, fontWeight: hasUnread ? 800 : 500, color: esperando && waitMin >= 30 ? waitColor : hasUnread ? 'var(--tq)' : 'var(--light)', flexShrink: 0 }}>
            {fmt.relTime(conv.last_message_at)}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <span style={{ fontSize: 12, color: hasUnread ? 'var(--txt2)' : 'var(--muted)', fontWeight: hasUnread ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
            {preview}
          </span>
          {hasUnread && (
            <span style={{ background: 'var(--tq)', color: '#fff', borderRadius: 10, padding: '1px 7px', fontSize: 10, fontWeight: 800, flexShrink: 0, boxShadow: '0 1px 4px rgba(0,184,192,.4)' }}>
              {conv.unread > 99 ? '99+' : conv.unread}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <StatusBadge status={conv.status_atend} size="xs" />
          {/* 🗑️ Selo de temperatura (QUENTE/MORNO/FRIO) REMOVIDO da lista
              (pedido do master, 22/08) — segue dentro da conversa, na faixa
              de contexto. O 🔥 do lead quente continua ao lado do nome. */}
          {conv.bot_ativo && <span style={{ fontSize: 9, color: 'var(--ok)', fontWeight: 800, background: 'var(--ok2)', padding: '1.5px 6px', borderRadius: 8, letterSpacing: .4 }}>BOT</span>}
          {/* 📌 Botão FIXAR no lugar do selo LEAD (pedido do master): clicou,
              a conversa sobe pra seção Fixadas — que aparece sozinha no topo. */}
          {/* Chamativo de propósito (pedido do master): degradê rosa-roxo com
              brilho quando solta; dourado quando fixada. */}
          {onToggleFix && (
            <button onClick={e => { e.stopPropagation(); onToggleFix(conv); }}
              title={fixada ? 'Desafixar — volta pra lista geral' : 'Fixar conversa — sobe pra sua seção de fixadas (só no seu usuário)'}
              style={{ fontSize: 9, fontWeight: 900, padding: '3px 9px', borderRadius: 9, letterSpacing: .5, cursor: 'pointer', border: 'none',
                background: 'linear-gradient(120deg,#f59e0b,#fcd34d)', color: '#78350f',
                /* Padrão fixo (cobrança do master: uns gordos, outros esticados):
                   nunca quebra linha nem estica — mesmo tamanho em toda linha */
                whiteSpace: 'nowrap', flexShrink: 0, lineHeight: 1.2, flexGrow: 0,
                boxShadow: '0 1px 6px rgba(245,158,11,.5)' }}>
              📌 {fixada ? 'CONVERSA FIXADA' : 'FIXAR CONVERSA'}
            </button>
          )}
          {/* 🗑️ Bolinha de iniciais da responsável REMOVIDA da lista (pedido do
              master, 22/08: "deixe apenas dentro de cada perfil como já está")
              — quem responde pela conversa aparece no cabeçalho e no painel. */}
        </div>
      </div>
    </div>
  );
});

/* ── SearchBar ───────────────────────────────────────────────────────────────── */
function SearchBar({ value, onChange, filter, setFilter, totalUnread, unreadOnly, setUnreadOnly, waiting, setWaiting, setor, setSetor, mostraSetores, modo, setModo, counts, ehDistribuidor }) {
  return (
    <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
      <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
        {[['todas','Todas','todas'],
          /* 📥💬 UMA ABA SÓ PRAS DUAS FILEIRAS (ordem do master, 01/09: "duas
             fileiras uma ao lado da outra, uma de Distribuição e a outra Meus
             atendimentos"). Eram duas abas e ela vivia pulando de uma pra
             outra: entregava um lead, trocava de aba pra ver a própria
             carteira, voltava. Agora as duas ficam abertas ao mesmo tempo. */
          ...(ehDistribuidor ? [['duas','📥 Distribuição · 💬 Meus','aDistribuir']] : []),
          [ 'minhas', ehDistribuidor ? '💬 Meus atendimentos' : 'Minhas', 'minhas'],['naolidas','Não lidas','naoLidas'],['grupos','Grupos','grupos'],['fixadas','📌 Fixadas','fixadas']].map(([k, l, ck]) => {
          const ativo = modo === k;
          return (
            <button key={k} onClick={() => setModo(k)}
              style={{ flex: 1, padding: '5px 3px', borderRadius: 8, fontSize: 10.5, fontWeight: 700, cursor: 'pointer', border: '1.5px solid',
                background: ativo ? 'var(--tq)' : 'var(--card,#fff)', color: ativo ? '#fff' : 'var(--muted)',
                borderColor: ativo ? 'var(--tq)' : 'var(--border)', whiteSpace: 'nowrap' }}>
              {l}{counts?.[ck] != null ? ` ${counts[ck]}` : ''}
            </button>
          );
        })}
        <button onClick={() => setWaiting(p => !p)} title="Fila de atendimento: clientes que mandaram a última mensagem e ainda esperam resposta"
          style={{ padding: '4px 8px', borderRadius: 8, fontSize: 10.5, fontWeight: 700, cursor: 'pointer', border: '1.5px solid',
            background: waiting ? 'var(--warn)' : 'var(--card,#fff)', color: waiting ? '#fff' : 'var(--warn)', borderColor: waiting ? 'var(--warn)' : 'var(--border)' }}>
          <Clock size={10} style={{ verticalAlign:'-1px', marginRight:3 }}/>Sem resposta{counts?.esperando ? ` ${counts.esperando}` : ''}
        </button>
        {totalUnread > 0 && (
          <button onClick={() => setUnreadOnly(p => !p)}
            style={{ padding: '4px 7px', borderRadius: 8, fontSize: 10.5, fontWeight: 700, cursor: 'pointer', border: '1.5px solid',
              background: unreadOnly ? 'var(--tq)' : 'var(--card,#fff)', color: unreadOnly ? '#fff' : 'var(--muted)', borderColor: unreadOnly ? 'var(--tq)' : 'var(--border)' }}>
            🔔{totalUnread}
          </button>
        )}
      </div>
      {mostraSetores && (
        <div style={{ display:'flex', gap:4, marginBottom:8 }}>
          {[['all','Todos'],['vacinas','Vacinas'],['consultas','Consultas'],['terapias','Terapias']].map(([k,l])=>(
            <button key={k} onClick={()=>setSetor(k)}
              style={{ flex:1, padding:'4px 2px', borderRadius:8, fontSize:10.5, fontWeight:700, cursor:'pointer', border:'1.5px solid',
                background: setor===k?'var(--pet)':'var(--card,#fff)', color: setor===k?'#fff':'var(--muted)',
                borderColor: setor===k?'var(--pet)':'var(--border)' }}>{l}</button>
          ))}
        </div>
      )}
      <div style={{ position: 'relative' }}>
        <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', pointerEvents: 'none' }} />
        <input value={value} onChange={e => onChange(e.target.value)}
          placeholder="Nome, número, trecho de mensagem ou documento…"
          style={{ width: '100%', padding: '7px 30px 7px 27px', border: '1.5px solid var(--border)', borderRadius: 8, outline: 'none', fontSize: 12.5, background: 'var(--bg)', color: 'var(--txt)' }}
          onFocus={e => e.target.style.borderColor = 'var(--tq)'} onBlur={e => e.target.style.borderColor = 'var(--border)'} />
        {value && <button onClick={() => onChange('')} style={{ position: 'absolute', right: 7, top: '50%', transform: 'translateY(-50%)', background: 'none', padding: 3, color: 'var(--muted)', cursor: 'pointer', border: 'none' }}><X size={11} /></button>}
      </div>
    </div>
  );
}

/* 🏷️ Primeiro nome DE VERDADE: "Dra. Nágila Maria" mostra "Nágila", não "Dra."
   (cobrança do master, 27/08 — as mensagens antigas apareciam assinadas como
   "Dra."). Vale só pra exibir; o que está gravado não muda. */
const primeiroNomeUtil = (nome) => {
  const partes = String(nome || '').trim().split(/\s+/).filter(Boolean);
  const trat = /^(dr|dra|sr|sra|enf|prof|profa|dr\.|dra\.|sr\.|sra\.|enf\.|prof\.)$/i;
  const util = partes.find(p => !trat.test(p.replace(/\.$/, '')));
  return util || partes[0] || '';
};

/* ── LazyMedia: carrega base64 sob demanda via endpoint ─────────────────────── */
function LazyMedia({ msgId, type, filename, token, onLightbox, fotoSel }) {
  const [src, setSrc]     = useState(null);
  const [loading, setLoading] = useState(false);
  const BASE = import.meta.env.VITE_API_URL || '';

  const load = useCallback(async () => {
    if (src || loading) return;
    setLoading(true);
    try {
      const resp = await fetch(`${BASE}/api/inbox/messages/${msgId}/content`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (resp.redirected || resp.headers.get('Content-Type')?.startsWith('image/') ||
          resp.headers.get('Content-Type')?.startsWith('audio/') ||
          resp.headers.get('Content-Type')?.startsWith('video/') ||
          resp.headers.get('Content-Type')?.includes('pdf')) {
        // Para mídia binária, cria object URL
        const blob = await resp.blob();
        setSrc(URL.createObjectURL(blob));
      } else {
        const text = await resp.text();
        setSrc(text);
      }
    } catch {}
    setLoading(false);
  }, [msgId, src, loading]);

  /* 💟 FIGURINHA (e gif) CARREGAM SOZINHOS (cobrança do master, 27/08: "as
     figurinhas não abrem para o atendente"). Elas caíam aqui e, por não terem
     tratamento próprio, iam parar no fim da função e apareciam como
     "Documento · clique para baixar". São leves: abrem na hora, como no
     WhatsApp, sem clique nenhum. */
  useEffect(() => { if ((type === 'sticker' || type === 'gif') && !src && !loading) load(); }, [type]); // eslint-disable-line

  if (type === 'sticker' || type === 'gif') {
    if (!src) return (
      <div style={{ width:120, height:120, display:'flex', alignItems:'center', justifyContent:'center' }}>
        <Loader2 size={18} style={{animation:'spin 1s linear infinite'}} color="var(--muted)"/>
      </div>
    );
    return <img src={src} alt="figurinha" onClick={()=>onLightbox(src)} className="msg-sticker" style={{ cursor:'pointer' }}/>;
  }

  if (type === 'image') {
    if (!src) return (
      <div onClick={load} style={{ width:160, height:100, background:'var(--bg2)', borderRadius:8, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:6, cursor:'pointer' }}>
        {loading ? <Loader2 size={18} style={{animation:'spin 1s linear infinite'}} color="var(--muted)"/> : <><Image size={22} color="var(--muted)"/><span style={{fontSize:10.5,color:'var(--muted)'}}>Clique para ver</span></>}
      </div>
    );
    return <img src={src} alt="img" onClick={()=>onLightbox(src, msgId)} style={{ maxWidth:220, maxHeight:220, borderRadius:8, display:'block', objectFit:'cover', cursor:'pointer', outline: fotoSel ? '3px solid #22d3ee' : 'none', outlineOffset: 2, opacity: fotoSel ? .85 : 1 }}/>;
  }
  if (type === 'audio') {
    if (!src) return (
      <div onClick={load} style={{ display:'flex', alignItems:'center', gap:8, minWidth:200, padding:'6px 0', cursor:'pointer' }}>
        {loading ? <Loader2 size={14} style={{animation:'spin 1s linear infinite'}} color="var(--tq)"/> : <Volume2 size={14} color="var(--tq)"/>}
        <span style={{fontSize:12,color:'var(--muted)'}}>Clique para carregar áudio</span>
      </div>
    );
    return <div style={{ display:'flex', alignItems:'center', gap:8, minWidth:200 }}><Volume2 size={14} color="var(--tq)"/><audio controls src={src} style={{ flex:1, height:28, minWidth:150 }}/></div>;
  }
  if (type === 'video') {
    if (!src) return (
      <div onClick={load} style={{ width:200, height:120, background:'#000', borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center', gap:6, cursor:'pointer' }}>
        {loading ? <Loader2 size={18} style={{animation:'spin 1s linear infinite'}} color="#fff"/> : <><Play size={24} color="#fff"/></>}
      </div>
    );
    return <video controls src={src} style={{ maxWidth:260, borderRadius:8, display:'block' }}/>;
  }
  // document
  if (!src) return (
    <div onClick={load} style={{ display:'flex', alignItems:'center', gap:9, padding:'8px 10px', background:'rgba(0,0,0,.04)', borderRadius:8, cursor:'pointer' }}>
      <div style={{ width:32, height:32, borderRadius:6, background:'var(--err2)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
        {loading ? <Loader2 size={16} style={{animation:'spin 1s linear infinite'}} color="var(--err)"/> : <FileText size={16} color="var(--err)"/>}
      </div>
      <div><div style={{fontWeight:600,fontSize:12.5}}>{filename||'Documento'}</div><div style={{fontSize:10.5,color:'var(--muted)'}}>Clique para carregar</div></div>
    </div>
  );
  return (
    <a href={src} download={filename} target="_blank" rel="noreferrer"
      style={{ display:'flex', alignItems:'center', gap:9, color:'var(--pet)', fontSize:13, padding:'8px 10px', background:'rgba(0,0,0,.04)', borderRadius:8, textDecoration:'none' }}>
      <div style={{ width:32, height:32, borderRadius:6, background:'var(--err2)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
        <FileText size={16} color="var(--err)"/>
      </div>
      <div><div style={{fontWeight:600,fontSize:12.5}}>{filename||'Documento'}</div><div style={{fontSize:10.5,color:'var(--muted)'}}>Clique para baixar</div></div>
    </a>
  );
}


const estiloAcoesMsg = `.msg-row:hover .msg-acoes { opacity: 1 !important; }`;
if (typeof document !== 'undefined' && !document.getElementById('msg-acoes-css')) {
  const st = document.createElement('style'); st.id = 'msg-acoes-css'; st.textContent = estiloAcoesMsg; document.head.appendChild(st);
}

const MsgItem = React.memo(function MsgItem({ m, prevMsg, contactName, channel, onLightbox, token, onEditar, onApagar, onTrocarRemetente, fotoSel }) {
  const isMe = m.from_type==='me', isBot=m.from_type==='bot', isSys=m.from_type==='system';
  // Usa prevMsg em vez do array msgs inteiro — React.memo agora é eficaz
  const showDate = !prevMsg || new Date(prevMsg.created_at).toDateString() !== new Date(m.created_at).toDateString();
  const showSender = isMe && m.sender_nome && (!prevMsg || prevMsg.from_type !== 'me' || prevMsg.sender_nome !== m.sender_nome);
  const lazyMatch = m.content?.match(/^\[media:([a-f0-9-]+)\]$/);
  const isLazy = !!lazyMatch;
  const lazyId = lazyMatch?.[1] || m.id;
  // Paleta por classe CSS (.bub-pN) — tem versão clara E escura no index.css,
  // resolvendo o contraste ruim do modo escuro (texto claro em pastel claro)
  const bubClass = useMemo(() => {
    if (isBot) return 'bub bub-bot';
    if (!isMe) return 'bub bub-contact';
    const name = m.sender_nome || 'Equipe';
    let h = 0; for (let c of name) h = ((h << 5) - h) + c.charCodeAt(0);
    return `bub bub-p${Math.abs(h) % 5}`;
  }, [m.sender_nome, isMe, isBot]);
  return (
    <React.Fragment>
      {showDate && (
        <div style={{ textAlign:'center', margin:'10px 0 6px' }}>
          <span className="msg-date-pill" style={{ borderRadius:20, padding:'3px 14px', fontSize:10.5, fontWeight:500 }}>
            {new Date(m.created_at).toLocaleDateString('pt-BR', { weekday:'long', day:'2-digit', month:'short' })}
          </span>
        </div>
      )}
      {m.from_type === 'interno' ? (
        /* 🔎 Nota INTERNA da Vitta (análise de foto etc.) — só a equipe vê */
        <div style={{ display:'flex', justifyContent:'center', margin:'6px 0' }}>
          <div style={{ maxWidth:'86%', background:'linear-gradient(135deg,#fffbeb,#fef3c7)', border:'1px solid #fcd34d', borderRadius:14, padding:'10px 14px', boxShadow:'0 2px 10px rgba(217,119,6,.12)' }}>
            <div style={{ fontSize:10, fontWeight:800, letterSpacing:.6, textTransform:'uppercase', color:'#b45309', marginBottom:4, display:'flex', alignItems:'center', gap:5 }}>
              🔎 {m.sender_nome || 'Vitta · Análise'} <span style={{ fontWeight:600, textTransform:'none', letterSpacing:0, color:'#d97706' }}>· só a equipe vê</span>
            </div>
            <div style={{ fontSize:12.5, lineHeight:1.6, color:'#78350f', whiteSpace:'pre-wrap' }}>{m.content}</div>
            <div style={{ fontSize:9.5, color:'#b45309', opacity:.7, marginTop:4, textAlign:'right' }}>{fmt.msgTime(m.created_at)}</div>
          </div>
        </div>
      ) : isSys ? (
        <div style={{ textAlign:'center', margin:'3px 0' }}>
          <span style={{ background:'var(--ok2)', color:'var(--ok)', borderRadius:8, padding:'3px 14px', fontSize:10.5, fontWeight:600 }}>✓ {m.content}</span>
        </div>
      ) : (
        <div className="msg-row" data-msgid={m.id} style={{ display:'flex', alignItems:'center', gap:5, justifyContent:isMe||isBot?'flex-end':'flex-start', marginBottom:2 }}>
          {/* Mensagem da IA (Mary) também pode ser editada/apagada — pedido do master */}
          {(isMe || isBot) && m.status !== 'deleted' && (onEditar || onApagar) && (() => {
            /* Ações SEMPRE meio visíveis (antes era só no hover — no celular
               nunca apareciam, e o master achou que editar a IA não existia).
               Lápis após os 15 min do WhatsApp: aparece apagadinho e explica. */
            const podeEditar = m.type === 'text' && (Date.now() - new Date(m.created_at).getTime()) <= 15*60*1000;
            return (
            <span className="msg-acoes" style={{ display:'flex', gap:3, opacity:.5, transition:'opacity .15s' }}>
              {onEditar && m.type === 'text' && (
                <button onClick={() => podeEditar ? onEditar(m) : Toast.show('O WhatsApp só permite editar até 15 minutos após o envio — depois disso, apague e mande de novo.', 'info')}
                  title={podeEditar ? 'Editar (até 15 min)' : 'O WhatsApp só permite editar até 15 min após o envio'}
                  style={{ width:24, height:24, borderRadius:8, border:'1px solid var(--border)', background:'var(--card,#fff)',
                    color:'var(--muted)', cursor:'pointer', fontSize:11, display:'flex', alignItems:'center', justifyContent:'center', opacity: podeEditar ? 1 : .4 }}>✏️</button>
              )}
              {onApagar && (
                <button onClick={() => onApagar(m)} title="Apagar pra todos"
                  style={{ width:24, height:24, borderRadius:8, border:'1px solid var(--border)', background:'var(--card,#fff)', color:'var(--err)', cursor:'pointer', fontSize:11, display:'flex', alignItems:'center', justifyContent:'center' }}>🗑</button>
              )}
              {/* 👤 TROCAR QUEM ASSINA (ordem do master, 27/08: "esqueci de mudar
                  o usuário na hora de enviar"). Só gestão vê. Muda o nome de quem
                  aparece como remetente sem apagar e mandar de novo. */}
              {onTrocarRemetente && (
                <button onClick={() => onTrocarRemetente(m)} title="Trocar quem enviou esta mensagem"
                  style={{ width:24, height:24, borderRadius:8, border:'1px solid var(--border)', background:'var(--card,#fff)', color:'var(--tq2)', cursor:'pointer', fontSize:11, display:'flex', alignItems:'center', justifyContent:'center' }}>👤</button>
              )}
            </span>
            );
          })()}
          <div className={m.type==='sticker' ? '' : bubClass} style={{ maxWidth:'90%',
            borderRadius:isMe||isBot?'16px 16px 4px 16px':'16px 16px 16px 4px',
            padding: m.type==='sticker' ? '2px' : '8px 11px',
            background: m.type==='sticker' ? 'transparent' : undefined,
            boxShadow: m.type==='sticker' ? 'none' : '0 1px 2px rgba(0,0,0,.05)' }}>
            {(isBot||showSender) && (
              <div className="bub-tag" style={{ fontSize:10, fontWeight:700, marginBottom:3 }}>
                {/* Rótulo da bolha: só o nome assinado (Mary ou o da responsável).
                    SEM selo "IA" — ordem do master; quem diz que a IA está na
                    conversa é o letreiro roxo, não a bolha. */}
                {isBot ? (primeiroNomeUtil(m.sender_nome) || 'Mary') : primeiroNomeUtil(m.sender_nome)}
              </div>
            )}
            {isLazy && <LazyMedia msgId={lazyId} type={m.type} filename={m.filename} token={token} onLightbox={onLightbox} fotoSel={fotoSel}/>}
            {!isLazy && m.type==='text'     && (
              m.status === 'deleted'
                ? <div style={{ fontSize:13, fontStyle:'italic', color:'var(--light)' }}>🚫 Mensagem apagada</div>
                : <div style={{ fontSize:13.5, lineHeight:1.55, whiteSpace:'pre-wrap', wordBreak:'break-word' }}>{m.content}{m.editada ? <span style={{ fontSize:10, color:'var(--light)', marginLeft:6 }}>(editada)</span> : null}</div>
            )}
            {!isLazy && m.type==='image'    && <img onClick={()=>onLightbox(m.content, m.id)} src={m.content} alt="img" loading="lazy" style={{ maxWidth:220, maxHeight:220, borderRadius:8, display:'block', objectFit:'cover', cursor:'pointer', outline: fotoSel ? '3px solid #22d3ee' : 'none', outlineOffset: 2, opacity: fotoSel ? .85 : 1 }} onError={e=>e.target.style.display='none'}/>}
            {!isLazy && m.type==='sticker'  && <img onClick={()=>onLightbox(m.content)} src={m.content} alt="figurinha" loading="lazy" className="msg-sticker" onError={e=>e.target.style.display='none'}/>}
            {!isLazy && m.type==='gif'      && <video autoPlay loop muted playsInline src={m.content} style={{ maxWidth:220, borderRadius:10, display:'block' }} onError={e=>e.target.style.display='none'}/>}
            {!isLazy && m.type==='audio'    && <div style={{ minWidth:200 }}>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}><Volume2 size={14} color="var(--tq)"/><audio controls src={m.content} style={{ flex:1, height:28, minWidth:150 }}/></div>
              {m.transcricao && <div style={{ fontSize:11, color:'var(--muted)', marginTop:4, fontStyle:'italic', maxWidth:320, lineHeight:1.45 }}>📝 {m.transcricao}</div>}
            </div>}
            {!isLazy && m.type==='video'    && <video controls src={m.content} style={{ maxWidth:260, borderRadius:8, display:'block' }}/>}
            {!isLazy && m.type==='document' && (
              <a href={m.content} download target="_blank" rel="noreferrer"
                style={{ display:'flex', alignItems:'center', gap:9, color:'var(--pet)', fontSize:13, padding:'8px 10px', background:'rgba(0,0,0,.04)', borderRadius:8, textDecoration:'none' }}>
                <div style={{ width:32, height:32, borderRadius:6, background:'var(--err2)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <FileText size={16} color="var(--err)"/>
                </div>
                <div><div style={{fontWeight:600,fontSize:12.5}}>{m.filename||'Documento'}</div><div style={{fontSize:10.5,color:'var(--muted)'}}>Clique para baixar</div></div>
              </a>
            )}
            <div style={{ fontSize:10, color:'var(--light)', marginTop:4, textAlign:'right', display:'flex', alignItems:'center', justifyContent:'flex-end', gap:3 }}>
              {fmt.msgTime(m.created_at||m.timestamp)}
              {isMe&&<span style={{ color:m.status==='delivered'||m.status==='read'?'var(--tq)':'var(--light)' }}>{m.status==='delivered'||m.status==='read'?'✓✓':'✓'}</span>}
            </div>
          </div>
        </div>
      )}
    </React.Fragment>
  );
});

/* ═══════════════════════════════════════════════════════════════
   MAIN INBOX
═══════════════════════════════════════════════════════════════ */
// Chime suave de notificação (WebAudio — dois tons, sem arquivo de áudio = leve)
let _audioCtx = null;
function playChime() {
  try {
    _audioCtx = _audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const ctx = _audioCtx;
    if (ctx.state === 'suspended') ctx.resume();
    const t0 = ctx.currentTime;
    [[880, 0], [1175, 0.09]].forEach(([freq, dt]) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = freq;
      g.gain.setValueAtTime(0, t0 + dt);
      g.gain.linearRampToValueAtTime(0.18, t0 + dt + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dt + 0.35);
      o.connect(g); g.connect(ctx.destination);
      o.start(t0 + dt); o.stop(t0 + dt + 0.4);
    });
  } catch {}
}

export default function Inbox({ onUnreadChange }) {
  const api   = useApi();
  const { user } = useAuth();
  const token = localStorage.getItem('vh_token') || '';

  // ── Lista ──────────────────────────────────────────────────────────────────
  const [convos, setConvos]           = useState([]);
  const [listWidth, setListWidth]     = useState(() => {
    /* 📏 Largura da lista de conversas: começa larga (o master pediu) e LEMBRA
       do ajuste de cada um — antes voltava pros 300px a cada abertura. */
    try { const v = parseInt(localStorage.getItem('vh_lista_largura')); if (v >= 240 && v <= 620) return v; } catch { /* ok */ }
    return 380;
  });
  const nav                           = useNavigate();
  const resizing                      = useRef(false);
  const [provaEnviando, setProvaEnviando] = useState(false);   // 📸 envio do conjunto de fotos
  const [cartaoBusy, setCartaoBusy] = useState(false);         // 🗓️ montando o cartão de agendamento
  const [assinarComo, setAssinarComo] = useState('');          // ✍️ gestão escrevendo no nome da dona
  const [entregando, setEntregando] = useState(null);          // 📥 lead sendo distribuído
  /* 📤 A ENTREGA DO LEAD — uma função só, usada pela aba de distribuição e
     pelas duas fileiras. A linha sai da fila na hora; se o servidor recusar, a
     lista se recarrega e ela volta. */
  const distribuirLead = async (c, p) => {
    if (entregando) return;
    setEntregando(c.id);
    try {
      await api.patch(`/inbox/conversations/${c.id}/transferir`, { para_id: p.id });
      setConvos(prev => prev.map(x => x.id === c.id
        ? { ...x, responsavel_id: p.id, responsavel_nome: p.nome }   // muda de fileira na hora
        : x));
      Toast.show(`Entregue para ${String(p.nome).split(' ')[0]} 📤`, 'success');
    } catch (e) { Toast.show(e.message || 'Não consegui entregar', 'error'); loadConvos(); }
    setEntregando(null);
  };
  const [grandesPrimeiro, setGrandesPrimeiro] = useState(false); // 💎 negócios grandes na frente
  const [total, setTotal]             = useState(0);
  const [page, setPage]               = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore]         = useState(true);
  const LIMIT = 50;

  // ── Filtros ────────────────────────────────────────────────────────────────
  const [search, setSearch]         = useState('');
  const [filter, setFilter]         = useState('all');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [quentesPrimeiro, setQuentesPrimeiro] = useState(false); // prioriza leads quentes

  // ── UI state ───────────────────────────────────────────────────────────────
  const [listCollapsed, setListCollapsed] = useState(false);
  const [sel, setSel]                     = useState(null);
  const [msgs, setMsgs]                   = useState([]);
  const [msgsTotal, setMsgsTotal]         = useState(0);
  const [msgsHasMore, setMsgsHasMore]     = useState(false);
  const [loadingOlderMsgs, setLoadingOlderMsgs] = useState(false);
  const [input, setInput]     = useState('');
  // 🩺 Anamnese de ouro (lista do master) — painel "Confira as perguntas a realizar"
  const [perguntasOpen, setPerguntasOpen] = useState(false);
  const [sending, setSending] = useState(false); // guard: evita envios duplos
  const [recording, setRecording] = useState(false);
  const [recorder, setRecorder]   = useState(null);
  /* 🤖 Assistente de vendas: FORA do lado da conversa por padrão (ordem do
     master, 24/08: "retira a IA que fica do lado direito"). Ela só aparece se
     a atendente pedir, no botão 🤖 IA do cabeçalho. */
  const [showAI, setShowAI]     = useState(false);
  const [agendarOpen, setAgendarOpen] = useState(false); // modal de agendamento
  const [iaAgendaBusy, setIaAgendaBusy] = useState(false); // IA sugerindo agendamento
  const [metaSetor, setMetaSetor] = useState(null);       // meta global do setor (banner no atendimento)
  const [agSaving, setAgSaving] = useState(false);
  const [transfOpen, setTransfOpen] = useState(false);   // modal de transferência
  const [atendentes, setAtendentes] = useState([]);
  const [transfSaving, setTransfSaving] = useState(false);
  const [vendaOpen, setVendaOpen] = useState(false);     // modal de registrar venda
  const [vendaSaving, setVendaSaving] = useState(false);
  const [vendaErro, setVendaErro] = useState('');
  const [vendaForm, setVendaForm] = useState({ categoria:'', valor:'', desconto:'', forma_pagamento:'', status_pagamento:'pago', servico:'', observacao:'', ligou:false });
  const [perderOpen, setPerderOpen] = useState(false);
  const [perderSaving, setPerderSaving] = useState(false);
  const [perderForm, setPerderForm] = useState({ motivo:'', observacao:'', valor_potencial:'' });
  const [followOpen, setFollowOpen] = useState(false);
  const [followSaving, setFollowSaving] = useState(false);
  const [followForm, setFollowForm] = useState({ data:'', motivo:'' });
  const [moreOpen, setMoreOpen] = useState(false); // menu "Mais" do cabeçalho
  const hojeISO = new Date().toISOString().slice(0,10);
  const [agForm, setAgForm] = useState({ data: hojeISO, hora: '', servico: '', valor: '', observacoes: '', setor: 'consultas' });
  const [showInfo, setShowInfo] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  // 💟 Aba própria das figurinhas, ao lado dos emojis (ordem do master, 24/08)
  const [showFigus, setShowFigus] = useState(false);
  /* 🎨 UX (ordem do master, 24/08: "a tela está visualmente poluída"). Os botões
     de ação do cabeçalho passam a ter UM visual calmo; cor forte fica reservada
     pra meta. E o que não é do dia a dia sai da barra e vai pro menu "Mais". */
  const [maisAberto, setMaisAberto] = useState(false);
  const [showProntas, setShowProntas] = useState(false); // 📝 mensagens prontas (pra quem não usa a IA)
  const [encOpen, setEncOpen] = useState(false);         // 📤 encaminhar conversa pra outro canal
  const [encForm, setEncForm] = useState({ destino: '', mensagens: 20, observacao: '' });
  const [encSaving, setEncSaving] = useState(false);
  const [encDestino, setEncDestino] = useState(null);    // destino único salvo (Planos Vacinais)
  const [filePreview, setFilePreview] = useState(null);
  const [showQR, setShowQR]     = useState(false);
  const [qr, setQr]             = useState([]);
  const [lightbox, setLightbox] = useState(null);
  /* 🖼️ MODO EXPORTAR FOTOS (pedido do master): liga as caixinhas nas fotos da
     conversa, seleciona várias e manda tudo pra Biblioteca de uma vez. O
     servidor baixa as que forem URL do WhatsApp (o navegador não consegue). */
  const [fotosModo, setFotosModo] = useState(false);
  const [fotosSel, setFotosSel] = useState({});           // msgId -> src
  const fotosModoRef = React.useRef(false);
  useEffect(() => { fotosModoRef.current = fotosModo; if (!fotosModo) setFotosSel({}); }, [fotosModo]);
  const abrirOuSelecionar = useCallback((src, mid) => {
    if (fotosModoRef.current && mid) {
      setFotosSel(p => { const n = { ...p }; if (n[mid]) delete n[mid]; else n[mid] = src; return n; });
    } else setLightbox(src);
  }, []);
  const exportarFotos = async (setorDest, rot) => {
    const fontes = Object.values(fotosSel);
    if (!fontes.length) return Toast.show('Toque nas fotos pra selecionar primeiro.', 'info');
    try {
      const d = await api.post('/extras/biblioteca/da-conversa', {
        fotos: fontes, setor: setorDest, titulo: `Foto da conversa — ${sel?.contact_name || 'cliente'}` });
      Toast.show(`${d.salvas} foto(s) salvas na Biblioteca (${rot})${d.falhas ? ` — ${d.falhas} não deram` : ''}. Confirme a autorização de imagem! 📚`, 'success');
      setFotosModo(false);
    } catch (e) { Toast.show(e.message, 'error'); }
  };
  const [waiting, setWaiting] = useState(false);
  const [setorFiltro, setSetorFiltro] = useState('all');
  const [searchParams, setSearchParams] = useSearchParams();
  const clsFiltro = searchParams.get('cls') || 'all';
  const respFiltro = searchParams.get('responsavel') || '';   // 🧭 veio do Painel Comercial
  const [setorResumo, setSetorResumo] = useState(null);
  useEffect(() => {
    const reais = ['vacinacao','planos_vacinais','fidelidade','consultas','terapias'];
    if (!reais.includes(clsFiltro)) { setSetorResumo(null); return; }
    const load = () => api.get(`/inbox/setor-resumo?cls=${clsFiltro}`).then(setSetorResumo).catch(()=>setSetorResumo(null));
    load(); const t = setInterval(load, 20000); return () => clearInterval(t);
  }, [clsFiltro]); // eslint-disable-line
  /* 📥💬 AS DUAS FILEIRAS ABREM SOZINHAS (ordem do master, 01/09, pedida três
     vezes: "quero duas fileiras uma ao lado da outra").

     Elas já existiam, mas atrás de uma aba — e aba que precisa ser descoberta
     é aba que não existe. Pra quem DISTRIBUI (o master e a Danielle), o chat
     agora abre já com as duas: Distribuição de um lado, a carteira dela do
     outro. A escolha fica guardada: trocou de aba, o sistema respeita na
     próxima vez. Pra quem não distribui, nada muda. */
  const [modo, setModo] = useState(() => {
    try {
      const guardado = localStorage.getItem('vh_modo_lista');
      if (guardado) return guardado;
    } catch { /* navegador sem storage: segue o padrão */ }
    return (user?.role === 'master' || user?.distribuidor === true) ? 'duas' : 'todas';
  });
  useEffect(() => { try { localStorage.setItem('vh_modo_lista', modo); } catch { /* ok */ } }, [modo]);
  /* Se o servidor confirmar que ela distribui e ela ainda não escolheu nada, as
     duas fileiras abrem sozinhas. Só uma vez: escolha dela sempre manda. */
  const jaAbriuDuas = useRef(false);
  useEffect(() => {
    if (jaAbriuDuas.current || counts?.souDistribuidor !== true) return;
    jaAbriuDuas.current = true;
    let escolheu = null;
    try { escolheu = localStorage.getItem('vh_modo_lista'); } catch { /* ok */ }
    if (!escolheu || escolheu === 'todas') setModo('duas');
  }, [counts?.souDistribuidor]); // eslint-disable-line
  /* 📂 Quem supervisiona vê a pasta de cada colega (ordem do master, 01/09).
     Gestão aqui = master, supervisora, ve_tudo e quem distribui. */
  const ehGestaoTela = user?.role === 'master' || user?.role === 'supervisor'
    || user?.ve_tudo === true || user?.distribuidor === true;
  const abrirPastaDe = (id) => {
    const p = new URLSearchParams(searchParams);
    if (id) p.set('responsavel', String(id)); else p.delete('responsavel');
    setSearchParams(p, { replace: true });
  };
  // A fila e as pastas precisam da equipe carregada (iniciais e nomes)
  useEffect(() => {
    if (atendentes.length) return;
    if (modo !== 'distribuir' && !ehGestaoTela) return;
    api.get('/inbox/atendentes').then(d => setAtendentes(Array.isArray(d) ? d : [])).catch(() => {});
  }, [modo, ehGestaoTela]); // eslint-disable-line
  const [counts, setCounts] = useState(null);
  const [somAtivo, setSomAtivo] = useState(() => localStorage.getItem('vh_sound') !== 'off');
  const somRef = useRef(true);
  useEffect(() => { somRef.current = somAtivo; localStorage.setItem('vh_sound', somAtivo ? 'on' : 'off'); }, [somAtivo]);
  useEffect(() => { localStorage.setItem('vh_ia_aberta', showAI ? 'on' : 'off'); }, [showAI]);
  const [showProposta, setShowProposta] = useState(false);
  const [showTerapia, setShowTerapia] = useState(false);
  const [showBib, setShowBib] = useState(false);
  const [bibAba, setBibAba] = useState('foto');
  const [showAgendar, setShowAgendar] = useState(false);
  const [resumo, setResumo] = useState(null);        // 📋 raio-X da conversa
  const [proto, setProto] = useState(null);          // ✅ protocolo de atendimento
  const [ficha, setFicha] = useState(null);          // 📇 ficha completa do cliente
  const [fichaEdit, setFichaEdit] = useState(null);
  const abrirFicha = async () => {
    setFicha({ carregando: true });
    try { setFicha(await api.get(`/inbox/conversations/${sel.id}/ficha`)); }
    catch (e) { setFicha({ erro: e.message }); }
    carregarNotas();
  };

  /* 📝 Bloco de notas do cliente: o que se descobre na ligação fica registrado
     com autor e data, em vez de morar na cabeça de quem atendeu. */
  /* 🏥 Puxa a ficha do Vittasys pra dentro do VittaHub. Só preenche o que está
     VAZIO aqui: dado digitado pela equipe não é sobrescrito por importação —
     quem está na conversa costuma ter a informação mais recente. */
  const [puxandoVs, setPuxandoVs] = useState(false);
  const puxarVittasys = async () => {
    setPuxandoVs(true);
    try {
      const tel = String(sel?.phone || '').replace(/\D/g, '');
      const d = await api.get(`/extras/vittasys/paciente?telefone=${tel}&nome=${encodeURIComponent(sel?.contact_name || '')}`);
      if (d.configurado === false) { Toast.show(d.aviso, 'info'); setPuxandoVs(false); return; }
      if (d.erro) { Toast.show(d.erro, 'error'); setPuxandoVs(false); return; }
      const p = d.paciente;
      if (!p) { Toast.show('O Vittasys não encontrou esse paciente.', 'info'); setPuxandoVs(false); return; }
      const atual = ficha?.cliente || {};
      const novo = {};
      if (p.nascimento && !atual.nascimento) novo.nascimento = p.nascimento;
      if (p.cpf && !atual.cpf) novo.cpf = p.cpf;
      if (p.responsavel && !atual.responsavel) novo.responsavel = p.responsavel;
      if (p.nome && !atual.paciente) novo.paciente = p.nome;
      if (Object.keys(novo).length) await api.put(`/inbox/conversations/${sel.id}/ficha`, novo);
      Toast.show(
        `${Object.keys(novo).length} campo(s) preenchido(s) do Vittasys` +
        (p.doses?.length ? ` · ${p.doses.length} dose(s) encontradas lá` : ''), 'success');
      abrirFicha();
    } catch (e) { Toast.show(e.message, 'error'); }
    setPuxandoVs(false);
  };

  const [notas, setNotas] = useState([]);
  const [notaTxt, setNotaTxt] = useState('');
  const [notaTipo, setNotaTipo] = useState('ligacao');
  const [notaBusy, setNotaBusy] = useState(false);
  const carregarNotas = async () => {
    if (!sel?.id) return;
    try { setNotas(await api.get(`/inbox/conversations/${sel.id}/notas`) || []); } catch { setNotas([]); }
  };
  const salvarNota = async () => {
    const t = notaTxt.trim();
    if (!t) return;
    setNotaBusy(true);
    try {
      const n = await api.post(`/inbox/conversations/${sel.id}/notas`, { texto: t, tipo: notaTipo });
      setNotas(p => [n, ...p]); setNotaTxt('');
      Toast.show('Anotação salva 📝', 'success');
    } catch (e) { Toast.show(e.message, 'error'); }
    setNotaBusy(false);
  };
  const apagarNota = async (id) => {
    try { await api.del(`/inbox/notas/${id}`); setNotas(p => p.filter(n => n.id !== id)); }
    catch (e) { Toast.show(e.message, 'error'); }
  };
  // 📋 A barra do passo a passo pode ser BAIXADA por qualquer uma (pedido do
  // master, 24/08) e a escolha fica guardada: abaixou, continua abaixada em
  // todas as conversas e depois do refresh, até ela querer abrir de novo.
  const [protoAberto, setProtoAberto] = useState(() => {
    try { return localStorage.getItem('vh_proto_aberto') !== '0'; } catch { return true; }
  });
  const alternarProto = () => setProtoAberto(a => {
    const nova = !a;
    try { localStorage.setItem('vh_proto_aberto', nova ? '1' : '0'); } catch { /* ok */ }
    return nova;
  });
  const [protoBusy, setProtoBusy] = useState('');
  const [protoSel, setProtoSel] = useState(null); // passo aberto nos botões numerados (23/08/2026)
  // ✏️ Edição da frase do passo (pedido do master: "não me dá a opção de usar
  // a frase salva e nem de editar")
  const [codigoInfoOpen, setCodigoInfoOpen] = useState(false);  // balão “o que é o código?”
  const [protoEditK, setProtoEditK] = useState(null);
  const [protoEditTxt, setProtoEditTxt] = useState('');
  // 📎 Clipe em todos os passos (pedido do master): anexa e ENVIA na conversa
  // imagem, vídeo ou documento, direto do cartão do passo (até 45MB).
  const protoFileRef = useRef(null);
  const anexarDoPasso = async (e) => {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f || !sel) return;
    setProtoBusy('anexo');
    try {
      const mb = f.size / 1048576;
      if (mb > 8) Toast.show(`Enviando ${mb.toFixed(1)} MB… pode levar alguns segundos ⏳`, 'info');
      const fd = new FormData(); fd.append('file', f);
      const m = await api.upload(`/inbox/conversations/${sel.id}/upload`, fd);
      setMsgs(p => [...p, m]);
      if (m?.aviso) Toast.show(`⚠️ ${m.aviso}`, 'error');
      else Toast.show('📎 Arquivo enviado na conversa!', 'success');
      api.get(`/inbox/conversations/${sel.id}/protocolo`).then(setProto).catch(() => {});
    } catch (e2) { Toast.show(e2.message || 'Falha no envio', 'error'); }
    setProtoBusy('');
  };
  const [resumoLoad, setResumoLoad] = useState(false);
  const [estudoBusy, setEstudoBusy] = useState(false);
  const [estudoAviso, setEstudoAviso] = useState(null);
  const [, setTick] = useState(0); // re-render a cada 30s: relógio de espera do cliente
  useEffect(() => { const t = setInterval(() => setTick(x => x + 1), 30000); return () => clearInterval(t); }, []);
  const [intentOff, setIntentOff] = useState(null); // id da msg cujo radar foi dispensado
  const [showAgendarMsg, setShowAgendarMsg] = useState(false);
  const [showIndicar, setShowIndicar] = useState(false);
  const [scoreChip, setScoreChip] = useState(null); // null | 'calc' | número
  const [leadInfo, setLeadInfo] = useState(null);   // lead vinculado (faixa de contexto)
  const [leadData, setLeadData] = useState(null);
  const [users, setUsers] = useState([]);
  const usersById = useMemo(() => Object.fromEntries(users.map(u => [u.id, u])), [users]);
  useEffect(() => { api.get('/leads/meta').then(m => setUsers(m.users || [])).catch(() => {}); }, []);
  // Meta global do setor — banner motivacional dentro do atendimento (atualiza 60s)
  useEffect(() => {
    const f = () => api.get('/extras/meta-setor').then(setMetaSetor).catch(() => {});
    f(); const t = setInterval(f, 60000); return () => clearInterval(t);
  }, []); // eslint-disable-line
  const [listH, setListH]       = useState(500);

  const endRef           = useRef(null);
  const msgAreaRef       = useRef(null);
  const fileRef          = useRef(null);
  const textRef          = useRef(null);
  const listContainerRef = useRef(null);
  const searchTimeout    = useRef(null);
  const lastPollTs       = useRef(new Date().toISOString());
  const lastMsgTs        = useRef(null);
  const selRef           = useRef(sel);
  // CRÍTICO: atribuir no render body (síncrono), não em useEffect (assíncrono)
  // Evita janela onde WebSocket chega e selRef ainda aponta para conversa anterior
  selRef.current = sel;
  const userRef          = useRef(user);
  userRef.current = user;

  // ── Mede altura da lista (ResizeObserver: reage a QUALQUER mudança de layout) ──
  useEffect(() => {
    const el = listContainerRef.current;
    if (!el) return;
    const measure = () => setListH(el.getBoundingClientRect().height || 500);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener('resize', measure);
    return () => { ro.disconnect(); window.removeEventListener('resize', measure); };
  }, []);

  // ── Tab ativa? ─────────────────────────────────────────────────────────────
  const isTabActive = () => !document.hidden;

  // ── Socket.io: real-time confiável ───────────────────────────────────────────
  // Socket.io gerencia automaticamente: WebSocket → HTTP polling fallback
  // Reconexão automática, funciona com qualquer proxy (Railway, nginx, Cloudflare)
  useEffect(() => {
    const BASE = import.meta.env.VITE_API_URL || '';
    const tk   = localStorage.getItem('vh_token') || '';
    if (!tk) return;

    // Importação dinâmica do socket.io-client (evita aumentar bundle no SSR)
    let socket = null;
    let active = true;

    import('socket.io-client').then(({ io }) => {
      if (!active) return;

      socket = io(BASE, {
        auth: { token: tk },
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 10000,
      });

      socket.on('connect', () => {
        console.log('%c Socket.io ✅ Tempo real ativo', 'background:#00B8C0;color:#fff;padding:2px 8px;border-radius:4px;font-weight:bold');
      });

      socket.on('disconnect', (reason) => {
        console.log('Socket.io desconectado:', reason);
      });

      socket.on('connect_error', (err) => {
        console.warn('Socket.io erro:', err.message);
      });

      socket.on('message_updated', ({ convId, messageId, content, editada, status, transcricao }) => {
        if (selRef.current?.id !== convId) return;
        setMsgs(prev => prev.map(x => x.id === messageId
          ? { ...x, ...(content !== undefined ? { content } : {}), ...(editada !== undefined ? { editada } : {}), ...(status !== undefined ? { status } : {}), ...(transcricao !== undefined ? { transcricao } : {}) }
          : x));
      });

      socket.on('new_message', ({ convId, message, conv: updConv }) => {
        // 📱 Notificação do sistema quando a aba está em 2º plano (app instalado
        // ou navegador minimizado): mostra quem falou e um pedaço da mensagem
        try {
          if (document.hidden && message?.from_type === 'contact' && window.Notification?.permission === 'granted') {
            const corpo = String(message.content || '').startsWith('data:') ? '📎 Mídia' : String(message.content || '').slice(0, 90);
            new Notification(updConv?.contact_name || 'Novo cliente', { body: corpo, icon: '/logos/icone-color.png', tag: `vh-${convId}` });
          }
        } catch {}

        // Som de notificação: só para mensagem de cliente, e só se a conversa
        // não estiver aberta na tela (ou a aba estiver em segundo plano)
        if (somRef.current && message?.from_type === 'contact' &&
            (selRef.current?.id !== convId || document.hidden)) {
          playChime();
        }

        // Atualiza lista de conversas — move para o topo
        setConvos(prev => {
          const ex = prev.find(c => c.id === convId);
          return [{ ...(ex || {}), ...updConv }, ...prev.filter(c => c.id !== convId)];
        });

        // Adiciona mensagem se a conversa aberta for essa
        if (selRef.current?.id === convId) {
          setMsgs(prev => {
            if (prev.find(m => m.id === message.id)) return prev;
            // Substitui otimista correspondente (tmp-*) pela versão real
            const clean = prev.filter(p =>
              !String(p.id).startsWith('tmp-') ||
              !(p.from_type === 'me' && p.content === message.content)
            );
            lastMsgTs.current = message.created_at;
            return [...clean, message];
          });
        }
      });

      // Temperatura/memória reclassificadas pela Vitta → atualiza selo na lista,
      // e a ficha da conversa aberta se for essa
      socket.on('lead_score', ({ convId, lead_score, lead_score_motivo, memoria }) => {
        const patch = c => ({ ...c, lead_score, lead_score_motivo, ...(memoria !== undefined ? { memoria } : {}) });
        setConvos(prev => prev.map(c => c.id === convId ? patch(c) : c));
        setSel(prev => prev && prev.id === convId ? patch(prev) : prev);
      });

      // Admin ligou/desligou o bot global em Configurações → aplica em todas
      socket.on('bots_global', ({ ativo }) => {
        setConvos(prev => prev.map(c => ({ ...c, bot_ativo: !!ativo })));
        setSel(prev => prev ? { ...prev, bot_ativo: !!ativo } : prev);
      });
      // Cada venda registrada atualiza a meta do setor na hora (o "falta" desce)
      socket.on('venda_registrada', () => {
        api.get('/extras/meta-setor').then(setMetaSetor).catch(() => {});
      });
      socket.on('conv_transferida', ({ convId, para_id, de_id }) => {
        const u = userRef.current;
        const me = u?.id;
        if (!me || String(para_id) === String(me)) {          // recebi: continua comigo
          setConvos(prev => prev.map(c => c.id === convId ? { ...c, responsavel_id: para_id } : c));
          return;
        }
        /* 🔁 Sai da lista de QUEM TRANSFERIU (ordem do master, 27/08) — vale
           também pra supervisora e pra quem tem ve_tudo. E segue saindo de
           quem era o dono anterior. O master continua vendo tudo. */
        const euTransferi = de_id && String(de_id) === String(me);
        if ((euTransferi && u?.role !== 'master') || u?.role === 'atendente') {
          setConvos(prev => prev.filter(c => c.id !== convId));
          setSel(prev => prev?.id === convId ? null : prev);
        } else {
          setConvos(prev => prev.map(c => c.id === convId ? { ...c, responsavel_id: para_id } : c));
        }
      });
      // Conversa foi classificada → se foi pra pasta (Fidelidade) ou eu não sou do
      // grupo do setor, some da minha lista.
      socket.on('conv_setor', ({ convId, setor, categoria, classificacao }) => {
        const u = userRef.current;
        const doGrupo = !u || u.role === 'master' || !u.setor || ((u.setor === 'vacinas') === (setor === 'vacinas'));
        if (categoria || !doGrupo) {
          setConvos(prev => prev.filter(c => c.id !== convId));
          setSel(prev => prev?.id === convId ? null : prev);
        } else {
          setConvos(prev => prev.map(c => c.id === convId ? { ...c, setor, classificacao } : c));
        }
      });
      // Lead marcado como perdido → sai do inbox de todos.
      socket.on('conv_perdido', ({ convId }) => {
        setConvos(prev => prev.filter(c => c.id !== convId));
        setSel(prev => prev?.id === convId ? null : prev);
      });
      // Conversa EXCLUÍDA do CRM → some da lista pra todos.
      socket.on('conversa_removida', ({ convId }) => {
        setConvos(prev => prev.filter(c => c.id !== convId));
        setSel(prev => prev?.id === convId ? null : prev);
      });
      // Conversa movida pra uma pasta (Fidelidade/Banco) → sai do inbox normal.
      socket.on('conv_categoria', ({ convId, categoria }) => {
        if (categoria) {
          setConvos(prev => prev.filter(c => c.id !== convId));
          setSel(prev => prev?.id === convId ? null : prev);
        }
      });
    }).catch(err => console.warn('socket.io-client não disponível:', err.message));

    return () => {
      active = false;
      socket?.disconnect();
    };
  }, []); // uma vez, persiste durante toda a sessão


  // ── POLL DE MENSAGENS — 2s, simples, garantido funcionar ─────────────────────
  // Socket.io tenta entrega instantânea (bônus quando funcionar)
  // Este poll de 2s é o mecanismo PRINCIPAL e confiável
  // Max delay: 2s — aceitável para chat
  useEffect(() => {
    if (!sel) return;
    const BASE  = import.meta.env.VITE_API_URL || '';
    const convId = sel.id;

    const fetchNew = async () => {
      try {
        const afterTs = lastMsgTs.current || new Date(Date.now() - 30000).toISOString();
        const resp = await fetch(
          `${BASE}/api/inbox/conversations/${convId}/messages/new?after_ts=${encodeURIComponent(afterTs)}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!resp.ok) return;
        const { messages: newMsgs = [] } = await resp.json();
        if (!newMsgs.length) return;

        setMsgs(prev => {
          const ids = new Set(prev.map(m => m.id));
          // Só mensagens que ainda não estão no estado
          const truly = newMsgs.filter(m => !ids.has(m.id));
          if (!truly.length) return prev;
          // Remove otimistas correspondentes (evita duplicata ao confirmar envio)
          const clean = prev.filter(p =>
            !String(p.id).startsWith('tmp-') ||
            !truly.some(r => r.from_type === 'me' && r.content === p.content)
          );
          lastMsgTs.current = truly[truly.length - 1].created_at;
          return [...clean, ...truly];
        });

        // Também atualiza a lista de conversas
        setConvos(prev => prev.map(c =>
          c.id !== convId ? c : {
            ...c,
            last_message: newMsgs[newMsgs.length - 1].content?.slice(0, 80) || c.last_message,
            last_message_at: newMsgs[newMsgs.length - 1].created_at,
          }
        ));
      } catch {}
    };

    // Poll imediato ao abrir conversa + a cada 2s
    fetchNew();
    const iv = setInterval(fetchNew, 2000);
    return () => clearInterval(iv);
  }, [sel?.id, token]);



  // ── POLL da lista de conversas (cache em memória no servidor) ─────────────
  useEffect(() => {
    const iv = setInterval(async () => {
      if (!isTabActive()) return;
      try {
        const since = lastPollTs.current;
        lastPollTs.current = new Date().toISOString();
        const params = new URLSearchParams({ since });
        if (filter !== 'all') params.set('channel', filter);
        if (search) params.set('search', search);
        if (unreadOnly) params.set('unread_only', 'true');
        const data = await api.get(`/inbox/conversations/updates?${params}`);
        const updated = data.data || [];
        if (updated.length === 0) return;
        setConvos(prev => {
          const map = new Map(prev.map(c => [c.id, c]));
          updated.forEach(c => map.set(c.id, { ...map.get(c.id), ...c }));
          return Array.from(map.values()).sort((a, b) => new Date(b.last_message_at||0) - new Date(a.last_message_at||0));
        });
        onUnreadChange?.(updated.reduce((s, c) => s + (c.unread || 0), 0));
      } catch {}
    }, 5000);
    return () => clearInterval(iv);
  }, [filter, search, unreadOnly, waiting, setorFiltro, clsFiltro, modo, respFiltro]);

  // ── Auto-scroll ao chegar novas mensagens ─────────────────────────────────
  // Só rola se o usuário já estava perto do fim (não interrompe quem lê mensagens antigas)
  useEffect(() => {
    if (!msgAreaRef.current || msgs.length === 0) return;
    const el = msgAreaRef.current;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 250;
    if (nearBottom) {
      requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
    }
  }, [msgs.length]); // depende do LENGTH, não do array — evita trigger em mutações internas

  // ── Carrega lista inicial ──────────────────────────────────────────────────
  const loadConvos = useCallback(async () => {
    try {
      const params = new URLSearchParams({ page: 1, limit: LIMIT });
      if (filter !== 'all') params.set('channel', filter);
      if (search) params.set('search', search);
      if (unreadOnly) params.set('unread_only', 'true');
      if (waiting) params.set('waiting', 'true');
      if (setorFiltro !== 'all') params.set('setor', setorFiltro);
      if (clsFiltro !== 'all') params.set('classificacao', clsFiltro);
      if (modo === 'minhas') params.set('minhas', 'true');
      if (modo === 'naolidas') params.set('unread_only', 'true');
      if (modo === 'grupos') params.set('grupos', 'true');
      /* 📥 Fila de distribuição e o atalho do Painel Comercial: clicar numa
         pessoa lá abre o chat já filtrado nas conversas DELA (28/08). */
      if (modo === 'distribuir') params.set('semDono', 'true');
      // 📥💬 Duas fileiras: a lista vem inteira (pool sem dona + carteira dela)
      if (modo === 'duas') params.set('limit', '200');
      if (respFiltro) params.set('responsavel', respFiltro);
      const data = await api.get(`/inbox/conversations?${params}`);
      if (data.counts) setCounts(data.counts);
      const list = data.data || data;
      const tot  = data.total ?? list.length;
      setConvos(list); setTotal(tot); setPage(1); setHasMore(list.length < tot);
      // 📌 Fixadas sempre em dia (pedido do master: "fixação fidedigna") —
      // recarrega junto pra não-lidas e última mensagem não ficarem velhas
      api.get('/inbox/fixadas').then(d => Array.isArray(d) && setFixadas(d)).catch(() => {});
      lastPollTs.current = new Date().toISOString();
      onUnreadChange?.(list.reduce((s, c) => s + (c.unread || 0), 0));
    } catch(err) { console.error('loadConvos:', err.message); }
  }, [filter, search, unreadOnly, waiting, setorFiltro, clsFiltro, modo, respFiltro]);

  // ── Infinite scroll ────────────────────────────────────────────────────────
  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const next = page + 1;
      const params = new URLSearchParams({ page: next, limit: LIMIT });
      if (filter !== 'all') params.set('channel', filter);
      if (search) params.set('search', search);
      if (unreadOnly) params.set('unread_only', 'true');
      if (waiting) params.set('waiting', 'true');
      if (setorFiltro !== 'all') params.set('setor', setorFiltro);
      if (modo === 'minhas') params.set('minhas', 'true');
      if (modo === 'naolidas') params.set('unread_only', 'true');
      if (modo === 'grupos') params.set('grupos', 'true');
      /* 📥 Fila de distribuição e o atalho do Painel Comercial: clicar numa
         pessoa lá abre o chat já filtrado nas conversas DELA (28/08). */
      if (modo === 'distribuir') params.set('semDono', 'true');
      // 📥💬 Duas fileiras: a lista vem inteira (pool sem dona + carteira dela)
      if (modo === 'duas') params.set('limit', '200');
      if (respFiltro) params.set('responsavel', respFiltro);
      const data = await api.get(`/inbox/conversations?${params}`);
      if (data.counts) setCounts(data.counts);
      const list = data.data || [];
      setConvos(prev => {
        const ids = new Set(prev.map(c => c.id));
        const merged = [...prev, ...list.filter(c => !ids.has(c.id))];
        setHasMore(merged.length < (data.total ?? 0));
        return merged;
      });
      setPage(next);
    } catch {}
    setLoadingMore(false);
  }, [page, hasMore, loadingMore, filter, search, unreadOnly]);

  // ── Recarrega ao mudar busca/filtros (inclui setor e classificação do menu) ──
  useEffect(() => {
    clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => loadConvos(), 350);
    return () => clearTimeout(searchTimeout.current);
  }, [search, filter, unreadOnly, setorFiltro, clsFiltro, waiting, modo]);

  useEffect(() => { api.get('/inbox/quick-replies').then(setQr).catch(() => {}); }, []);
  const [qrNovo, setQrNovo] = useState(null);

  // Banco de documentos (enviar em 1 clique ao cliente)
  const [showDocs, setShowDocs] = useState(false);
  const [docs, setDocs] = useState([]);
  const docFileRef = useRef(null);
  const [docEnviando, setDocEnviando] = useState(null);
  useEffect(() => { api.get('/inbox/documentos').then(d => setDocs(Array.isArray(d) ? d : [])).catch(() => {}); }, []);
  const anexarDoc = async (e) => {
    const f = e.target.files?.[0]; e.target.value = ''; if (!f) return;
    const url = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); });
    if (url.length > 52_000_000) { Toast.show('Documento muito grande (máx. ~40MB)', 'error'); return; }
    try { const d = await api.post('/inbox/documentos', { nome: f.name, arquivo: url, mimetype: f.type }); setDocs(p => [d, ...p]); Toast.show('Documento salvo no banco! 📄', 'success'); }
    catch (err) { Toast.show(err.message, 'error'); }
  };
  const enviarDoc = async (d) => {
    if (!sel) return;
    setDocEnviando(d.id);
    try { await api.post(`/inbox/conversations/${sel.id}/enviar-documento`, { docId: d.id }); setShowDocs(false); Toast.show('Documento enviado! 📎', 'success'); }
    catch (err) { Toast.show(err.message, 'error'); }
    setDocEnviando(null);
  };
  const excluirDoc = async (d, e) => {
    e.stopPropagation();
    if (!window.confirm(`Excluir "${d.nome}" do banco?`)) return;
    setDocs(p => p.filter(x => x.id !== d.id));
    try { await api.del(`/inbox/documentos/${d.id}`); } catch (err) { Toast.show(err.message, 'error'); api.get('/inbox/documentos').then(setDocs).catch(() => {}); }
  };
  const salvarQrNovo = async () => {
    if (!qrNovo?.titulo.trim() || !qrNovo?.texto.trim()) return;
    try {
      const nova = await api.post('/inbox/quick-replies', { titulo: qrNovo.titulo.trim(), texto: qrNovo.texto.trim() });
      setQr(p => [...p, nova]);
      setQrNovo(null);
      Toast.show('Mensagem automática cadastrada! ⚡', 'success');
    } catch (e) { Toast.show(e.message, 'error'); }
  };
  const gestaoUser = user?.role === 'master' || user?.role === 'supervisor';
  const excluirQr = async (q, e) => {
    e.stopPropagation();
    if (!window.confirm(`Excluir a mensagem "${q.titulo}"?`)) return;
    setQr(p => p.filter(x => x.id !== q.id));
    try { await api.del(`/inbox/quick-replies/${q.id}`); Toast.show('Mensagem excluída', 'success'); }
    catch (err) { Toast.show(err.message, 'error'); api.get('/inbox/quick-replies').then(setQr).catch(() => {}); }
  };

  // ── Abre conversa ─────────────────────────────────────────────────────────
  // Trocar o responsável pela conversa (auto-assign acontece ao abrir; aqui troca manual)
  const changeResp = async (respId) => {
    if (!sel) return;
    const u = usersById[respId] || null;
    setSel(prev => ({ ...prev, responsavel_id: respId || null, responsavel_nome: u?.nome || null, responsavel_cor: u?.cor || null }));
    setConvos(prev => prev.map(x => x.id === sel.id ? { ...x, responsavel_id: respId || null } : x));
    // Troca SILENCIOSA (pedido do master): só muda o dono da conversa, sem
    // mandar nada pro cliente. A assinatura das mensagens já passa a sair com
    // o nome de quem responde.
    try { await api.patch(`/inbox/conversations/${sel.id}/assign`, { responsavel_id: respId || null, avisar_cliente: false }); } catch {}
  };

  // Vindo de outra tela com ?phone= (ex.: botão Conversa da Agenda): acha a
  // conversa desse telefone e abre AQUI no CRM, sem sair pro WhatsApp.
  useEffect(() => {
    /* 🧹 O tratamento do ?conv= saiu daqui: existiam DOIS efeitos abrindo a
       mesma conversa em corrida (este apagava o parâmetro da URL no meio do
       caminho do outro). Ficou só o efeito dedicado logo abaixo — que também
       carrega o rascunho da pasta Fidelidade e MOSTRA o erro se não abrir. */
    const ph = (searchParams.get('phone') || '').replace(/\D/g, '');
    if (!ph) return;
    (async () => {
      try {
        const sufixo = ph.slice(-8);
        const rows = await api.get(`/inbox/conversations/buscar?q=${encodeURIComponent(sufixo)}`);
        const lista = Array.isArray(rows) ? rows : [];
        const alvo = lista.find(r => String(r.phone || '').replace(/\D/g, '').endsWith(sufixo)) || lista[0];
        if (alvo) openConvo(alvo);
        else setSearch(ph); // não achou: deixa o telefone na busca pra facilitar
      } catch {}
      searchParams.delete('phone');
      setSearchParams(searchParams, { replace: true });
    })();
  }, []); // eslint-disable-line

  const openConvo = async (c) => {
    window.__auditLog?.('abrir_conversa', 'conversa', c.id, { nome: c.contact_name, telefone: c.phone });
    /* Última conversa aberta: a Tabela de Preços usa isso pro botão "Enviar pra
       conversa" voltar direto pra cá com o orçamento já escrito na caixa. */
    try { sessionStorage.setItem('vh_ultima_conversa', JSON.stringify({ id: c.id, nome: c.contact_name || '' })); } catch { /* ok */ }
    setSel(c); setMsgs([]); setMsgsHasMore(false); setMsgsTotal(0);
    setAssinarComo('');   // ✍️ a assinatura escolhida vale só na conversa aberta
    // ✅ Protocolo: carrega sozinho ao abrir a conversa e já destaca o que faltou
    setProto(null);   // a barra respeita o que a atendente escolheu (aberta/baixada)
    api.get(`/inbox/conversations/${c.id}/protocolo`).then(setProto).catch(() => {});
    // IA fica aberta do lado por padrão (lembrando a preferência do usuário).
    setShowProposta(false); setLeadData(null);
    lastMsgTs.current = null;
    try {
      const data = await api.get(`/inbox/conversations/${c.id}`);
      setMsgs(data.messages || []);
      setMsgsTotal(data.messages_total || data.messages?.length || 0);
      setMsgsHasMore(!!data.has_more);
      setSel(prev => ({ ...prev, ...(data.profile_pic ? { profile_pic: data.profile_pic } : {}),
        status_atend: data.status_atend || 'aberto',
        responsavel_id: data.responsavel_id || null,
        responsavel_nome: data.responsavel_nome || null,
        responsavel_cor: data.responsavel_cor || null }));
      if (data.responsavel_id) setConvos(prev => prev.map(x => x.id === c.id ? { ...x, responsavel_id: data.responsavel_id } : x));
      if (data.lead_id) api.get(`/leads/${data.lead_id}`).then(setLeadData).catch(() => {});
      // Sem foto de perfil? Busca na Z-API em segundo plano e atualiza ao vivo
      if (!c.profile_pic && !data.profile_pic) {
        api.post(`/inbox/conversations/${c.id}/load-from-zapi`).then(() =>
          api.get(`/inbox/conversations/${c.id}`).then(d2 => {
            if (d2.profile_pic) {
              setSel(prev => prev?.id === c.id ? { ...prev, profile_pic: d2.profile_pic } : prev);
              setConvos(prev => prev.map(x => x.id === c.id ? { ...x, profile_pic: d2.profile_pic } : x));
            }
          })
        ).catch(() => {});
      }
      const lastTs = data.messages?.[data.messages.length - 1]?.created_at;
      if (lastTs) lastMsgTs.current = lastTs;
      setTimeout(() => { if (msgAreaRef.current) msgAreaRef.current.scrollTop = msgAreaRef.current.scrollHeight; }, 80);
    } catch {}
    fetch(`${import.meta.env.VITE_API_URL||''}/api/inbox/conversations/${c.id}/read`, { method:'PATCH', headers:{ Authorization:`Bearer ${token}` } });
    setConvos(prev => prev.map(x => x.id === c.id ? { ...x, unread:0 } : x));
  };

  // Deep-link: abrir uma conversa específica via ?conv=<id> (ex.: vindo de uma
  // pasta como Planos Vacinais / Fidelidade). Busca por id e abre direto.
  const convDeepLink = searchParams.get('conv');
  const convAbertaRef = useRef(null);
  useEffect(() => {
    if (!convDeepLink || convAbertaRef.current === convDeepLink) return;
    convAbertaRef.current = convDeepLink;
    api.get(`/inbox/conversations/${convDeepLink}`)
      .then(c => {
        if (!c?.id) return;
        openConvo(c);
        /* Rascunho vindo da pasta Fidelidade: o "chamar" já deixa a mensagem
           escrita aqui na caixa. Só isso — quem aperta enviar é a atendente,
           que lê e ajusta antes. Consome e apaga, pra não ressurgir depois. */
        try {
          const rascunho = sessionStorage.getItem('vh_rascunho_' + c.id);
          if (rascunho) { setInput(rascunho); sessionStorage.removeItem('vh_rascunho_' + c.id); }
        } catch { /* sessionStorage bloqueado: só não pré-preenche */ }
      })
      .catch((e) => {
        /* Falha SILENCIOSA era o pior dos mundos: a atendente clicava na pasta
           Fidelidade, caía aqui e "nada acontecia" (cobrança do master: "as
           conversas não estão abrindo"). Agora o motivo aparece na tela — sem
           acesso, limite de aberturas, conversa apagada — e dá pra agir. */
        Toast.show('Não consegui abrir esta conversa: ' + (e.message || 'erro desconhecido'), 'error');
        convAbertaRef.current = null;   // deixa tentar de novo
      });
  }, [convDeepLink]); // eslint-disable-line

  // ── Carregar mensagens mais antigas ───────────────────────────────────────
  const loadOlderMsgs = async () => {
    if (!sel || loadingOlderMsgs || !msgsHasMore) return;
    setLoadingOlderMsgs(true);
    try {
      const firstTs = msgs[0]?.created_at;
      const data = await api.get(`/inbox/conversations/${sel.id}?before_ts=${encodeURIComponent(firstTs)}`);
      const older = data.messages || [];
      let novas = 0;
      setMsgs(prev => {
        const ids = new Set(prev.map(m => m.id));
        const add = older.filter(m => !ids.has(m.id));
        novas = add.length;
        return [...add, ...prev];
      });
      // Se o bloco só trouxe mensagens já conhecidas (boundary), chegou ao início.
      setMsgsHasMore(!!data.has_more && novas > 0);
      const el = msgAreaRef.current;
      if (el) { const ph = el.scrollHeight; requestAnimationFrame(() => { el.scrollTop = el.scrollHeight - ph; }); }
    } catch {}
    setLoadingOlderMsgs(false);
  };

  // ── Enviar mensagem ────────────────────────────────────────────────────────
  // Marcar como não lida: devolve o badge e fecha a conversa pra não re-zerar
  const marcarNaoLida = async () => {
    if (!sel) return;
    const id = sel.id;
    try {
      await api.patch(`/inbox/conversations/${id}/unread`, {});
      setConvos(prev => prev.map(c => c.id === id ? { ...c, unread: Math.max(1, c.unread || 0) } : c));
      setSel(null);
    } catch (e) { console.error(e.message); }
  };

  const send = async (text) => {
    const t = (text || input).trim();
    if (!t || !sel || sending) return; // guard: bloqueia double-send
    setSending(true);
    setInput('');
    const now = new Date().toISOString();
    const tmp = { id:`tmp-${Date.now()}`, from_type:'me', type:'text', content:t, created_at:now, status:'sent', sender_nome:user?.nome };
    setMsgs(p => [...p, tmp]);
    setConvos(p => p.map(c => c.id===sel.id ? {...c, last_message:t, last_message_at:now} : c));
    try {
      const r = await api.post(`/inbox/conversations/${sel.id}/send`,
        assinarComo ? { content:t, assinarComo } : { content:t });
      window.__auditLog?.('responder', 'conversa', sel.id, { nome: sel.contact_name, trecho: t.slice(0, 60) });
      // Responsável automático: regra das 2 respostas (vem do backend)
      if (r?.autoAssign?.responsavel_id) {
        const u = usersById[r.autoAssign.responsavel_id];
        setSel(prev => prev?.id === sel.id ? { ...prev, responsavel_id: r.autoAssign.responsavel_id, responsavel_nome: u?.nome || r.autoAssign.responsavel_nome, responsavel_cor: u?.cor || null } : prev);
        setConvos(prev => prev.map(c => c.id === sel.id ? { ...c, responsavel_id: r.autoAssign.responsavel_id } : c));
      }
    }
    catch(e) { console.error('send error:', e.message); }
    finally { setSending(false); }
  };

  // ── Arquivo ───────────────────────────────────────────────────────────────
  // Colar imagem (Ctrl+V / print screen) direto no composer
  // Editar mensagem enviada (WhatsApp permite até ~15 min)
  /* ✏️ EDITAR MENSAGEM em caixa de verdade (ordem do master, 24/08). A janelinha
     do navegador é de UMA linha: ela achatava o cartão de agendamento inteiro
     numa tira só e ainda falha no celular. Agora é um editor com quebra de
     linha preservada, contador e visão do texto inteiro. */
  const [editMsg, setEditMsg] = useState(null);      // { id, original }
  const [editTxt, setEditTxt] = useState('');
  const [editBusy, setEditBusy] = useState(false);
  const editarMensagem = (m) => { setEditMsg({ id: m.id, original: m.content || '' }); setEditTxt(m.content || ''); };
  const salvarEdicao = async () => {
    const novo = editTxt.replace(/\s+$/, '');
    if (!editMsg || !novo.trim() || novo === editMsg.original) { setEditMsg(null); return; }
    setEditBusy(true);
    try {
      await api.put(`/inbox/conversations/${sel.id}/messages/${editMsg.id}`, { content: novo });
      setMsgs(prev => prev.map(x => x.id === editMsg.id ? { ...x, content: novo, editada: true } : x));
      window.__auditLog?.('editar_mensagem', 'mensagens', String(editMsg.id));
      setEditMsg(null);
    } catch (e) { Toast.show(e.message, 'error'); }
    setEditBusy(false);
  };

  // Apagar pra todos
  const apagarMensagem = async (m) => {
    if (!window.confirm('Apagar esta mensagem pra todos? O cliente verá "mensagem apagada".')) return;
    try {
      const r = await api.delete(`/inbox/conversations/${sel.id}/messages/${m.id}`);
      setMsgs(prev => prev.map(x => x.id === m.id ? { ...x, content: '🚫 Mensagem apagada', status: 'deleted' } : x));
      window.__auditLog?.('apagar_mensagem', 'mensagens', String(m.id));
      if (r?.aviso) Toast.show(r.aviso, 'info');
      else Toast.show('Mensagem apagada pra todos ✅', 'success');
    } catch (e) { Toast.show(e.message, 'error'); }
  };

  // ✨ Corretor: arruma ortografia do rascunho sem mudar o tom
  const [corrigindo, setCorrigindo] = useState(false);
  const corrigirTexto = async () => {
    if (!input.trim() || corrigindo) return;
    setCorrigindo(true);
    try {
      const d = await api.post('/inbox/ai-assist', { mode: 'corrigir', texto: input });
      if (d?.texto) setInput(d.texto);
    } catch (e) { Toast.show(e.message, 'error'); }
    finally { setCorrigindo(false); textRef.current?.focus(); }
  };

  // IA humanizada: lê a conversa e escreve a próxima mensagem no tom da atendente
  const [sugerindo, setSugerindo] = useState(false);
  const sugerirResposta = async () => {
    if (!sel || sugerindo) return;
    setSugerindo(true);
    try {
      const d = await api.post(`/inbox/conversations/${sel.id}/sugerir-resposta`, {});
      if (d?.mensagem) { setInput(d.mensagem); textRef.current?.focus(); }
    } catch (e) { Toast.show(e.message, 'error'); }
    finally { setSugerindo(false); }
  };

  // Texto colado de PDF/Word chega com quebras no MEIO das frases e espaços
  // duplicados — a mensagem ia "quebrada" pro cliente. Aqui a colagem é limpa:
  // junta quebras soltas no meio de frase, preserva parágrafos e listas.
  const limparColado = (t) => {
    const linhas = String(t).replace(/\r\n?/g, '\n').split('\n').map(l => l.replace(/[ \t]+/g, ' ').trim());
    const inicioDeBloco = (l) => /^([-•*✅✔▪◦›>]|\d+[.)]|[a-z][)])\s/i.test(l) || /^\p{Extended_Pictographic}/u.test(l);
    let out = '';
    for (let i = 0; i < linhas.length; i++) {
      const l = linhas[i];
      if (!out) { out = l; continue; }
      if (l === '') { out += '\n\n'; continue; }             // parágrafo intencional
      if (out.endsWith('\n\n') || out.endsWith('\n')) { out += l; continue; }
      const antes = out.split('\n').pop();
      // Mantém a quebra se a linha anterior fechou frase, ou se a nova é item de lista
      if (/[.!?:;…]$/.test(antes) || inicioDeBloco(l) || inicioDeBloco(antes)) out += '\n' + l;
      else out += ' ' + l;                                   // quebra no meio da frase → vira espaço
    }
    return out.replace(/\n{3,}/g, '\n\n').trim();
  };
  const handlePaste = (e) => {
    const item = Array.from(e.clipboardData?.items || []).find(i => i.type.startsWith('image/'));
    if (item) {
      const f = item.getAsFile();
      if (!f || !sel) return;
      e.preventDefault();
      handleFile({ target: { files: [f] } });
      return;
    }
    // Texto: cola já organizado (sem quebras estranhas)
    const bruto = e.clipboardData?.getData('text/plain');
    if (!bruto || !/\n/.test(bruto)) return; // sem quebras = cola normal
    e.preventDefault();
    const limpo = limparColado(bruto);
    const el = textRef.current;
    const ini = el?.selectionStart ?? input.length, fim = el?.selectionEnd ?? input.length;
    const novo = input.slice(0, ini) + limpo + input.slice(fim);
    setInput(novo);
    setTimeout(() => { if (el) { el.selectionStart = el.selectionEnd = ini + limpo.length; el.focus(); } }, 0);
  };

  const handleFile = async (e) => {
    const f = e.target.files[0]; if (!f || !sel) return;
    // Detectar tipo corretamente (GIF é imagem, não vídeo)
    const type = f.type==='image/webp'   ? 'sticker'
               : f.type==='image/gif'    ? 'image'
               : f.type.startsWith('image/')   ? 'image'
               : f.type.startsWith('video/')   ? 'video'
               : f.type.startsWith('audio/')   ? 'audio'
               : 'document';
    if (type==='image'||type==='video') {
      // O WhatsApp recusa vídeo acima de ~16 MB — avisamos ANTES de perder tempo
      const mb = f.size / 1048576;
      if (type==='video' && mb > 15) {
        Toast.show(`Vídeo de ${mb.toFixed(1)} MB — o WhatsApp aceita até ~16 MB. Comprima o vídeo ou envie o link. 🎥`, 'error');
        e.target.value=''; return;
      }
      if (mb > 40) {
        Toast.show(`Arquivo de ${mb.toFixed(1)} MB é grande demais (máx. 40 MB).`, 'error');
        e.target.value=''; return;
      }
      const url = URL.createObjectURL(f);
      setFilePreview({ url, type, name:f.name, file:f, mime:f.type });
      e.target.value=''; return;
    }
    // PDF e documentos: preview especial sem URL do objeto
    if (type==='document') {
      setFilePreview({ url:null, type:'document', name:f.name, file:f, mime:f.type });
      e.target.value=''; return;
    }
    // Audio: upload direto
    try {
      const fd = new FormData(); fd.append('file', f);
      const m = await api.upload(`/inbox/conversations/${sel.id}/upload`, fd);
      setMsgs(p => [...p, m]);
      if (m?.aviso) Toast.show(`⚠️ ${m.aviso}`, 'error');
    } catch (err) { Toast.show(`Não consegui enviar: ${err.message}`, 'error'); }
    e.target.value='';
  };

  const sendFilePreview = async () => {
    if (!filePreview || !sel || sending) return; // guard: evita múltiplos cliques
    setSending(true);
    try {
      const mb = (filePreview.file?.size || 0) / 1048576;
      if (mb > 8) Toast.show(`Enviando ${mb.toFixed(1)} MB… pode levar alguns segundos ⏳`, 'info');
      const fd = new FormData(); fd.append('file', filePreview.file);
      const m = await api.upload(`/inbox/conversations/${sel.id}/upload`, fd);
      setMsgs(p => [...p, m]);
      if (m?.aviso) Toast.show(`⚠️ ${m.aviso}`, 'error');   // chegou no CRM mas não no cliente
      if (filePreview.url) URL.revokeObjectURL(filePreview.url);
      setFilePreview(null);
    } catch(e) {
      console.error('upload error:', e.message);
      Toast.show(`Não consegui enviar: ${e.message || 'falha no envio'}`, 'error');
    }
    finally { setSending(false); }
  };

  const startRec = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio:true });
      const mr = new MediaRecorder(stream); const ch = [];
      mr.ondataavailable = e => ch.push(e.data);
      mr.onstop = async () => {
        const blob = new Blob(ch, { type:'audio/webm' });
        const fd = new FormData(); fd.append('file', blob, 'audio.webm');
        const m = await api.upload(`/inbox/conversations/${sel.id}/upload`, fd);
        setMsgs(p => [...p, m]); stream.getTracks().forEach(t => t.stop());
      };
      mr.start(); setRecorder(mr); setRecording(true);
    } catch { alert('Microfone indisponível'); }
  };
  const stopRec = () => { recorder?.stop(); setRecording(false); setRecorder(null); };

  const toLead = async () => {
    const d = await api.post(`/inbox/conversations/${sel.id}/to-lead`, {});
    if (d.created) { alert(`✅ Lead criado: ${d.lead.nome}`); setLeadData(d.lead); }
    else { alert(`ℹ️ Lead já existe: ${d.lead.nome}`); setLeadData(d.lead); }
  };

  const toggleBot = async () => {
    try {
      const d = await api.patch(`/inbox/conversations/${sel.id}/bot`, { ativo:!sel.bot_ativo });
      window.__auditLog?.('toggle_bot', 'conversa', sel.id, { nome: sel.contact_name, bot: d.botAtivo ? 'ligou' : 'desligou' });
      setSel(p => ({ ...p, bot_ativo:d.botAtivo }));
      setConvos(p => p.map(c => c.id===sel.id ? {...c, bot_ativo:d.botAtivo} : c));
      Toast.show(d.botAtivo ? 'Bot ligado nesta conversa 🤖' : 'Bot desligado nesta conversa', 'success');
    } catch (e) { Toast.show(e.message || 'Não foi possível alterar o bot', 'error'); }
  };

  /* Manda a conversa para Estudos. Um clique só, sem perguntar o motivo aqui:
     window.prompt não funciona no webview do celular, e o motivo se escreve
     melhor na tela de Estudos, com a conversa aberta do lado. */
  const estudarConversa = async () => {
    if (!sel || estudoBusy) return;
    setEstudoBusy(true);
    try {
      await api.post('/extras/estudos', { conversa_id: sel.id, titulo: sel.contact_name || 'Conversa' });
      setEstudoAviso({ ok: true, texto: 'Guardada em Estudos. Abra a aba Estudos para anotar o que quer olhar e pedir a leitura da Vitta.' });
    } catch (e) {
      setEstudoAviso({ ok: false, texto: e.message || 'Não consegui guardar em Estudos.' });
    }
    setEstudoBusy(false);
    setTimeout(() => setEstudoAviso(null), 6000);
  };

  const excluirConversa = async () => {
    if (!sel) return;
    if (!window.confirm(`Excluir a conversa de "${sel.contact_name || 'cliente'}"? Isso apaga a conversa e todas as mensagens do CRM e não pode ser desfeito.`)) return;
    try {
      await api.del(`/inbox/conversations/${sel.id}`);
      window.__auditLog?.('excluir', 'conversa', sel.id, { nome: sel.contact_name });
      setConvos(p => p.filter(c => c.id !== sel.id));
      setSel(null);
      Toast.show('Conversa excluída do CRM', 'success');
    } catch (e) { Toast.show(e.message || 'Não foi possível excluir', 'error'); }
  };

  const marcarExemplo = async () => {
    if (!window.confirm('Marcar esta conversa como EXEMPLO de sucesso?\n\nA IA vai estudar o jeito desta conversa pra copiar o tom que converteu.')) return;
    try {
      await api.post(`/inbox/conversations/${sel.id}/exemplo`, {});
      Toast.show('Conversa marcada como exemplo da IA ⭐ A IA vai aprender com ela.', 'success');
    } catch (e) { Toast.show(e.message || 'Não foi possível marcar', 'error'); }
  };

  // Mapa de classificação → setor (pro acesso) e rótulo. 'fidelidade' move pra pasta.
  const CLS_MAP = {
    vacinacao:       { setor:'vacinas',   label:'Vacinação',      cat:null },
    planos_vacinais: { setor:'vacinas',   label:'Planos Vacinais', cat:null },
    fidelidade:      { setor:'vacinas',   label:'Fidelidade',     cat:'fidelidade' },
    gestao:             { setor:null, label:'Gestão / Direção',        cat:null },
    profissional_saude: { setor:null, label:'Profissional da clínica', cat:null },
    consultas:       { setor:'consultas', label:'Consultas',      cat:null },
    terapias:        { setor:'terapias',  label:'Terapias',       cat:null },
  };
  // Atendente classifica o atendimento. Depois disso a conversa só aparece pro time
  // responsável — se eu não sou do grupo (ou foi pra pasta), some da minha lista.
  const classificarSetor = async (cls) => {
    const m = CLS_MAP[cls]; if (!m) return;
    try {
      const r = await api.patch(`/inbox/conversations/${sel.id}/classificar`, { classificacao: cls });
      window.__auditLog?.('classificar', 'conversa', sel.id, { nome: sel.contact_name, classificacao: m.label });
      const resp = r?.responsavel;
      const respNome = resp?.nome ? resp.nome.split(' ')[0] : null;
      setSel(p => ({ ...p, classificacao: cls, setor: m.setor, categoria: m.cat, responsavel_id: resp?.id || p.responsavel_id }));
      const souMaster = user?.role === 'master';
      const meuSetor = user?.setor;
      const souDoGrupo = souMaster || !meuSetor || ((meuSetor === 'vacinas') === (m.setor === 'vacinas'));
      // Fidelidade vai pra pasta (sai do inbox de todos); ou perdi acesso pelo setor
      if (m.cat || !souDoGrupo) {
        const idC = sel.id;
        setConvos(p => p.filter(c => c.id !== idC));
        setSel(null); setMsgs([]);
        Toast.show(m.cat ? 'Salvo em Clientes Fidelidade ⭐' : respNome ? `Classificado como ${m.label} — distribuído pra ${respNome} 🔁` : `Classificado como ${m.label} — enviado pro time ✅`, 'success');
      } else {
        setConvos(p => p.map(c => c.id===sel.id ? {...c, classificacao:cls, setor:m.setor, responsavel_id:resp?.id||c.responsavel_id} : c));
        Toast.show(respNome ? `Classificado como ${m.label} — distribuído pra ${respNome} 🔁` : `Classificado como ${m.label} ✅`, 'success');
      }
    } catch (e) { Toast.show(e.message || 'Não foi possível classificar', 'error'); }
  };

  const moverPasta = async (categoria) => {
    try {
      await api.patch(`/inbox/conversations/${sel.id}/categoria`, { categoria });
      window.__auditLog?.('mover_pasta', 'conversa', sel.id, { nome: sel.contact_name, pasta: categoria || 'tirou da pasta' });
      setSel(p => ({ ...p, categoria }));
      // Se foi movida para uma pasta, sai do inbox normal
      if (categoria) setConvos(p => p.filter(c => c.id !== sel.id));
      else setConvos(p => p.map(c => c.id === sel.id ? { ...c, categoria } : c));
      Toast.show(categoria === 'fidelidade' ? 'Movido para Fidelidade ⭐' : categoria === 'banco_dados' ? 'Movido para Banco de Dados 🗂️' : 'Removido da pasta', 'success');
    } catch (e) { Toast.show(e.message || 'Não foi possível mover', 'error'); }
  };

  const [profsAgenda, setProfsAgenda] = useState([]);
  /* 🗓️ AGENDAR JÁ PUXANDO A CONVERSA (ordem do master, 27/08: "quando eu
     clicar em agendar, ele puxa tudo de dentro da conversa"). Lê o cartão que
     já foi enviado (data, hora, paciente, serviço, local) e chega com o
     formulário preenchido. Sem IA e sem custo: o cartão é estruturado. Se não
     achar nada, abre em branco como antes — chute na agenda é pior que vazio. */
  const abrirAgendar = () => {
    const s = ['vacinas','consultas','terapias'].includes(sel.setor) ? sel.setor : 'consultas';
    setAgForm({ data: hojeISO, hora: '', servico: '', valor: '', observacoes: '', setor: s, forma_pagamento: '', endereco: '', local_link: '', profissional: '' });
    setAgendarOpen(true);
    api.get('/extras/profissionais').then(d => setProfsAgenda(Array.isArray(d) ? d.filter(p => p.ativo) : [])).catch(()=>setProfsAgenda([]));
    api.get(`/inbox/conversations/${sel.id}/agenda-da-conversa`).then(d => {
      if (!d?.achou) return;
      setAgForm(p => ({
        ...p,
        data: d.data || p.data,
        hora: d.hora || p.hora,
        servico: d.servico || p.servico,
        setor: d.setor || p.setor,
        endereco: d.endereco || p.endereco,
        profissional: d.profissional || p.profissional,
        // Valor vem do flyer de orçamento quando a equipe mandou por imagem
        valor: d.valor ? String(d.valor) : p.valor,
        observacoes: (d.paciente && d.paciente !== (sel.contact_name || '') ? `Paciente: ${d.paciente}. ` : '')
          + (d.bonus ? `Bônus: ${d.bonus}. ` : '')
          + (d.orcamento?.idade ? `Faixa: ${d.orcamento.idade}. ` : ''),
      }));
      Toast.show(d.orcamento
        ? '🗓️ Puxei da conversa e do flyer de orçamento — confira e confirme.'
        : d.origem === 'cartao'
          ? '🗓️ Puxei os dados do cartão da conversa — confira e confirme.'
          : '🗓️ Achei uma data na conversa — confira antes de confirmar.', 'success');
    }).catch(()=>{});
  };
  // IA lê a conversa, extrai o pedido de agendamento e pré-preenche o Agendar
  const sugerirAgendaIA = async () => {
    if (iaAgendaBusy) return;
    setIaAgendaBusy(true);
    try {
      const s = await api.post(`/inbox/conversations/${sel.id}/sugerir-agenda`, {});
      if (!s.tem_intencao) { Toast.show('A IA não encontrou um pedido de agendamento nessa conversa.', 'info'); return; }
      const setorS = ['vacinas','consultas','terapias'].includes(s.setor) ? s.setor : (['vacinas','consultas','terapias'].includes(sel.setor) ? sel.setor : 'consultas');
      setAgForm({
        data: s.data || hojeISO, hora: s.hora || '', servico: s.servico || '', valor: '',
        setor: setorS, forma_pagamento: '', endereco: s.endereco || '', local_link: '', profissional: '',
        observacoes: (s.paciente && s.paciente !== (sel.contact_name || '') ? `Paciente: ${s.paciente}. ` : '') + (s.resumo || ''),
      });
      setAgendarOpen(true);
      api.get('/extras/profissionais').then(d => setProfsAgenda(Array.isArray(d) ? d.filter(p => p.ativo) : [])).catch(()=>setProfsAgenda([]));
      Toast.show('🤖 Agendamento sugerido pela IA — revise e confirme.', 'success');
    } catch (e) { Toast.show(e.message || 'Erro ao sugerir agendamento', 'error'); }
    finally { setIaAgendaBusy(false); }
  };
  // Resumo da disponibilidade de um profissional (pra mostrar ao agendar)
  const dispProf = (p) => {
    const D = [['seg','Seg'],['ter','Ter'],['qua','Qua'],['qui','Qui'],['sex','Sex'],['sab','Sáb'],['dom','Dom']];
    const ds = D.filter(([k]) => p.disponibilidade?.[k]?.inicio && p.disponibilidade?.[k]?.fim);
    return ds.length ? ds.map(([k,l]) => `${l} ${p.disponibilidade[k].inicio}-${p.disponibilidade[k].fim}`).join(' · ') : 'sem horário definido';
  };

  const MOTIVOS_FOLLOW = ['Orçamento enviado','Proposta enviada','Cliente vai falar com esposo/família','Aguardando pagamento','Aguardando confirmação','Aguardando carteira','Reativação','Próxima dose','Retorno de consulta','Renovação de terapia','Outro'];
  const abrirFollow = () => {
    const amanha = new Date(Date.now() + 86400000).toISOString().slice(0,10);
    setFollowForm({ data: amanha, motivo: '' }); setFollowOpen(true);
  };
  const salvarFollow = async () => {
    if (!followForm.data) { Toast.show('Escolha a data do follow-up', 'error'); return; }
    setFollowSaving(true);
    try {
      await api.post(`/inbox/conversations/${sel.id}/followup`, followForm);
      window.__auditLog?.('criar_followup', 'conversa', sel.id, { nome: sel.contact_name, data: followForm.data, motivo: followForm.motivo });
      Toast.show('Follow-up agendado! 🔔 Aparece em Follow-up.', 'success');
      setFollowOpen(false);
    } catch (e) { Toast.show(e.message || 'Não foi possível agendar', 'error'); }
    setFollowSaving(false);
  };

  const MOTIVOS_PERDA = ['Achou caro','Vai falar com esposo e não retornou','Vai fazer depois','Vai fazer pelo SUS','Fechou em outro local','Não respondeu','Sem horário disponível','Sem vacina disponível','Sem profissional disponível','Atendimento demorou','Cliente não quis informar','Outro'];
  const abrirPerder = () => { setPerderForm({ motivo:'', observacao:'', valor_potencial:'' }); setPerderOpen(true); };
  const salvarPerda = async () => {
    if (!perderForm.motivo) { Toast.show('Escolha o motivo da perda', 'error'); return; }
    setPerderSaving(true);
    try {
      await api.patch(`/inbox/conversations/${sel.id}/perder`, perderForm);
      window.__auditLog?.('marcar_perdido', 'conversa', sel.id, { nome: sel.contact_name, motivo: perderForm.motivo });
      Toast.show('Marcado como perdido. Registrado nos relatórios.', 'info');
      setPerderOpen(false);
      setConvos(p => p.filter(c => c.id !== sel.id));
      setSel(null); setMsgs([]);
    } catch (e) { Toast.show(e.message || 'Não foi possível marcar', 'error'); }
    setPerderSaving(false);
  };

  const CAT_SUGERIDA = { vacinas:'Vacinação Geral', consultas:'Consulta', terapias:'Terapia' };
  // Combos de serviço por grupo — a atendente escolhe ou digita (datalist).
  const COMBOS_SERVICO = {
    vacinas: ['Vacinas 2 meses','Vacinas 3 meses','Vacinas 4 meses','Vacinas 5 meses','Vacinas 6 meses','Vacinas 7 meses','Vacinas 9 meses','Vacinas 12 meses','Vacinas 15 meses','Vacinas 18 meses','Plano 0-9 meses','Plano 0-12 meses','Plano 0-18 meses','Plano Anual','Gripe','HPV','Dengue','Meningite B','Tríplice Viral','Vacina avulsa'],
    consultas: ['Pediatria','Neuropediatria','Pneumologia','Psicologia','Neuropsicologia','Psicopedagogia','Nutrição','Retorno','Avaliação inicial'],
    terapias: ['Sessão avulsa','Pacote 4 sessões','Pacote 8 sessões','Pacote mensal','Avaliação','Fonoaudiologia','Terapia Ocupacional','Psicomotricidade','Psicoterapia'],
  };
  const grupoCombo = (cat) => ['Vacinação Geral','Plano Vacinal','Fidelidade Mensal'].includes(cat) ? 'vacinas' : cat==='Consulta' ? 'consultas' : cat==='Terapia' ? 'terapias' : 'vacinas';
  const abrirVenda = () => {
    setVendaForm({ categoria: CAT_SUGERIDA[sel.setor] || '', valor:'', desconto:'', forma_pagamento:'', status_pagamento:'pago', servico:'', observacao:'', ligou:false });
    setVendaOpen(true);
  };
  const salvarVenda = async () => {
    setVendaErro('');
    if (!vendaForm.categoria) { setVendaErro('Escolha a categoria da venda.'); return; }
    const bruto = parseFloat(String(vendaForm.valor).replace(',', '.'));
    if (!bruto || bruto <= 0) { setVendaErro('Informe o valor (ex.: 250 ou 250.00).'); return; }
    const desc = parseFloat(String(vendaForm.desconto || '').replace(',', '.')) || 0;
    if (desc > bruto) { setVendaErro('O desconto não pode ser maior que o valor.'); return; }
    const valFinal = Math.max(0, bruto - desc);
    setVendaSaving(true);
    try {
      const vendaSalva = await Promise.race([
        api.post('/extras/vendas', {
          ...vendaForm, valor: valFinal, desconto: desc, conversa_id: sel.id, lead_id: sel.lead_id || null,
          cliente_nome: sel.contact_name || fmt.phone(sel.phone), setor: sel.setor,
        }),
        new Promise((_, rej) => setTimeout(() => rej(new Error('Servidor demorou a responder (timeout 20s).')), 20000)),
      ]);
      // 🧩 Combo inteligente: sugere o que costuma sair junto (histórico real)
      if (vendaSalva?.sugestao?.texto) setTimeout(() => Toast.show('💡 ' + vendaSalva.sugestao.texto, 'info'), 1200);
      window.__auditLog?.('registrar_venda', 'venda', sel.id, { categoria: vendaForm.categoria, valor: valFinal, desconto: desc, status: vendaForm.status_pagamento, cliente: sel.contact_name });
      Toast.show('Venda registrada! 💰 Entrou na meta do mês 🎯', 'success');
      api.get('/extras/meta-setor').then(setMetaSetor).catch(() => {});
      setVendaOpen(false);
    } catch (e) { setVendaErro('Erro: ' + (e.message || 'não foi possível registrar')); }
    finally { setVendaSaving(false); }
  };

  const abrirTransferir = async () => {
    setTransfOpen(true);
    try { const d = await api.get('/inbox/atendentes'); setAtendentes(Array.isArray(d) ? d : []); } catch {}
  };
  const transferir = async (para) => {
    if (transfSaving) return;
    setTransfSaving(true);
    try {
      await api.patch(`/inbox/conversations/${sel.id}/transferir`, { para_id: para.id });
      window.__auditLog?.('transferir', 'conversa', sel.id, { nome: sel.contact_name, para: para.nome });
      setTransfOpen(false);
      // some da minha lista (transferi pra outra pessoa)
      const idTransf = sel.id;
      setConvos(p => p.filter(c => c.id !== idTransf));
      setSel(null); setMsgs([]);
      Toast.show(`Atendimento transferido para ${(para.nome||'').split(' ')[0]} 🔁`, 'success');
    } catch (e) {
      // Mostra o motivo que o servidor deu — "não foi possível" não ajuda ninguém
      Toast.show(e.message ? `Não transferi: ${e.message}` : 'Não foi possível transferir', 'error');
      console.error('transferir:', e);
    }
    setTransfSaving(false);
  };
  /* 🗓️ Lê a conversa e escreve o cartão oficial na caixa de mensagem. O texto
     vem do MESMO modelo do sistema, então nunca sai um cartão diferente do
     outro. A atendente revisa e manda — e ao mandar, o evento entra na agenda. */
  const montarCartaoAgenda = async () => {
    if (!sel || cartaoBusy) return;
    setCartaoBusy(true);
    try {
      const d = await api.post(`/inbox/conversations/${sel.id}/montar-cartao`, {});
      if (!d?.achou) { Toast.show(d?.aviso || 'Não achei data e hora na conversa', 'error'); return; }
      setInput(d.texto);
      textRef.current?.focus();
      const falta = (d.faltando || []).length ? ` Confira: ${d.faltando.join(' e ')}.` : '';
      Toast.show(`🗓️ Cartão montado (${d.resumo}).${falta}`, 'success');
    } catch (e) { Toast.show(e.message || 'Não consegui montar o cartão', 'error'); }
    finally { setCartaoBusy(false); }
  };

  /* 👤 Trocar quem assina uma mensagem já enviada (só gestão). Nasceu do
     "esqueci de mudar o usuário na hora de enviar": em vez de apagar e mandar
     de novo (o cliente vê o apagado), troca só o nome de quem aparece. */
  const [trocaRemet, setTrocaRemet] = useState(null);   // { msg }
  const trocarRemetente = (m) => {
    setTrocaRemet({ msg: m });
    if (!atendentes.length) api.get('/inbox/atendentes').then(d => setAtendentes(Array.isArray(d) ? d : [])).catch(()=>{});
  };
  const confirmarTrocaRemetente = async (nome) => {
    const alvo = trocaRemet?.msg;
    try {
      if (trocaRemet?.varias) {
        // Todas as últimas mensagens da equipe nesta conversa
        const r = await api.patch(`/inbox/conversations/${sel.id}/remetente-recentes`, { para: nome, limite: 15 });
        const ids = new Set(r.ids || []);
        setMsgs(p => p.map(x => ids.has(x.id) ? { ...x, sender_nome: r.sender_nome } : x));
        Toast.show(r.trocadas
          ? `${r.trocadas} mensagem(ns) agora aparecem como ${r.sender_nome} 👤`
          : 'Não havia mensagem da equipe pra trocar', r.trocadas ? 'success' : 'info');
      } else if (alvo) {
        const r = await api.patch(`/inbox/conversations/${sel.id}/messages/${alvo.id}/remetente`, { nome });
        setMsgs(p => p.map(x => x.id === alvo.id ? { ...x, sender_nome: r.sender_nome, content: r.content ?? x.content } : x));
        Toast.show(`Mensagem agora aparece como ${r.sender_nome} 👤`, 'success');
      }
    } catch (e) { Toast.show(e.message || 'Não consegui trocar', 'error'); }
    setTrocaRemet(null);
  };

  const salvarAgendamento = async () => {
    if (!agForm.hora) { Toast.show('Informe o horário', 'error'); return; }
    if (agForm.local_link && !/^https?:\/\//i.test(agForm.local_link.trim())) { Toast.show('O link do endereço precisa começar com http:// ou https://', 'error'); return; }
    setAgSaving(true);
    try {
      await api.post('/extras/agenda', {
        paciente: sel.contact_name || fmt.phone(sel.phone) || 'Cliente',
        telefone: sel.phone, conversa_id: sel.id, setor: agForm.setor,
        data: agForm.data, hora: agForm.hora, servico: agForm.servico,
        valor: agForm.valor, observacoes: agForm.observacoes, profissional: agForm.profissional,
        forma_pagamento: agForm.forma_pagamento, endereco: agForm.endereco, local_link: agForm.local_link.trim(),
      });
      window.__auditLog?.('agendar', 'agenda', sel.id, { nome: sel.contact_name, data: agForm.data, hora: agForm.hora, setor: agForm.setor });
      Toast.show(`Agendado! ✅ Abatido da meta de ${agForm.setor} 🎯`, 'success');
      setAgendarOpen(false);
      /* 🗓️ Vai direto pra agenda, no dia marcado (ordem do master, 27/08).
         A atendente vê o compromisso na grade e confere na hora se bateu com
         outro horário — antes ela ficava no chat sem saber se entrou. */
      nav(`/agenda?data=${agForm.data}`);
    } catch (e) { Toast.show(e.message || 'Não foi possível agendar', 'error'); }
    setAgSaving(false);
  };

  const totalUnread = useMemo(() => convos.reduce((s, c) => s + (c.unread||0), 0), [convos]);
  const totalQuentes = useMemo(() => convos.filter(c => c.lead_score === 'quente').length, [convos]);
  // Ordena por temperatura quando o modo "quentes primeiro" está ligado (sort estável preserva a recência dentro de cada faixa)
  /* 📌 Fixadas do usuário (pedido do master: "2 colunas — fixadas sem limite
     e a geral; cada um fixa a que quiser dentro do seu usuário"). */
  const [fixadas, setFixadas] = useState([]);
  const loadFixadas = useCallback(() => {
    api.get('/inbox/fixadas').then(d => setFixadas(Array.isArray(d) ? d : [])).catch(() => {});
  }, []); // eslint-disable-line
  useEffect(() => { loadFixadas(); }, [loadFixadas]);
  const fixadasIds = useMemo(() => new Set(fixadas.map(c => c.id)), [fixadas]);
  const toggleFix = useCallback(async (conv) => {
    try {
      const r = await api.post(`/inbox/conversations/${conv.id}/fixar`, {});
      Toast.show(r.fixada ? 'Conversa fixada no topo 📌' : 'Conversa desafixada', 'success');
      loadFixadas();
    } catch (e) { Toast.show(e.message || 'Não foi possível fixar', 'error'); }
  }, [loadFixadas]); // eslint-disable-line

  const convosExib = useMemo(
    () => {
      // Aba "📌 Fixadas" (pedido do master): a lista vira só as fixadas
      if (modo === 'fixadas') return fixadas;
      // 📥 Fila de distribuição: só o que ainda não tem dona (visão do master)
      if (modo === 'distribuir') return convos.filter(c => !c.responsavel_id);
      if (modo === 'duas') return convos;   // a tela separa em duas fileiras
      const base = quentesPrimeiro ? [...convos].sort((a, b) => scoreRank(a.lead_score) - scoreRank(b.lead_score)) : convos;
      // A geral não repete quem está na seção de fixadas
      return fixadasIds.size ? base.filter(c => !fixadasIds.has(c.id)) : base;
    },
    [convos, quentesPrimeiro, fixadasIds, modo, fixadas]
  );

  /* ✍️ A CAIXA DE DIGITAR CRESCE COM O TEXTO (ordem do master, 27/08: "aumenta
     o chat, é muito curto"). Ela nascia com UMA linha e nunca crescia: quem
     escrevia uma proposta longa via só um filete e tinha que rolar dentro da
     caixinha. Agora ela sobe até 170px e só então rola. */
  useEffect(() => {
    const el = textRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(170, Math.max(44, el.scrollHeight))}px`;
  }, [input]);

  /* ─────────────────── RENDER ──────────────────────────────────────────────── */
  return (
    <div className="vh-inbox-wrap" style={{ display:'flex', height:'100vh', overflow:'hidden' }}
      onMouseMove={e => { if (resizing.current) { const w=Math.min(620,Math.max(260,e.clientX-230)); setListWidth(w); } }}
      onMouseUp={() => { if (resizing.current) { try { localStorage.setItem('vh_lista_largura', String(listWidth)); } catch { /* ok */ } }
        resizing.current=false; document.body.style.cursor=''; }}
      onMouseLeave={() => { resizing.current=false; document.body.style.cursor=''; }}>

      {/* ── LISTA DE CONVERSAS ─────────────────────────────────────────────── */}
      <div className={`vh-inbox-list${sel ? ' hidden' : ''}`}
        style={{ width:listCollapsed?0:(modo === 'duas' ? Math.max(listWidth, 640) : listWidth), flexShrink:0, background:'var(--card,#fff)',
        display:'flex', flexDirection:'column', borderRight:'1px solid var(--border)',
        overflow:'hidden', transition:'width .2s ease' }}>
        {/* Header */}
        <div style={{ padding:'12px 12px 0', flexShrink:0, borderBottom:'1px solid var(--border)' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
              <h2 style={{ fontSize:17, fontWeight:700 }}>{user?.setor ? ({vacinas:'Vacinas',consultas:'Consultas',terapias:'Terapias'}[user.setor] || 'Conversas') : 'Conversas'}</h2>
              {totalUnread>0 && <span style={{ background:'var(--tq)', color:'#fff', borderRadius:10, padding:'1px 7px', fontSize:10.5, fontWeight:800, boxShadow:'0 2px 6px rgba(0,184,192,.3)' }}>{totalUnread>99?'99+':totalUnread}</span>}
            </div>
            <div style={{ display:'flex', gap:3, alignItems:'center' }}>
              <span style={{ fontSize:11, color:'var(--muted)' }}>{total.toLocaleString()}</span>
              <button onClick={()=>loadConvos()} className="btn btn-g btn-ico" title="Recarregar"><RefreshCw size={13}/></button>
              <button onClick={()=>setListCollapsed(true)} className="btn btn-g btn-ico" title="Recolher"><PanelLeftClose size={13}/></button>
            </div>
          </div>
        </div>

        <SearchBar value={search} onChange={setSearch} filter={filter} setFilter={setFilter}
          totalUnread={totalUnread} unreadOnly={unreadOnly} setUnreadOnly={setUnreadOnly}
          waiting={waiting} setWaiting={setWaiting}
          setor={setorFiltro} setSetor={setSetorFiltro} mostraSetores={user?.role !== 'atendente'}
          modo={modo} setModo={setModo} counts={{ ...(counts || {}), fixadas: fixadas.length }}
          /* A aba aparece pra quem distribui. O contador só vem preenchido do
             servidor pra essas pessoas, então ele serve de segunda garantia
             se o perfil ainda não tiver recarregado. */
          /* 📥 Quem distribui é o SERVIDOR que diz (counts.souDistribuidor) — o
             login devolvia o usuário sem essa marca e a aba sumia no usuário da
             Danielle. O resto da conta fica de reserva pra token antigo. */
          ehDistribuidor={counts?.souDistribuidor === true || user?.role === 'master'
            || user?.distribuidor === true || (counts?.aDistribuir || 0) > 0}/>

        {/* 📂 Está dentro da pasta de alguém (veio da barra lateral) — a faixa
            avisa de quem é a carteira e traz o caminho de volta pra fila dela. */}
        {respFiltro && (
          <div style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 12px',
            borderBottom:'1px solid var(--border)', background:'var(--bg2)' }}>
            <span style={{ fontSize:11.5, fontWeight:800, color:'var(--txt2)', flex:1, overflow:'hidden',
              textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
              📂 Pasta de {primeiroNomeUtil((atendentes.find(a2 => String(a2.id) === String(respFiltro)) || {}).nome) || 'colaboradora'}
            </span>
            <button onClick={() => nav(`/painel-comercial?pessoa=${respFiltro}`)}
              style={{ border:'1.5px solid #bae6fd', background:'#f0f9ff', borderRadius:8,
                padding:'3px 9px', fontSize:10.5, fontWeight:800, color:'#0369a1', cursor:'pointer', whiteSpace:'nowrap' }}>
              📊 Painel dela
            </button>
            <button onClick={() => abrirPastaDe('')}
              style={{ border:'1.5px solid var(--border)', background:'var(--card,#fff)', borderRadius:8,
                padding:'3px 9px', fontSize:10.5, fontWeight:800, color:'var(--muted)', cursor:'pointer', whiteSpace:'nowrap' }}>
              🏠 Voltar pra minha fila
            </button>
          </div>
        )}

        {setorResumo && (
          <div style={{ padding:'10px 12px', borderBottom:'1px solid var(--border)', background:'var(--bg2)' }}>
            <div style={{ fontSize:10.5, fontWeight:800, letterSpacing:.5, color:'var(--muted)', textTransform:'uppercase', marginBottom:7 }}>{setorResumo.rotulo} · resumo do mês</div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:6 }}>
              {[
                ['Em atend.', setorResumo.emAtendimento, 'var(--tq2)'],
                ['Esperando', setorResumo.esperando, '#dc2626'],
                ['Agendados', setorResumo.agendados, '#2563eb'],
                ['Fechados', setorResumo.vendas, 'var(--ok,#16a34a)'],
              ].map(([l,v,c]) => (
                <div key={l} style={{ background:'var(--card)', borderRadius:8, padding:'6px 4px', textAlign:'center', border:'1px solid var(--border)' }}>
                  <div style={{ fontSize:17, fontWeight:800, color:c }}>{v}</div>
                  <div style={{ fontSize:9.5, color:'var(--muted)', fontWeight:600 }}>{l}</div>
                </div>
              ))}
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, marginTop:6, color:'var(--muted)' }}>
              <span>💰 Vendido: <b style={{ color:'var(--ok,#16a34a)' }}>{fmt.brl(setorResumo.vendido)}</b></span>
              {setorResumo.perdidos > 0 && <span>❌ Perdidos: <b style={{ color:'#dc2626' }}>{setorResumo.perdidos}</b></span>}
            </div>
          </div>
        )}

        {/* 📌 SEÇÃO FIXADAS — sem limite, por usuário; rola sozinha se crescer */}
        {/* 📌 FIXADAS EM DESTAQUE (ordem do master, 24/08): faixa dourada, fundo
            próprio e borda de ouro — as conversas que ela escolheu não se
            perdem no meio da lista geral. */}
        {fixadas.length > 0 && modo !== 'fixadas' && (
          <div style={{ flexShrink:0, maxHeight:'42%', overflowY:'auto',
            background:'linear-gradient(180deg, rgba(196,151,59,.10), rgba(196,151,59,.03))',
            borderTop:'2px solid #C4973B', borderBottom:'2px solid #C4973B',
            boxShadow:'inset 0 0 0 1px rgba(196,151,59,.18)' }}>
            <div style={{ padding:'7px 13px', fontSize:10.5, fontWeight:900, letterSpacing:.9, textTransform:'uppercase',
              color:'#8a6417', background:'linear-gradient(120deg,#fdf0d5,#fdf6e7)', position:'sticky', top:0, zIndex:2,
              display:'flex', alignItems:'center', justifyContent:'space-between', borderBottom:'1px solid rgba(196,151,59,.35)' }}>
              <span style={{ display:'flex', alignItems:'center', gap:6 }}>
                📌 Fixadas
                <span style={{ textTransform:'none', fontWeight:700, fontSize:9.5, opacity:.75 }}>suas conversas de prioridade</span>
              </span>
              <span style={{ background:'#C4973B', color:'#fff', borderRadius:99, padding:'1px 9px', fontSize:10, fontWeight:900 }}>{fixadas.length}</span>
            </div>
            {fixadas.map(c => (
              <div key={c.id} style={{ borderLeft:'3px solid #C4973B' }}>
                <ConvoRow conv={c} selected={sel?.id === c.id} onSelect={openConvo} usersById={usersById}
                  fixada onToggleFix={toggleFix} />
              </div>
            ))}
          </div>
        )}
        {fixadas.length > 0 && modo !== 'fixadas' && (
          <div style={{ flexShrink:0, padding:'6px 13px', fontSize:10, fontWeight:800, letterSpacing:.8, textTransform:'uppercase', color:'var(--muted)', background:'var(--bg2)', borderBottom:'1px solid var(--border)' }}>
            💬 Geral
          </div>
        )}
        <div ref={listContainerRef} style={{ flex:1, minHeight:0 }}>
          {modo === 'duas' ? (
            /* 📥💬 AS DUAS FILEIRAS LADO A LADO (ordem do master, 01/09).
               Esquerda: o que chegou e ainda não tem dona — entrega num toque.
               Direita: a carteira dela. As duas rolam sozinhas, e clicar em
               qualquer uma abre a conversa no chat, do lado. */
            <div style={{ display:'flex', height:'100%', minHeight:0 }}>
              <div style={{ flex:1, minWidth:0, display:'flex', flexDirection:'column', borderRight:'1px solid var(--border)' }}>
                <div style={{ flexShrink:0, padding:'7px 12px', fontSize:10.5, fontWeight:900, letterSpacing:.8,
                  textTransform:'uppercase', color:'#8a6417', background:'linear-gradient(120deg,#fdf0d5,#fdf6e7)',
                  borderBottom:'1px solid rgba(196,151,59,.35)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                  <span>📥 Distribuição</span>
                  <span style={{ background:'#C4973B', color:'#fff', borderRadius:99, padding:'1px 8px', fontSize:10, fontWeight:900 }}>
                    {convosExib.filter(c => !c.responsavel_id).length}
                  </span>
                </div>
                <div style={{ flex:1, minHeight:0, overflowY:'auto' }}>
                  <FilaDistribuicao convos={convosExib.filter(c => !c.responsavel_id)}
                    equipe={atendentes.filter(a2 => a2.id !== user?.id)}
                    onSelect={openConvo} entregando={entregando}
                    eu={user ? { id: user.id, nome: user.nome } : null}
                    grandesPrimeiro={grandesPrimeiro} setGrandesPrimeiro={setGrandesPrimeiro}
                    onDistribuir={distribuirLead} />
                </div>
              </div>
              <div style={{ flex:1, minWidth:0, display:'flex', flexDirection:'column' }}>
                <div style={{ flexShrink:0, padding:'7px 12px', fontSize:10.5, fontWeight:900, letterSpacing:.8,
                  textTransform:'uppercase', color:'var(--tq2)', background:'var(--tq4)',
                  borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                  <span>💬 Meus atendimentos</span>
                  <span style={{ background:'var(--tq)', color:'#fff', borderRadius:99, padding:'1px 8px', fontSize:10, fontWeight:900 }}>
                    {convosExib.filter(c => String(c.responsavel_id || '') === String(user?.id)).length}
                  </span>
                </div>
                <div style={{ flex:1, minHeight:0, overflowY:'auto' }}>
                  {convosExib.filter(c => String(c.responsavel_id || '') === String(user?.id)).length === 0 && (
                    <div style={{ padding:'16px 13px', fontSize:12, color:'var(--muted)', lineHeight:1.6 }}>
                      Nenhuma conversa no seu nome ainda. Use o <b>💎 Fica comigo</b> ao lado pra segurar um negócio grande.
                    </div>
                  )}
                  {convosExib.filter(c => String(c.responsavel_id || '') === String(user?.id)).map(c => (
                    <ConvoRow key={c.id} conv={c} selected={sel?.id === c.id} onSelect={openConvo}
                      usersById={usersById} fixada={fixadasIds.has(c.id)} onToggleFix={toggleFix} />
                  ))}
                </div>
              </div>
            </div>
          ) : modo === 'distribuir' ? (
            <FilaDistribuicao convos={convosExib} equipe={atendentes.filter(a2 => a2.id !== user?.id)}
              onSelect={openConvo} entregando={entregando}
              eu={user ? { id: user.id, nome: user.nome } : null}
              grandesPrimeiro={grandesPrimeiro} setGrandesPrimeiro={setGrandesPrimeiro}
              onDistribuir={distribuirLead} />
          ) : (
            <VirtualList items={convosExib} selectedId={sel?.id} onSelect={openConvo} usersById={usersById}
              containerHeight={listH} loadMore={loadMore} hasMore={hasMore} loadingMore={loadingMore}
              fixadasIds={fixadasIds} onToggleFix={toggleFix}/>
          )}
        </div>

        {/* Rodapé da lista: resumo do dia + controle de som (ocupa o espaço ocioso) */}
        <div style={{ flexShrink:0, borderTop:'1px solid var(--border)', padding:'8px 12px', display:'flex', alignItems:'center', justifyContent:'space-between', gap:8, background:'var(--card,#fff)' }}>
          <div style={{ fontSize:11, color:'var(--muted)', fontWeight:600, display:'flex', gap:10, flexWrap:'wrap' }}>
            <span>{total.toLocaleString()} conversas</span>
            <span style={{ color: totalUnread>0 ? 'var(--tq2)' : 'var(--light)' }}>{totalUnread} não lida{totalUnread===1?'':'s'}</span>
            <span style={{ color:'var(--light)' }}>{convos.filter(c=>c.bot_ativo).length} com bot</span>
            {modo === 'grupos' && ['master','supervisor'].includes(user?.role) && (
              <button onClick={async ()=>{ Toast.show('Buscando todos os grupos na Z-API…', 'info');
                  try { const r2 = await api.post('/inbox/sincronizar-chats', {}); Toast.show(`✅ ${r2.grupos_no_crm} grupo(s) no CRM (${r2.novas} conversa(s) novas)`, 'success'); loadConvos(); }
                  catch (e) { Toast.show(e.message, 'error'); } }}
                style={{ border:'none', cursor:'pointer', fontSize:11, fontWeight:700, padding:'1px 7px', borderRadius:8, background:'var(--tq4)', color:'var(--tq2)' }}>
                ↻ Buscar todos os grupos
              </button>
            )}
            <button onClick={()=>setQuentesPrimeiro(v=>!v)}
              title={quentesPrimeiro ? 'Mostrando leads quentes no topo' : 'Ordenar leads quentes primeiro'}
              style={{ border:'none', cursor:'pointer', fontSize:11, fontWeight:700, padding:'1px 7px', borderRadius:8,
                background: quentesPrimeiro ? '#fee2e2' : 'var(--bg2)', color: quentesPrimeiro ? '#dc2626' : 'var(--light)' }}>
              🔥 {totalQuentes} quente{totalQuentes===1?'':'s'}
            </button>
          </div>
          <button onClick={()=>setSomAtivo(v=>!v)} title={somAtivo?'Som de notificação ligado':'Som de notificação desligado'}
            style={{ width:26, height:26, borderRadius:8, border:'1.5px solid var(--border)', background: somAtivo?'var(--tq3)':'var(--bg2)', color: somAtivo?'var(--tq2)':'var(--light)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
            {somAtivo ? <Volume2 size={13}/> : <VolumeX size={13}/>}
          </button>
        </div>
      </div>

      {/* Resize handle */}
      {!listCollapsed && (
        <div onMouseDown={()=>{resizing.current=true;document.body.style.cursor='col-resize';}}
          title="Arraste para deixar a lista mais larga ou mais estreita"
          style={{ width:6, flexShrink:0, cursor:'col-resize', background:'var(--border)', transition:'background .15s', zIndex:10 }}
          onMouseEnter={e=>e.currentTarget.style.background='var(--tq)'}
          onMouseLeave={e=>{if(!resizing.current)e.currentTarget.style.background='var(--border)';}}/>
      )}

      {/* ── CHAT ───────────────────────────────────────────────────────────── */}
      {!sel ? (
        <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', background:'var(--bg)', position:'relative' }}>
          {listCollapsed && (
            <button onClick={()=>setListCollapsed(false)} style={{ position:'absolute', top:14, left:14, padding:'6px 12px', borderRadius:8, background:'var(--card,#fff)', border:'1.5px solid var(--border)', display:'flex', alignItems:'center', gap:6, fontSize:12, fontWeight:600, cursor:'pointer', color:'var(--txt)' }}>
              <PanelLeftOpen size={13}/> Conversas
            </button>
          )}
          <img src="/logos/logo-icon-color.png" alt="" style={{ width:48, opacity:.1, marginBottom:14 }}/>
          <p style={{ color:'var(--light)', fontSize:13.5 }}>Selecione uma conversa</p>
          <p style={{ color:'var(--light)', fontSize:11.5, marginTop:4 }}>{total.toLocaleString()} conversas · {totalUnread} não lidas</p>
        </div>
      ) : (
        <div className="vh-inbox-chat" style={{ flex:1, display:'flex', flexDirection:'column', minWidth:0 }}>

          {/* Header do chat */}
          <div className="chat-header vh-chat-header" style={{ background:'var(--card,#fff)', padding:'11px 14px', display:'flex', alignItems:'center', gap:9, rowGap:8, flexWrap:'wrap', flexShrink:0 }}>
            {/* ⬅️ No celular: volta pra lista de conversas (ordem do master, 24/08) */}
            <button className="vh-back-btn" onClick={()=>{ setSel(null); setShowInfo(false); setShowAI(false); }} title="Voltar para a lista de conversas">
              <ChevronLeft size={17}/>
            </button>
            {listCollapsed && (
              <button onClick={()=>setListCollapsed(false)} style={{ padding:'5px 7px', borderRadius:8, background:'var(--bg2)', border:'1.5px solid var(--border)', cursor:'pointer', color:'var(--muted)', display:'flex', alignItems:'center', flexShrink:0 }}>
                <PanelLeftOpen size={13}/>
              </button>
            )}
            <div className="avatar-clickable" onClick={abrirFicha} title="Ver ficha completa do cliente" style={{ cursor:'pointer' }}>
              <Avatar conv={sel} size={34} fontSize={11}/>
            </div>
            <div style={{ flex:'1 1 160px', minWidth:0 }}>
              <div style={{ fontWeight:600, fontSize:13.5, display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
                <span onClick={abrirFicha} title="Ver ficha completa do cliente (dados + histórico)"
                  style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', cursor:'pointer', textDecoration:'underline', textDecorationStyle:'dotted', textUnderlineOffset:3 }}>
                  {sel.contact_name}
                </span>
                {/* 🆔 Código único do cliente (pedido do master): diferencia
                    clientes com o mesmo nome. Toque copia pra anotar. */}
                {sel.codigo && (
                  <span style={{ position:'relative', display:'inline-flex', alignItems:'center', gap:3, flexShrink:0 }}>
                    <span onClick={()=>{ try { navigator.clipboard.writeText(`VT-${String(sel.codigo).padStart(4,'0')}`); Toast.show('Código copiado! 🆔','success'); } catch { /* webview sem clipboard */ } }}
                      title="Código único do cliente — toque pra copiar"
                      style={{ display:'inline-flex', alignItems:'center', background:'var(--bg2)', color:'var(--muted)', border:'1px solid var(--border)', borderRadius:6, padding:'1px 7px', fontSize:9.5, fontWeight:800, cursor:'pointer', letterSpacing:.4 }}>
                      🆔 VT-{String(sel.codigo).padStart(4,'0')}
                    </span>
                    {/* ⓘ explicação do código (pedido do master: caixa de texto do lado) */}
                    <span onClick={() => setCodigoInfoOpen(v => !v)} title="O que é este código?"
                      style={{ width:15, height:15, borderRadius:'50%', background:'var(--tq3)', color:'var(--tq2)', fontSize:10, fontWeight:900, display:'inline-flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }}>?</span>
                    {codigoInfoOpen && (
                      <>
                        <span onClick={() => setCodigoInfoOpen(false)} style={{ position:'fixed', inset:0, zIndex:800 }} />
                        <span style={{ position:'absolute', top:'calc(100% + 7px)', left:0, zIndex:801, width:270, padding:'11px 13px', borderRadius:12,
                          background:'var(--card,#fff)', border:'1.5px solid var(--tq)', boxShadow:'0 10px 30px rgba(0,0,0,.25)',
                          fontSize:11.5, fontWeight:500, lineHeight:1.6, color:'var(--txt)', whiteSpace:'normal' }}>
                          🆔 <b>Cada cliente agora tem um código único.</b> Como às vezes dois clientes têm o mesmo nome, o código é a identificação exata dele. Toque no código pra copiar, anote onde quiser — e pesquise por ele na lupa sempre que precisar (ex.: VT-{String(sel.codigo).padStart(4,'0')}).
                        </span>
                      </>
                    )}
                  </span>
                )}
                {sel.bot_ativo && <span style={{ display:'inline-flex', alignItems:'center', gap:2, background:'var(--ok2)', color:'var(--ok)', borderRadius:6, padding:'1px 6px', fontSize:9.5, fontWeight:700, flexShrink:0 }}><Bot size={7}/>Bot</span>}
                {leadData && <span style={{ display:'inline-flex', alignItems:'center', gap:2, background:'var(--tq3)', color:'var(--tq2)', borderRadius:6, padding:'1px 6px', fontSize:9.5, fontWeight:700, flexShrink:0 }}>◆ Lead</span>}
                {sel.last_from === 'contact' && !String(sel.contact_id || '').endsWith('@g.us') && sel.last_message_at && (() => {
                  const min = Math.floor((Date.now() - new Date(sel.last_message_at)) / 60000);
                  if (min < 1) return null;
                  const urgente = min >= 10;
                  const txt = min >= 60 ? `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}` : `${min} min`;
                  return <span title="Há quanto tempo o cliente espera resposta" style={{ display:'inline-flex', alignItems:'center', gap:3, borderRadius:6, padding:'1px 7px', fontSize:9.5, fontWeight:800, flexShrink:0,
                    background: urgente ? 'var(--err2,#fde8e8)' : '#fff7e0', color: urgente ? 'var(--err,#dc2626)' : '#a07514',
                    animation: urgente ? 'pulse 1.6s infinite' : 'none' }}>⏱️ esperando {txt}</span>;
                })()}
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                {/* Telefone do cabeçalho da conversa: visível, mas não selecionável */}
                {sel.phone && (
                  <div data-nocopy="1" onCopy={e => e.preventDefault()} onContextMenu={e => e.preventDefault()}
                    style={{ fontSize:10.5, color:'var(--muted)',
                      userSelect:'none', WebkitUserSelect:'none', MozUserSelect:'none',
                      WebkitTouchCallout:'none', cursor:'default' }}>{fmt.phone(sel.phone)}</div>
                )}
                {/* 🎯 NOTA DO ATENDIMENTO — alerta enquanto falta etapa, parabeniza
                    quando o protocolo fecha. Fica no cabeçalho, à vista o tempo
                    todo: no rodapé só quem procurava enxergava. Clicar abre o
                    protocolo com o texto pronto do passo que falta. */}
                {proto?.nota && (
                  <button onClick={() => { setProtoAberto(true); try { localStorage.setItem('vh_proto_aberto','1'); } catch { /* ok */ } }}
                    title={`${proto.nota.titulo} — ${proto.nota.texto}`}
                    style={{ display:'inline-flex', alignItems:'center', gap:5, border:'none', cursor:'pointer',
                      borderRadius:20, padding:'2px 9px', fontSize:10, fontWeight:800, whiteSpace:'nowrap',
                      background: proto.nota.tipo === 'parabens' ? '#dcfce7' : proto.nota.tipo === 'atencao' ? '#fff7ed' : '#fee2e2',
                      color: proto.nota.tipo === 'parabens' ? '#166534' : proto.nota.tipo === 'atencao' ? '#9a3412' : '#991b1b' }}>
                    {proto.nota.tipo === 'parabens' ? '🎉' : proto.nota.tipo === 'atencao' ? '👏' : '⚠️'}
                    Nota {String(proto.nota.valor).replace('.', ',')}
                    <span style={{ opacity:.85, fontWeight:700 }}>
                      · {proto.nota.tipo === 'parabens' ? 'protocolo completo' : proto.nota.proximo?.titulo || 'siga o protocolo'}
                    </span>
                  </button>
                )}
              </div>
            </div>

            {/* Ferramentas do atendimento — agrupadas com quebra automática (não cortam ao dar zoom) */}
            <div style={{ display:'flex', alignItems:'center', gap:6, rowGap:6, flexWrap:'wrap', minWidth:0 }}>
            {/* 🧹 Responsável e status SAÍRAM da barra (ordem do master, 28/08):
                aqui ficam só as três ações. Responsável já é cartão no painel de
                contexto e o status virou cartão lá também — nada se perdeu. */}
            <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
              {/* ═══ AÇÕES DO ATENDIMENTO ═══════════════════════════════════
                  UX (ordem do master, 24/08): na barra ficam só as ações do dia
                  a dia, num visual calmo. Todo o resto foi pro menu "Mais",
                  que abre ali do lado. Antes eram 15 botões coloridos brigando
                  entre si; agora são 5 e um menu. */}
              {(() => {
                const calmo = (ativo = false) => ({
                  fontSize: 11.5, padding: '5px 11px', fontWeight: 700, borderRadius: 9, cursor: 'pointer',
                  border: `1px solid ${ativo ? 'var(--tq)' : 'var(--border)'}`,
                  background: ativo ? 'var(--tq4,#e8f7f8)' : 'var(--bg2)',
                  color: ativo ? 'var(--tq2)' : 'var(--txt2)',
                  display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap',
                });
                const itemMenu = {
                  display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left',
                  padding: '9px 13px', border: 'none', background: 'transparent', cursor: 'pointer',
                  fontSize: 12.5, color: 'var(--txt2)', fontWeight: 600,
                };
                const fecharMais = () => setMaisAberto(false);
                /* 🎯 DUAS AÇÕES NA BARRA (ordem do master, 28/08: primeiro
                   as três, depois "retira o resumo da conversa"). O resto
                   — IA, Dados, Fixar, Transferir, reiniciar boas-vindas — foi
                   pro menu Mais. Transferir também está no painel de contexto. */
                return (<>
                  <button onClick={abrirVenda} title="Registrar uma venda deste atendimento (entra na meta)"
                    style={{ ...calmo(), borderColor:'#C4973B', background:'#fdf6e7', color:'#8a6417', fontWeight:800 }}>
                    💰 Registrar venda
                  </button>
                  <button onClick={abrirAgendar} title="Agendar este atendimento (conta na meta do mês)" style={calmo()}>
                    <CalendarDays size={12}/> Agendar
                  </button>

                  {/* ⋯ Mais: tudo o que não é do dia a dia */}
                  <div style={{ position: 'relative' }}>
                    <button onClick={()=>setMaisAberto(v=>!v)} style={calmo(maisAberto)} title="Mais ações deste atendimento">
                      ⋯ Mais
                    </button>
                    {maisAberto && (<>
                      <div onClick={fecharMais} style={{ position:'fixed', inset:0, zIndex:40 }} />
                      <div style={{ position:'absolute', right:0, top:'calc(100% + 6px)', zIndex:41, width:236,
                        background:'var(--card,#fff)', border:'1px solid var(--border)', borderRadius:12,
                        boxShadow:'0 12px 34px rgba(0,0,0,.22)', overflow:'hidden', padding:'5px 0' }}>

                        <button style={itemMenu} onClick={async ()=>{ fecharMais(); setResumoLoad(true); setResumo(null);
                          try { setResumo(await api.get(`/inbox/conversations/${sel.id}/resumo`)); }
                          catch (e) { setResumo({ erro: e.message }); } setResumoLoad(false); }}>
                          📋 <span>Resumo da conversa</span>
                        </button>
                        <button style={itemMenu} onClick={()=>{ fecharMais(); abrirTransferir(); }}>
                          🔁 <span>Transferir atendimento</span>
                        </button>
                        <button style={itemMenu} onClick={()=>{ fecharMais(); setShowInfo(p=>!p); setShowAI(false); }}>
                          🏷️ <span>Dados do cliente</span>
                        </button>
                        <button style={itemMenu} onClick={()=>{ fecharMais(); toggleFix(sel); }}>
                          📌 <span>{fixadasIds.has(sel.id) ? 'Desafixar conversa' : 'Fixar no topo da lista'}</span>
                        </button>
                        {(user?.role === 'master' || user?.ia_consultas === true) && (
                          <button style={itemMenu} onClick={()=>{ fecharMais(); toggleBot(); }}>
                            ✨ <span>{sel.bot_ativo ? 'Desligar a IA nesta conversa' : 'Ligar a IA nesta conversa'}</span>
                          </button>
                        )}
                        <button style={itemMenu} onClick={()=>{ fecharMais(); setShowAI(true); setShowInfo(false); }}>
                          ✨ <span>Assistente de vendas</span>
                        </button>
                        <button style={itemMenu} onClick={()=>{ fecharMais(); abrirFollow(); }}>
                          🔁 <span>Colocar no repique</span>
                        </button>
                        <button style={itemMenu} onClick={()=>{ fecharMais(); setEncForm({ destino: '', mensagens: 20, observacao: '' }); setEncOpen(true); api.get('/inbox/encaminhar-destino').then(setEncDestino).catch(()=>setEncDestino(null)); }}>
                          📤 <span>Encaminhar conversa</span>
                        </button>
                        <button style={itemMenu} onClick={()=>{ fecharMais(); estudarConversa(); }} disabled={estudoBusy}>
                          📚 <span>Guardar em Estudos</span>
                        </button>

                        <div style={{ height:1, background:'var(--border)', margin:'5px 0' }} />

                        {['master','supervisor'].includes(user?.role) && (
                          <button style={itemMenu} onClick={()=>{ fecharMais(); setFotosModo(f=>!f); }}>
                            🖼️ <span>{fotosModo ? 'Parar de selecionar fotos' : 'Exportar fotos'}</span>
                          </button>
                        )}
                        <button style={itemMenu} onClick={async ()=>{ fecharMais();
                          try { await api.post(`/inbox/conversations/${sel.id}/reset-triagem`); Toast.show('Triagem reiniciada — o próximo "oi" recebe as boas-vindas 💎', 'success'); }
                          catch(e){ Toast.show(e.message, 'error'); } }}>
                          ↺ <span>Reiniciar boas-vindas</span>
                        </button>
                        {/* 👥 Quando várias mensagens saíram assinadas errado, trocar
                            uma por uma não resolve — aqui vai tudo de uma vez. */}
                        {user?.role === 'master' && sel && (
                          <button style={itemMenu} onClick={()=>{ fecharMais();
                            setTrocaRemet({ varias: true });
                            if (!atendentes.length) api.get('/inbox/atendentes').then(d => setAtendentes(Array.isArray(d) ? d : [])).catch(()=>{});
                          }}>
                            👥 <span>Trocar quem assinou as últimas</span>
                          </button>
                        )}
                        {/* 👁 Abrir a conversa pra casa toda (só master). Nasceu da Dra.
                            Nágila Maria (27/08): mesmo em carteira fechada, a equipe vê. */}
                        {user?.role === 'master' && sel && (
                          <button style={itemMenu} onClick={async ()=>{ fecharMais();
                            const abrir = !sel.visivel_todos;
                            try {
                              await api.patch(`/inbox/conversations/${sel.id}/visivel-todos`, { visivel: abrir });
                              setSel(p => p ? { ...p, visivel_todos: abrir } : p);
                              setConvos(p => p.map(c => c.id === sel.id ? { ...c, visivel_todos: abrir } : c));
                              Toast.show(abrir ? 'Agora a equipe inteira enxerga esta conversa 👁' : 'Conversa voltou às regras normais', 'success');
                            } catch (e) { Toast.show(e.message, 'error'); }
                          }}>
                            👁 <span>{sel.visivel_todos ? 'Voltar às regras normais' : 'Mostrar pra equipe toda'}</span>
                          </button>
                        )}
                        {['master','supervisor'].includes(user?.role) && sel && (
                          <button style={{ ...itemMenu, color:'var(--err,#dc2626)' }} onClick={async ()=>{ fecharMais();
                            const arquivar = !sel.arquivada;
                            if (arquivar && !window.confirm(`Tirar ${sel.contact_name || 'este contato'} do atendimento geral?\n\nEle sai da lista, a IA para de agir nele e o histórico continua guardado.`)) return;
                            try {
                              await api.patch(`/inbox/conversations/${sel.id}/arquivar`, { arquivada: arquivar });
                              Toast.show(arquivar ? 'Contato fora do atendimento geral 🗄️' : 'Contato de volta ao atendimento', 'success');
                              setConvos(p => p.filter(c => c.id !== sel.id));
                              if (arquivar) setSel(null);
                            } catch (e) { Toast.show(e.message, 'error'); }
                          }}>
                            🗄️ <span>{sel.arquivada ? 'Trazer de volta' : 'Tirar do atendimento'}</span>
                          </button>
                        )}
                      </div>
                    </>)}
                  </div>
                </>);
              })()}
            </div>
            </div>
          </div>

          {/* Faixa de contexto: Interesse · Responsável · Etapa · Meta do setor */}
          <FaixaContexto sel={sel} leadInfo={leadInfo} setLeadInfo={setLeadInfo} api={api}
            scoreChip={scoreChip} setScoreChip={setScoreChip} usersById={usersById} metaSetor={metaSetor}
            changeResp={changeResp} setSel={setSel} setConvos={setConvos} onTransferir={abrirTransferir} />

          {/* Área de mensagens + info panel */}
          <div style={{ flex:1, display:'flex', minHeight:0, overflow:'hidden' }}>
            {/* Mensagens */}
            <div ref={msgAreaRef} className="chat-bg" style={{ flex:1, overflowY:'auto', padding:'12px 14px', display:'flex', flexDirection:'column', gap:3 }}>
              {msgsHasMore && (
                <div style={{ textAlign:'center', marginBottom:8 }}>
                  <button onClick={loadOlderMsgs} disabled={loadingOlderMsgs}
                    style={{ padding:'5px 16px', borderRadius:20, background:'var(--card,#fff)', border:'1.5px solid var(--border)', fontSize:11.5, fontWeight:600, cursor:loadingOlderMsgs?'default':'pointer', color:'var(--muted)', display:'inline-flex', alignItems:'center', gap:5 }}>
                    {loadingOlderMsgs?<Loader2 size={11} style={{animation:'spin 1s linear infinite'}}/>:<ChevronUp size={11}/>}
                    {loadingOlderMsgs?'Carregando…':'Ver mensagens anteriores'}
                  </button>
                </div>
              )}
              {msgs.map((m, i) => (
                <MsgItem key={m.id||i} m={m} prevMsg={msgs[i-1] || null} contactName={sel.contact_name} channel={sel.channel} onLightbox={abrirOuSelecionar} token={token} onEditar={editarMensagem} onApagar={apagarMensagem}
                  onTrocarRemetente={user?.role === 'master' ? trocarRemetente : null} fotoSel={!!fotosSel[m.id]}/>
              ))}
              <div ref={endRef}/>
            </div>

            {/* Copiloto IA — painel lateral */}
            {showAI && sel && (
              <Copiloto key={sel.id} conv={sel}
                onUse={t=>{setInput(t);textRef.current?.focus();}}
                onClose={()=>setShowAI(false)} />
            )}

            {/* Info panel */}
            {showInfo && (
              // Mais largo (pedido do master): botões do perfil visíveis sem aperto
              <div style={{ width:'min(350px, 88vw)', flexShrink:0, borderLeft:'1px solid var(--border)', background:'var(--card,#fff)', overflowY:'auto', display:'flex', flexDirection:'column' }}>
                <div style={{ padding:'14px 14px 10px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <span style={{ fontWeight:700, fontSize:13 }}>Informações</span>
                  <button onClick={()=>setShowInfo(false)} style={{ padding:4, background:'none', border:'none', cursor:'pointer', color:'var(--muted)' }}>✕</button>
                </div>
                {/* 🩺 Prontuário sempre presente (não depende de lead) — pedido do master */}
                <Prontuario sel={sel} api={api} user={user} />
                {sel.lead_id && <FichaPaciente leadId={sel.lead_id} api={api} setor={sel.setor} />}
                <div style={{ padding:'16px 14px', textAlign:'center', borderBottom:'1px solid var(--border)' }}>
                  <div className={sel.profile_pic ? 'avatar-clickable' : ''} style={{ display:'inline-block' }} onClick={()=>sel.profile_pic && setLightbox(sel.profile_pic)} title={sel.profile_pic ? 'Ver foto de perfil' : ''}>
                    <Avatar conv={sel} size={72} fontSize={22}/>
                  </div>
                  <div style={{ fontWeight:700, fontSize:15, marginBottom:3, marginTop:10 }}>{sel.contact_name}</div>
                  {sel.codigo && (
                    <div onClick={()=>{ try { navigator.clipboard.writeText(`VT-${String(sel.codigo).padStart(4,'0')}`); Toast.show('Código copiado! 🆔','success'); } catch { /* ok */ } }}
                      title="Código único do cliente — toque pra copiar"
                      style={{ display:'inline-block', fontSize:11.5, fontWeight:800, color:'var(--tq2)', background:'var(--tq3)', borderRadius:8, padding:'2px 10px', marginBottom:6, cursor:'pointer', letterSpacing:.5 }}>
                      🆔 VT-{String(sel.codigo).padStart(4,'0')}
                    </div>
                  )}
                  {sel.codigo && (
                    <div style={{ margin:'0 10px 8px', padding:'7px 10px', borderRadius:9, background:'var(--bg2)', border:'1px dashed var(--border)', fontSize:10.5, color:'var(--muted)', lineHeight:1.55, textAlign:'left' }}>
                      Este é o <b>código de identificação do cliente</b> — como às vezes dois clientes têm o mesmo nome, o código diferencia com certeza. Toque nele pra copiar, salve onde quiser e pesquise por ele na lupa quando precisar.
                    </div>
                  )}
                  {/* Telefone do perfil: legível mas NÃO copiável (mesma trava do
                      cabeçalho — este aqui tinha ficado de fora, furo achado na
                      pergunta do master "elas conseguem copiar o telefone?") */}
                  {sel.phone && (
                    <div data-nocopy="1" onCopy={e => e.preventDefault()} onContextMenu={e => e.preventDefault()}
                      style={{ fontSize:12.5, color:'var(--muted)', marginBottom:8,
                        userSelect:'none', WebkitUserSelect:'none', MozUserSelect:'none',
                        WebkitTouchCallout:'none', cursor:'default' }}>+{sel.phone}</div>
                  )}
                  <StatusBadge status={sel.status_atend} size="sm"/>
                  {/* ⏱ Tempo de espera do cliente — mudou da lista pra cá (pedido do master) */}
                  {sel.last_from === 'contact' && !String(sel.contact_id || '').endsWith('@g.us') && sel.last_message_at && (() => {
                    const minE = Math.floor((Date.now() - new Date(sel.last_message_at)) / 60000);
                    if (minE < 1) return null;
                    const txtE = minE >= 60 ? `${Math.floor(minE / 60)}h${String(minE % 60).padStart(2, '0')}` : `${minE} min`;
                    const corE = minE >= 120 ? '#dc2626' : minE >= 30 ? '#f97316' : '#f59e0b';
                    return (
                      <div style={{ marginTop: 8 }}>
                        <span style={{ fontSize: 11.5, fontWeight: 800, color: '#fff', background: corE, borderRadius: 9, padding: '3px 11px' }}>
                          ⏱ Esperando resposta há {txtE}
                        </span>
                      </div>
                    );
                  })()}
                  <div style={{ display:'flex', justifyContent:'center', gap:6, marginTop:10 }}>
                    <a href={`https://wa.me/55${sel.phone?.replace(/\D/g,'')}`} target="_blank" rel="noreferrer"
                      onContextMenu={e => e.preventDefault()} draggable={false}
                      style={{ padding:'5px 12px', background:'#25D366', color:'#fff', borderRadius:8, fontSize:11.5, fontWeight:700, textDecoration:'none', display:'flex', alignItems:'center', gap:4 }}>
                      <WA s={11}/> WhatsApp
                    </a>
                    <button onClick={async()=>{
                        try {
                          await api.post(`/inbox/conversations/${sel.id}/load-from-zapi`);
                          const d = await api.get(`/inbox/conversations/${sel.id}`);
                          if (d.profile_pic) {
                            setSel(prev=>({ ...prev, profile_pic:d.profile_pic }));
                            setConvos(prev=>prev.map(x=>x.id===sel.id?{...x, profile_pic:d.profile_pic}:x));
                          }
                        } catch {}
                      }}
                      title="Buscar foto e dados atualizados do contato no WhatsApp"
                      style={{ padding:'5px 12px', background:'var(--tq3)', color:'var(--tq2)', borderRadius:8, fontSize:11.5, fontWeight:700, border:'none', cursor:'pointer', display:'flex', alignItems:'center', gap:4 }}>
                      <RefreshCw size={11}/> Atualizar
                    </button>
                  </div>
                  <div style={{ marginTop:12, paddingTop:12, borderTop:'1px solid var(--border)' }}>
                    <div style={{ fontSize:10.5, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:.5, marginBottom:7 }}>Mover para pasta</div>
                    <div style={{ display:'flex', gap:6 }}>
                      <button onClick={()=>moverPasta(sel.categoria==='fidelidade'?null:'fidelidade')}
                        className="btn btn-sm" style={{ flex:1, fontSize:11, fontWeight:700, background:sel.categoria==='fidelidade'?'#C4973B':'var(--bg2)', color:sel.categoria==='fidelidade'?'#fff':'var(--muted)', border:'1.5px solid #e3c98a' }}>
                        ⭐ Fidelidade
                      </button>
                      <button onClick={()=>moverPasta(sel.categoria==='banco_dados'?null:'banco_dados')}
                        className="btn btn-sm" style={{ flex:1, fontSize:11, fontWeight:700, background:sel.categoria==='banco_dados'?'#0E8C96':'var(--bg2)', color:sel.categoria==='banco_dados'?'#fff':'var(--muted)', border:'1.5px solid #9fd6da' }}>
                        🗂️ Banco
                      </button>
                    </div>
                    {sel.categoria && <div style={{ fontSize:11, color:'var(--muted)', marginTop:6 }}>Nesta pasta. Clique de novo pra tirar.</div>}
                  </div>
                  {user?.role === 'master' && (
                    <div style={{ marginTop:12, paddingTop:12, borderTop:'1px solid var(--border)' }}>
                      <button onClick={marcarExemplo} className="btn btn-sm" style={{ width:'100%', fontWeight:700, background:'#fef3c7', color:'#92600a', border:'1.5px solid #fcd34d' }}>
                        ⭐ Usar como exemplo da IA
                      </button>
                      <div style={{ fontSize:10.5, color:'var(--muted)', marginTop:5 }}>A IA estuda conversas que converteram pra copiar o jeito.</div>
                    </div>
                  )}
                </div>
                {leadData ? (
                  <div style={{ padding:'12px 14px', borderBottom:'1px solid var(--border)' }}>
                    <div style={{ fontSize:10.5, fontWeight:700, color:'var(--tq2)', textTransform:'uppercase', letterSpacing:.6, marginBottom:9 }}>◆ Lead no Funil</div>
                    {[['Interesse',leadData.interesse],['Status',leadData.status],leadData.valor_proposta>0&&['Proposta',`R$ ${parseFloat(leadData.valor_proposta).toFixed(2).replace('.',',')}`]].filter(Boolean).map(([k,v])=>(
                      <div key={k} style={{ display:'flex', justifyContent:'space-between', marginBottom:6, fontSize:12.5 }}>
                        <span style={{ color:'var(--muted)' }}>{k}</span>
                        <span style={{ fontWeight:600 }}>{v}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ padding:'12px 14px', borderBottom:'1px solid var(--border)' }}>
                    <div style={{ fontSize:12, color:'var(--muted)', marginBottom:8 }}>Não é lead ainda</div>
                    <button onClick={toLead} className="btn btn-p btn-sm" style={{ width:'100%', justifyContent:'center' }}><UserPlus size={12}/> Adicionar ao funil</button>
                  </div>
                )}
                {/* Barra de ações (mock): atalhos pra tudo dentro da conversa */}
            <div style={{ display:'flex', gap:6, padding:'8px 14px 0', overflowX:'auto', flexShrink:0 }}>
              {[
                ['📅','Agendar', ()=>setShowAgendar(true)],
                ['💰','Orçamento', ()=> sel?.setor === 'terapias' ? setShowTerapia(true) : setShowProposta(true)],
                ['📷','Experiência', ()=>{setBibAba('foto');setShowBib(true);}],
                ['🎁','Indicação', ()=>setShowIndicar(true)],
                ['📋','Dados', ()=>{setShowInfo(p=>!p);setShowAI(false);}],
                ['🤖','IA', ()=>{setShowAI(p=>!p);setShowInfo(false);}],
                ['📞','Ligar', ()=>{ if(sel?.phone) window.open(`tel:+55${String(sel.phone).replace(/\D/g,'')}`); }],
                ['📄','Modelos', ()=>{setShowQR(p=>!p);setShowEmoji(false);}],
                ['😊','Figurinhas', ()=>{setBibAba('figurinha');setShowBib(true);}],
                ['📎','Anexos', ()=>fileRef.current?.click()],
              ].map(([ic,l,fn])=>(
                <button key={l} onClick={fn}
                  style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:2, padding:'7px 11px', borderRadius:11, border:'1px solid var(--border)', background:'var(--card,#fff)', cursor:'pointer', flexShrink:0, minWidth:62 }}>
                  <span style={{ fontSize:15, lineHeight:1 }}>{ic}</span>
                  <span style={{ fontSize:9, fontWeight:700, color:'var(--muted)' }}>{l}</span>
                </button>
              ))}
            </div>
            <div style={{ padding:'12px 14px' }}>
                  <div style={{ fontSize:10.5, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:.6, marginBottom:9 }}>Estatísticas</div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:7 }}>
                    {[['Mensagens',msgsTotal||msgs.length],['Não lidas',sel.unread||0],['Canal',sel.channel==='whatsapp'?'WhatsApp':'Instagram'],['Bot',sel.bot_ativo?'✅ Ativo':'⏸ Inativo']].map(([k,v])=>(
                      <div key={k} style={{ background:'var(--bg)', borderRadius:8, padding:'9px 10px', textAlign:'center' }}>
                        <div style={{ fontWeight:800, fontSize:15 }}>{v}</div>
                        <div style={{ fontSize:10.5, color:'var(--muted)', marginTop:2 }}>{k}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Quick replies */}
          {showQR && (
            <div style={{ background:'var(--card,#fff)', borderTop:'1px solid var(--border)', padding:'8px 12px', flexShrink:0 }}>
              <div style={{ display:'flex', gap:5, flexWrap:'wrap', maxHeight:78, overflowY:'auto' }}>
                <button onClick={()=>setQrNovo(p => p ? null : { titulo:'', texto:'' })}
                  style={{ padding:'4px 11px', borderRadius:8, background: qrNovo ? 'var(--tq)' : 'var(--card,#fff)', color: qrNovo ? '#fff' : 'var(--tq2)', border:'1.5px dashed var(--tq)', fontSize:12, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', gap:4 }}>
                  <Plus size={11}/> Cadastrar mensagem
                </button>
                {/* 📸 PROVA SOCIAL (ordem do master, 27/08: "coloca uma também de
                    prova social com fotos, onde carregue as fotos"). Não é texto:
                    um toque manda o conjunto de fotos reais da casa, escolhidas
                    pelo setor da conversa. Fica fixa aqui, ninguém apaga sem querer. */}
                <button onClick={async ()=>{
                    if (!sel || provaEnviando) return;
                    setProvaEnviando(true);
                    try {
                      const r = await api.post(`/inbox/conversations/${sel.id}/prova-social`, {});
                      Toast.show(r?.enviadas ? `${r.enviadas} fotos enviadas 📸` : 'Fotos enviadas 📸', 'success');
                      setShowQR(false);
                    } catch (e) { Toast.show(e.message || 'Não consegui enviar as fotos', 'error'); }
                    setProvaEnviando(false);
                  }}
                  disabled={provaEnviando}
                  title="Envia o conjunto de fotos reais de atendimento (prova social)"
                  style={{ padding:'4px 11px', borderRadius:8, background:'var(--gold2,#fdf5e8)', color:'var(--gold,#C4973B)',
                    border:'1.5px solid var(--gold,#C4973B)', fontSize:12, fontWeight:700,
                    cursor: provaEnviando ? 'wait' : 'pointer', opacity: provaEnviando ? .6 : 1 }}>
                  📸 {provaEnviando ? 'Enviando fotos…' : 'Fotos de prova social'}
                </button>
                {qr.map(q=>{
                  const podeExcluir = q.minha || (gestaoUser && q.global) || q.minha === undefined;
                  return (
                    <span key={q.id} style={{ display:'inline-flex', alignItems:'center', background:'var(--tq3)', border:'1px solid var(--tq3)', borderRadius:8, overflow:'hidden' }}>
                      <button onClick={()=>{setInput(q.texto);setShowQR(false);textRef.current?.focus();}} title={q.texto} style={{ padding:'4px 6px 4px 11px', background:'none', color:'var(--tq2)', border:'none', fontSize:12, fontWeight:600, cursor:'pointer' }}>{q.titulo}</button>
                      {podeExcluir && <button onClick={(e)=>excluirQr(q,e)} title="Excluir mensagem" style={{ padding:'4px 7px 4px 3px', background:'none', border:'none', color:'var(--tq2)', opacity:.55, cursor:'pointer', display:'flex' }}><X size={11}/></button>}
                    </span>
                  );
                })}
              </div>
              {qrNovo && (
                <div style={{ display:'flex', gap:6, marginTop:8, alignItems:'center', flexWrap:'wrap' }}>
                  <input value={qrNovo.titulo} maxLength={60} onChange={e=>setQrNovo({...qrNovo, titulo:e.target.value})} placeholder="Título (ex: Endereço da clínica)"
                    style={{ width:200, padding:'6px 10px', borderRadius:9, border:'1.5px solid var(--border)', fontSize:12, outline:'none', background:'var(--bg)', color:'var(--txt)' }} />
                  <input value={qrNovo.texto} maxLength={1000} onChange={e=>setQrNovo({...qrNovo, texto:e.target.value})} placeholder="Mensagem que será enviada…"
                    onKeyDown={e=>{ if(e.key==='Enter') salvarQrNovo(); }}
                    style={{ flex:1, minWidth:220, padding:'6px 10px', borderRadius:9, border:'1.5px solid var(--border)', fontSize:12, outline:'none', background:'var(--bg)', color:'var(--txt)' }} />
                  <button onClick={salvarQrNovo} disabled={!qrNovo.titulo.trim() || !qrNovo.texto.trim()} className="btn btn-p btn-sm"
                    style={{ opacity: (!qrNovo.titulo.trim() || !qrNovo.texto.trim()) ? .5 : 1, fontSize:11.5 }}>Salvar</button>
                </div>
              )}
            </div>
          )}

          {/* Banco de documentos — envie os principais ao cliente em 1 clique */}
          {showDocs && (
            <div style={{ background:'var(--card,#fff)', borderTop:'1px solid var(--border)', padding:'8px 12px', flexShrink:0 }}>
              <input ref={docFileRef} type="file" accept="application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,image/*" style={{ display:'none' }} onChange={anexarDoc} />
              <div style={{ display:'flex', gap:6, flexWrap:'wrap', maxHeight:110, overflowY:'auto', alignItems:'flex-start' }}>
                <button onClick={()=>docFileRef.current?.click()}
                  style={{ padding:'6px 12px', borderRadius:9, background:'var(--card,#fff)', color:'#0d9488', border:'1.5px dashed #0d9488', fontSize:12, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', gap:5 }}>
                  <Plus size={12}/> Adicionar documento
                </button>
                {docs.length === 0 && <span style={{ fontSize:12, color:'var(--muted)', alignSelf:'center' }}>Nenhum documento ainda. Adicione os que você mais envia (tabela de preços, protocolos, contrato…).</span>}
                {docs.map(d=>{
                  const podeExcluir = d.meu || gestaoUser;
                  return (
                    <span key={d.id} style={{ display:'inline-flex', alignItems:'center', background:'rgba(13,148,136,.12)', border:'1px solid rgba(13,148,136,.25)', borderRadius:9, overflow:'hidden', maxWidth:210 }}>
                      <button onClick={()=>enviarDoc(d)} disabled={docEnviando===d.id || !sel} title={sel ? `Enviar "${d.nome}" ao cliente` : 'Abra uma conversa'}
                        style={{ padding:'6px 6px 6px 11px', background:'none', color:'#0d9488', border:'none', fontSize:12, fontWeight:700, cursor: sel?'pointer':'not-allowed', display:'flex', alignItems:'center', gap:5, minWidth:0 }}>
                        <FileText size={13} style={{ flexShrink:0 }}/>
                        <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{docEnviando===d.id ? 'Enviando…' : d.nome}</span>
                      </button>
                      {podeExcluir && <button onClick={(e)=>excluirDoc(d,e)} title="Excluir do banco" style={{ padding:'6px 8px 6px 3px', background:'none', border:'none', color:'#0d9488', opacity:.55, cursor:'pointer', display:'flex' }}><X size={11}/></button>}
                    </span>
                  );
                })}
              </div>
              <div style={{ fontSize:10.5, color:'var(--muted)', marginTop:6 }}>💡 Clique num documento pra enviar ao cliente da conversa aberta.</div>
            </div>
          )}

          {/* Preview de arquivo (imagem / vídeo / PDF) */}
          {filePreview && (
            <div style={{ background:'var(--bg)', borderTop:'1px solid var(--border)', padding:'10px 12px', flexShrink:0, display:'flex', alignItems:'center', gap:10 }}>
              <div style={{ position:'relative', flexShrink:0 }}>
                {filePreview.type==='image' && (
                  <img src={filePreview.url} alt="" style={{ width:76, height:76, objectFit:'cover', borderRadius:8 }}/>
                )}
                {filePreview.type==='video' && (
                  <div style={{ width:76, height:76, background:'#000', borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center' }}>
                    <Play size={22} color="#fff"/>
                  </div>
                )}
                {filePreview.type==='document' && (
                  <div style={{ width:76, height:76, background:'var(--err2)', borderRadius:8, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:4 }}>
                    <FileText size={26} color="var(--err)"/>
                    <span style={{ fontSize:9, fontWeight:700, color:'var(--err)', textTransform:'uppercase' }}>
                      {filePreview.name?.split('.').pop()?.toUpperCase() || 'FILE'}
                    </span>
                  </div>
                )}
                <button onClick={()=>{if(filePreview.url)URL.revokeObjectURL(filePreview.url);setFilePreview(null);}} style={{ position:'absolute', top:-6, right:-6, width:19, height:19, borderRadius:'50%', background:'var(--err)', color:'#fff', border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontSize:9 }}>✕</button>
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:12.5, fontWeight:600, marginBottom:3, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{filePreview.name}</div>
                <div style={{ fontSize:11.5, color:'var(--muted)' }}>
                  {filePreview.type==='image'?'📷 Imagem':filePreview.type==='video'?'🎥 Vídeo':'📎 Documento'} · pronto para enviar
                </div>
              </div>
              <button onClick={sendFilePreview} disabled={sending} className="btn btn-p btn-sm" style={{ gap:5, minWidth:90, opacity: sending ? 0.7 : 1 }}>
                {sending
                  ? <><Loader2 size={13} style={{animation:'spin 1s linear infinite'}}/> Enviando…</>
                  : <><Send size={12}/> Enviar</>
                }
              </button>
            </div>
          )}

          {/* 📝 Mensagens prontas — modelos oficiais pra enviar na mão */}
          {showProntas && sel && (() => {
            const nomeC = sel.contact_name || '{CLIENTE}';
            const at1 = String(user?.nome || '').split(' ')[0];
            const pac = proto?.paciente || '{PACIENTE}';
            const ENDER = '🏥 Nosso endereço, Clínica Vittalis Saúde:\nEd. Business Center, Térreo\nAv. Cel. Colares Moreira, 3A, Renascença\nSão Luís/MA\n🗺️ Como chegar: https://share.google/cJwx0T5DVaCxZyc6I';
            const INSTA = '📸 Acompanhe momentos de cuidado no nosso Instagram: https://www.instagram.com/vittalissaudeslz/';
            const cartao = (linhas) => linhas.join('\n');
            const GRUPOS_PRONTAS = [
              ['👋 Atendimento', [
                ['Boas-vindas', `Oi! 💙 Que alegria receber sua mensagem! Eu sou a ${at1}, da Vittalis Saúde, e a partir de agora cuido de vocês pessoalmente, tá? Me conta: o que o seu pequeno tem precisado? 😊`],
                ['Perguntar o nome do paciente', 'Pra eu cuidar de vocês do jeitinho certo: qual é o nome e a idade do seu pequeno ou da sua pequena? 🥰 Assim já preparo tudo pensando nele(a).'],
                ['Aviso de ligação', `Uma ligação rapidinha resolve mais que 20 mensagens 😊 Estarei te ligando daqui a pouquinho pra te explicar tudo com calma, tá bem? 💙`],
                ['Convite de agendamento', `Vamos garantir o horário de ${pac}? 💙 Nossa agenda é bem procurada e quero deixar o melhor reservado pra vocês. Prefere manhã ou tarde?`],
              ]],
              ['📍 Endereço e casa', [
                ['Endereço da clínica', `📍 Nosso endereço, Clínica Vittalis Saúde 💎\n🏥 Ed. Business Center, Térreo\nAv. Cel. Colares Moreira, 3A, Renascença\nSão Luís/MA\n🗺️ Como chegar (Google Maps):\nhttps://share.google/cJwx0T5DVaCxZyc6I\nEstamos te esperando de braços abertos 💙 Quer que eu já deixe um horário reservado pra sua visita? 😊`],
                ['Clínica ou em casa? (ambos)', `${nomeC}, atendemos dos dois jeitinhos 💙 E aqui vai algo que nos orgulha muito: somos a única clínica que também atende na sua casa. Pensamos no conforto da família, sabemos que muitos pais não conseguem se deslocar. Por isso enviamos nossos profissionais até a sua residência, com o mesmo carinho e o mesmo cuidado da clínica. Para vocês, fica melhor em sua residência ou em nossa clínica? 😊`],
                ['Plano de saúde (resposta oficial)', 'Nós atendemos somente de forma particular. Isso porque queremos garantir que cada consulta seja sem pressa, que o plano tanto exige, e com toda atenção, que cada cliente merece. Ajudamos ainda mais com o reembolso, pois emitimos a nota fiscal. E a maioria dos planos devolvem o valor. Ainda trabalhamos com parcelamento no cartão de crédito. Tudo para que o nosso cliente tenha o melhor atendimento 💙 Quer que eu veja um horário para vocês? 😊'],
              ]],
              ['💉 Vacinas', [
                ['Reações pós-vacina (orientação)', `Fica tranquila 💙 É comum o pequeno ter um pouco de febre baixa, dorzinha ou vermelhidão no local e ficar mais manhosinho nas primeiras 24 a 48 horas. Pode fazer compressa fria no local e manter o carinho de sempre. Se a febre passar de 38,5, durar mais de 48 horas ou você notar algo diferente, me chama na hora que a gente te orienta, tá? Como ele está agora?`],
                ['Pós-vacinal (como passou?)', `Oi! 💙 Aqui é da Vittalis. Passando pra saber: como o seu pequeno passou depois das vacinas? Teve febre, dorzinha no local ou ficou mais manhosinho? Qualquer coisa estamos aqui pra orientar vocês 🥰`],
                ['Caderneta atrasada (recall)', `Faz um tempinho que não nos vemos por aqui 💙 A caderneta de vacinas pode estar pedindo um reforço do calendário 💉 Quer que eu confira certinho quais doses estão na fase do seu pequeno? É rapidinho 😊`],
                ['Oferecer o Plano Vacinal', `Você sabia que dá pra garantir TODAS as vacinas do primeiro ano num plano só? 💙 Além de economizar em relação às doses avulsas, você trava o investimento de hoje e ainda tem a comodidade do atendimento em casa. Quer que eu te mostre como funciona o nosso Plano Vacinal?`],
                ['Cliente diz que TEM plano (qual?)', `Só pra eu te atender certinho, ${nomeC}: você fala do nosso Plano Vacinal aqui da Vittalis ou de um plano de saúde? 💙 Assim já organizo tudo do jeito certo pra vocês 😊`],
                ['Já é do nosso Plano Vacinal', `Que alegria falar com vocês 💙 Sendo do nosso Plano Vacinal, as doses de ${pac} já estão garantidas, então é só escolhermos o melhor dia 🥰 Me confirma o nome completo e a idade dele hoje? Assim eu confiro no cadastro qual dose está na vez e já deixo o horário reservado.`],
                ['Dose do plano (já inclusa) + local', `Perfeito! Essa dose já está inclusa no plano de vocês, sem nenhum investimento a mais 💙 Para vocês, fica melhor em sua residência ou em nossa clínica? 😊`],
              ]],
              ['🧩 Terapias e consultas', [
                ['Planos mensais de terapias', `Nossos Planos Mensais de Terapias funcionam assim 💙 Cada sessão dura em média 1 hora, e você escolhe quantas sessões por mês fazem sentido pra evolução do seu pequeno: 1 sessão por mês por R$ 200, 2 sessões por mês por R$ 400, 4 sessões por mês por R$ 800, e assim por diante. Vale pra todas as especialidades (Fono, T.O., Psicologia ABA e Clínica, Psicomotricidade, Neuropsicologia, Nutrição) e dá até pra combinar mais de uma. E o melhor: o plano é híbrido, metade na clínica e metade na sua casa se quiser, sem taxa extra. Quantas sessões por semana o seu pequeno precisa hoje?`],
                ['Requisição médica (mande foto)', `Se você tiver a requisição ou encaminhamento médico em mãos, me manda uma foto? 💙 Assim eu já te indico exatamente o plano ideal pra necessidade do seu pequeno, sem você precisar decifrar nada sozinha 😊`],
                ['Sem diagnóstico ainda', `Sem problema nenhum não ter diagnóstico ainda, viu? 💙 Nesse caso o caminho mais indicado é começar com uma avaliação com o neuropsicólogo ou o neuropediatra: são eles que enxergam o quadro completo e direcionam as terapias certas. Quer que eu veja um horário de avaliação pra vocês?`],
                ['Certificado de Coragem e presente', `Aqui na Vittalis cada consulta termina de um jeitinho especial 💙 A criança recebe um presente e o nosso Certificado de Coragem, pra sair daqui se sentindo a heroína do dia 🥰 É o tipo de memória que faz a próxima consulta ser esperada com alegria, e não com medo. Quer garantir essa experiência pro seu pequeno?`],
              ]],
              ['💬 Objeções', [
                ['Vou analisar com calma', `Claro, analisar com calma é sinal de cuidado 💙 Só me deixa te ajudar em uma coisa: além de pensar, tem mais alguma dúvida que eu possa esclarecer agora? Enquanto isso, vou deixar seu retorno agendado pra amanhã, só pra garantir a condição que você já conquistou, tá? É só um agendamento, pra gente não perder tudo o que já conquistamos 😊`],
                ['Achou caro (investimento)', `Entendo perfeitamente 💙 Deixa eu te mostrar tudo o que está incluso nesse investimento: avaliação completa, plano individual pro seu pequeno, equipe multidisciplinar, presente e Certificado de Coragem. E dá pra parcelar no cartão, o que deixa bem mais leve. Se couber no seu momento, qual seria uma parcela confortável pra vocês?`],
                ['Vou ver com o marido', `Claro, decisão de família se toma junto 💙 Quer que eu te mande um resuminho caprichado pra vocês verem juntos hoje à noite? Aí amanhã eu volto pra ajudar no que decidirem, e o desconto que você já conquistou fica guardadinho até lá 😊`],
                ['Cliente sumiu (retomada)', `Oi! 💙 Fiquei pensando em vocês e não quero que a gente perca o caminho que já andamos. Ficou alguma dúvida que eu possa esclarecer? Estou por aqui, no seu tempo 😊`],
              ]],
              ['❤️ Fechamento e pós-venda', [
                ['Formas de pagamento', `Fica bem flexível pra você 💙 Aceitamos Pix, dinheiro, débito e crédito com parcelamento. E como atendemos particular, emitimos a nota fiscal, que a maioria dos planos aceita pra reembolso. Qual forma fica melhor pra vocês?`],
                ['Agradecimento pós-fechamento', `Que alegria, parabéns pela decisão! 💙 Pode deixar que a partir de agora cuidamos de tudo com muito carinho. Qualquer dúvida antes do atendimento, é só me chamar por aqui, tá? 🥰`],
                ['Pedir indicação', `Uma coisinha rápida 💙 Se você conhece outra mamãe ou papai que merece esse mesmo cuidado, indica a gente? Presente seu e da família que chegar por você 🥰 É só me mandar o contato ou compartilhar o nosso número 😊`],
              ]],
              ['✅ Cartões de agendamento (preencha os campos)', [
                ['Vacina em casa', cartao(['✅ Vacinação confirmada','',`📁 Cliente: ${nomeC}`,`👶🏻 Paciente: ${pac}`,'📅 Data: {DATA} {DIA DA SEMANA}','🕓 Horário: {HORA}hs','📍 Local: Em sua residência','📌 Serviço: Vacinas de {IDADE}','','Parabéns pelo investimento na saúde do seu Baby 🩵','',INSTA])],
                ['Vacina na clínica', cartao(['✅ Vacinação confirmada','',`📁 Cliente: ${nomeC}`,`👶🏻 Paciente: ${pac}`,'📅 Data: {DATA} {DIA DA SEMANA}','🕓 Horário: {HORA}hs','📍 Local: Na Clínica Vittalis Saúde (Renascença)','📌 Serviço: Vacinas de {IDADE}','',ENDER,'','Parabéns pelo investimento na saúde do seu Baby 🩵','',INSTA])],
                ['Consulta na clínica', cartao(['✅ Consulta confirmada','',`📁 Cliente: ${nomeC}`,`👶🏻 Paciente: ${pac}`,'📅 Data: {DATA} {DIA DA SEMANA}','🕓 Horário: {HORA}hs','👩‍⚕️ Profissional: {PROFISSIONAL} ({ESPECIALIDADE})','📍 Local: Na Clínica Vittalis Saúde (Renascença)','📌 Serviço: {SERVIÇO}','',ENDER,'','Parabéns pelo investimento na saúde do seu Baby 🩵','',INSTA])],
                ['Consulta em casa', cartao(['✅ Consulta confirmada','',`📁 Cliente: ${nomeC}`,`👶🏻 Paciente: ${pac}`,'📅 Data: {DATA} {DIA DA SEMANA}','🕓 Horário: {HORA}hs','👩‍⚕️ Profissional: {PROFISSIONAL} ({ESPECIALIDADE})','📍 Local: Em sua residência','📌 Serviço: {SERVIÇO}','','Parabéns pelo investimento na saúde do seu Baby 🩵','',INSTA])],
              ]],
            ];
            return (
              <div style={{ background:'var(--card,#fff)', borderTop:'1px solid var(--border)', padding:'9px 12px', flexShrink:0, maxHeight:250, overflowY:'auto' }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:7 }}>
                  <span style={{ flex:1, fontSize:10.5, fontWeight:800, color:'var(--muted)', textTransform:'uppercase', letterSpacing:.6 }}>
                    📝 Mensagens prontas da casa <span style={{ textTransform:'none', fontWeight:600 }}>· toque, ajuste os {'{campos}'} e envie</span>
                  </span>
                  <button onClick={()=>setShowProntas(false)}
                    style={{ border:'none', borderRadius:8, padding:'3px 10px', cursor:'pointer', background:'var(--err2,#fde8e8)', color:'var(--err,#dc2626)', fontSize:11, fontWeight:900, flexShrink:0 }}>
                    ✕ Fechar
                  </button>
                </div>
                {GRUPOS_PRONTAS.map(([grupo, itens2]) => (
                  <div key={grupo} style={{ marginBottom:9 }}>
                    <div style={{ fontSize:10, fontWeight:800, color:'var(--tq2)', marginBottom:4 }}>{grupo}</div>
                    <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                      {itens2.map(([rot, txt]) => (
                        <button key={rot} onClick={()=>{ setInput(txt); setShowProntas(false); textRef.current?.focus(); }}
                          title={txt.slice(0, 200)}
                          style={{ padding:'6px 12px', borderRadius:10, border:'1px solid var(--border)', background:'var(--bg)', color:'var(--txt2)', fontSize:11.5, fontWeight:700, cursor:'pointer' }}>
                          {rot}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}

          {/* Emoji picker */}
          {/* 💟 ABA DAS FIGURINHAS — vive no chat, fora da Biblioteca */}
          {showFigus && sel && (
            <FigurinhasPainel convId={sel.id} api={api} onClose={()=>setShowFigus(false)}
              onEnviada={()=>Toast.show('Figurinha enviada 💟', 'success')} />
          )}

          {showEmoji && (
            <div style={{ background:'var(--card,#fff)', borderTop:'1px solid var(--border)', padding:'9px 12px', flexShrink:0, maxHeight:185, overflowY:'auto', position:'relative' }}>
              {/* ✕ sempre à vista (cobrança do master: "o menu de emoji não some") */}
              <div style={{ position:'sticky', top:0, zIndex:2, display:'flex', gap:6, justifyContent:'flex-end', marginBottom:4 }}>
                {/* 💟 FIGURINHAS AO LADO DOS EMOJIS (ordem do master, 24/08):
                    o mesmo toque que abre carinha abre figurinha. */}
                <button onClick={()=>{ setShowFigus(true); setShowEmoji(false); }}
                  title="Abrir as figurinhas da Vittalis"
                  style={{ border:'none', borderRadius:8, padding:'3px 11px', cursor:'pointer',
                    background:'linear-gradient(120deg,#0E8C96,#00B8C0)', color:'#fff', fontSize:11, fontWeight:900 }}>
                  💟 Figurinhas
                </button>
                <button onClick={()=>setShowEmoji(false)}
                  style={{ border:'none', borderRadius:8, padding:'3px 10px', cursor:'pointer', background:'var(--err2,#fde8e8)', color:'var(--err,#dc2626)', fontSize:11, fontWeight:900 }}>
                  ✕ Fechar
                </button>
              </div>
              {/* Ampliado por grupos (pedido do master: "não tem corações de
                  diversas cores e formas — melhore, amplia") */}
              {[
                ['💗 Corações', ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💖','💗','💓','💞','💕','💘','💝','❣️','💟','❤️‍🔥','❤️‍🩹','💔','😍','🥰','😻','🫶','❤️‍🙈'.replace('❤️‍🙈','🫀') ]],
                ['😊 Carinhas', ['😊','😁','😂','🤣','😄','😅','😉','😌','😍','😘','🥰','😎','🤗','🤭','😇','🥹','🥲','😢','😭','😮','😱','😡','🤔','😴','🙃','😋','🤤','🫠','🥺','😷','🤒','🤧','🤢','😵‍💫']],
                ['🙌 Gestos', ['👍','👎','👏','🙏','🤝','👋','✌️','🤞','🫰','👌','🤙','💪','🫶','👊','✊','🤲','🖐️','☝️']],
                ['🎉 Festa & brilho', ['🎉','🎊','🥳','🎈','🎁','✨','🌟','⭐','💫','🌈','🔥','💯','🏆','🥇','🏅','💎','👑','🚀']],
                ['🩺 Saúde & bebê', ['💉','🩺','🏥','👶','🍼','🧸','👨‍👩‍👧','🤱','🤰','💊','🩹','🧬','🦷','👩‍⚕️','👨‍⚕️','🚑','😷','🌡️']],
                ['📅 Trabalho', ['📋','📅','⏰','📞','💬','📱','💰','💵','💳','🧾','📈','✅','☑️','✍️','📌','📎','🔔','⚡']],
                ['🌸 Natureza & extras', ['🌸','🌺','🌻','🌷','🌹','🍀','☀️','🌙','⛅','🦋','🐣','🌊','🍎','☕','🍰','🎂','🙌','🤩']],
              ].map(([grupo, lista]) => (
                <div key={grupo} style={{ marginBottom:8 }}>
                  <div style={{ fontSize:10, fontWeight:800, color:'var(--muted)', marginBottom:4, textTransform:'uppercase', letterSpacing:.6 }}>{grupo}</div>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:3 }}>
                    {lista.map(e=>(
                  <button key={e} onClick={()=>setInput(p=>p+e)}
                    style={{ fontSize:19, padding:'3px 4px', background:'none', border:'none', cursor:'pointer', borderRadius:5, lineHeight:1 }}
                    onMouseEnter={ev=>ev.currentTarget.style.background='var(--bg)'}
                    onMouseLeave={ev=>ev.currentTarget.style.background='none'}
                  >{e}</button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ✅ PROTOCOLO DE ATENDIMENTO — abre sozinho e destaca o que faltou */}
          {/* 🗺️ FUNIL DE VENDA — o protocolo de 7 etapas do master, vivo: o
              sistema detecta a etapa pela conversa/venda/agenda e mostra o
              GATILHO que destrava o avanço. Prospecção → Pós-venda. */}
          {/* 🎨 UX: o funil de 7 etapas agora acompanha a barra do protocolo (o
              mesmo toque abre os dois). Antes eram TRÊS faixas empilhadas
              disputando a tela com a conversa. */}
          {proto?.funil && protoAberto && (
            <div style={{ flexShrink:0, borderTop:'1px solid var(--border)', background:'var(--card)', padding:'7px 14px 6px' }}>
              <div style={{ display:'flex', alignItems:'center', gap:5, overflowX:'auto', paddingBottom:2 }}>
                {proto.funil.etapas.map((e, i) => {
                  const atual = e.n === proto.funil.etapa_atual && !proto.funil.completo;
                  return (
                    <React.Fragment key={e.n}>
                      {i > 0 && <span style={{ width:12, height:2, flexShrink:0, background: e.feito || atual ? 'var(--tq)' : 'var(--border)' }} />}
                      <span title={`${e.nome} — ${e.objetivo}. Avança quando: ${e.gatilho}`}
                        style={{ flexShrink:0, display:'flex', alignItems:'center', gap:4, padding:'2px 8px', borderRadius:20,
                          fontSize:10, fontWeight:800, whiteSpace:'nowrap', cursor:'default',
                          background: e.feito ? 'var(--tq)' : atual ? '#fef3c7' : 'var(--bg2)',
                          color: e.feito ? '#fff' : atual ? '#92400e' : 'var(--muted)',
                          border: atual ? '1.5px solid #f59e0b' : '1.5px solid transparent' }}>
                        {e.feito ? '✓' : e.n}º {e.nome}
                      </span>
                    </React.Fragment>
                  );
                })}
                {/* 📞 Lembrete de ouro do master, cravado no fim do trilho:
                    proposta parada se resolve com LIGAÇÃO, e áudio converte
                    mais que texto. Não é etapa — é o jeito de atravessar todas. */}
                <span style={{ width:12, height:2, flexShrink:0, background:'var(--border)' }} />
                {/* Regra de ouro em DESTAQUE (pedido do master: "deixa mais visível") */}
                <style>{`@keyframes vhPulseOuro{0%,100%{box-shadow:0 0 0 0 rgba(196,151,59,.55)}50%{box-shadow:0 0 0 7px rgba(196,151,59,0)}}`}</style>
                <span title="Regra de ouro da casa: em toda proposta parada, LIGUE (avisando antes no WhatsApp) — e prefira áudio ao textão. Voz converte."
                  style={{ flexShrink:0, display:'flex', alignItems:'center', gap:5, padding:'4px 12px', borderRadius:20,
                    fontSize:11.5, fontWeight:900, whiteSpace:'nowrap', cursor:'default', letterSpacing:.2,
                    background:'linear-gradient(135deg,#f59e0b,#C4973B 55%,#b45309)', color:'#fff',
                    border:'1.5px solid #fcd34d', textShadow:'0 1px 2px rgba(0,0,0,.35)',
                    animation:'vhPulseOuro 1.8s ease-in-out infinite' }}>
                  📞 Ligação e áudio convertem
                </span>
              </div>
              {!proto.funil.completo && proto.funil.proximo_gatilho && (
                <div style={{ fontSize:10.5, color:'var(--muted)', marginTop:3 }}>
                  🎯 <b style={{ color:'var(--txt2)' }}>Pra avançar:</b> {proto.funil.proximo_gatilho}
                </div>
              )}
              {proto.funil.completo && (
                <div style={{ fontSize:10.5, color:'#15803d', fontWeight:800, marginTop:3 }}>🏆 Funil completo — cliente fechado e acompanhado!</div>
              )}
            </div>
          )}

          {/* 🩺 PERGUNTAS A REALIZAR (lista do master) — a anamnese de ouro da
              qualificação de consultas/terapias. Clicou na pergunta, ela já
              cai escrita na caixa: é só ajustar e enviar. */}
          {sel && sel.setor !== 'vacinas' && protoAberto && (
            <div style={{ flexShrink:0, borderTop:'1px solid var(--border)', background:'var(--card)' }}>
              <button onClick={() => setPerguntasOpen(a => !a)}
                style={{ width:'100%', display:'flex', alignItems:'center', gap:8, padding:'6px 14px', border:'none', cursor:'pointer', background:'transparent', textAlign:'left' }}>
                <span style={{ fontSize:13 }}>🩺</span>
                <span style={{ flex:1, fontSize:11.5, fontWeight:800, color:'var(--txt2)' }}>Confira as perguntas a realizar</span>
                <span style={{ fontSize:9, color:'var(--muted)', transition:'transform .18s', transform: perguntasOpen ? 'rotate(90deg)' : 'none' }}>▶</span>
              </button>
              {perguntasOpen && (
                <div style={{ padding:'2px 14px 9px' }}>
                  {PERGUNTAS_QUALIFICACAO.map((q, i) => (
                    <div key={i} style={{ display:'flex', alignItems:'center', gap:8, padding:'4px 0', borderBottom: i < PERGUNTAS_QUALIFICACAO.length - 1 ? '1px dashed var(--border)' : 'none' }}>
                      <span style={{ fontSize:10.5, fontWeight:800, color:'var(--tq2)', width:14, flexShrink:0 }}>{i + 1}.</span>
                      <span style={{ flex:1, minWidth:0, fontSize:12, color:'var(--txt2)' }}>{q}</span>
                      <button onClick={() => { setInput(q); textRef.current?.focus(); }} title="Escrever esta pergunta na caixa"
                        style={{ flexShrink:0, padding:'3px 9px', borderRadius:8, border:'1px solid var(--tq3)', cursor:'pointer',
                          background:'var(--tq4)', color:'var(--tq2)', fontSize:10, fontWeight:800 }}>✍️ Usar</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {proto && proto.passos && (
            <div style={{ flexShrink:0, borderTop:'1px solid var(--border)', background:'var(--card)' }}>
              {/* 🔢 PROTOCOLO EM BOTÕES NUMERADOS (pedido do master, 23/08/2026:
                  "estava muito claro — transforma tudo em algo discreto, botões
                  modernos, passo a passo enumerado: botão 1: Boas-vindas!").
                  Uma fileira de botões 1..N no tom do tema; toque abre o passo
                  com a dica e as ações. Verde = feito, âmbar = falta. */}
              <button onClick={alternarProto} title={protoAberto ? 'Baixar a barra do passo a passo' : 'Abrir a barra do passo a passo'}
                style={{ width:'100%', display:'flex', alignItems:'center', gap:9, padding:'6px 14px', border:'none', cursor:'pointer', background:'transparent', textAlign:'left' }}>
                {/* 🏆 Agendou é nota 10 (ordem do master, 01/09): o placar
                    comemora mesmo que algum passo do caminho tenha sido pulado.
                    Os passos que faltaram seguem listados embaixo, como
                    aprendizado — nunca como cobrança em cima de quem fechou. */}
                <span style={{ fontSize:13 }}>{proto.nota?.por_agendamento || !proto.faltando.length ? '🏆' : '📋'}</span>
                <span style={{ flex:1, minWidth:0, fontSize:11.5, fontWeight:800,
                  color: proto.nota?.por_agendamento ? '#15803d' : 'var(--txt2)' }}>
                  {proto.nota?.por_agendamento
                    ? 'Agendou! Atendimento nota 10 💙'
                    : proto.faltando.length
                      ? `Protocolo Vittalis — ${proto.passos.length - proto.faltando.length}/${proto.passos.length} passos`
                      : 'Protocolo Vittalis completo! Atendimento nota 10 💙'}
                </span>
                <span style={{ width:64, height:5, borderRadius:99, background:'var(--border)', overflow:'hidden', flexShrink:0 }}>
                  <span style={{ display:'block', height:'100%', borderRadius:99,
                    width: proto.nota?.por_agendamento ? '100%' : `${proto.pct}%`,
                    background: (proto.nota?.por_agendamento || !proto.faltando.length) ? '#16a34a' : '#f59e0b' }} />
                </span>
                <span style={{ fontSize:10, fontWeight:800, color: proto.nota?.por_agendamento ? '#15803d' : 'var(--muted)' }}>
                  {proto.nota?.por_agendamento ? 'nota 10' : `${proto.pct}%`}
                </span>
                {/* ➖ MINIMIZAR DE VERDADE (ordem do master, 01/09: "quero poder
                    minimizar"). A seta sozinha ninguém via: virou um botão com
                    a palavra escrita. Baixa a barra INTEIRA — funil, perguntas
                    e passo a passo — e devolve a tela pro que importa, que é a
                    conversa. A escolha fica guardada no aparelho. */}
                <span style={{ display:'flex', alignItems:'center', gap:4, flexShrink:0,
                  border:'1.5px solid var(--border)', borderRadius:8, padding:'3px 9px',
                  fontSize:10, fontWeight:800, color:'var(--txt2)', background:'var(--bg2)' }}>
                  {protoAberto ? '➖ Minimizar' : '➕ Abrir passo a passo'}
                </span>
              </button>

              {protoAberto && (
                <div style={{ padding:'0 12px 9px' }}>
                  <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
                    {proto.passos.map((p2, i) => {
                      const sel2 = protoSel === p2.k;
                      return (
                        <button key={p2.k} onClick={() => setProtoSel(sel2 ? null : p2.k)}
                          title={`${p2.feito ? 'Feito ✓' : 'Falta'} — ${p2.nome}`}
                          style={{
                            display:'flex', alignItems:'center', gap:6, padding:'4px 10px 4px 4px', cursor:'pointer',
                            borderRadius:99, fontSize:10.5, fontWeight:700, maxWidth:'100%',
                            border: sel2 ? '1.5px solid var(--tq2)' : '1px solid ' + (p2.feito ? 'rgba(22,163,74,.35)' : 'var(--border)'),
                            background: sel2 ? 'var(--tq4)' : (p2.feito ? 'rgba(22,163,74,.08)' : 'var(--bg)'),
                            color: p2.feito ? '#15803d' : 'var(--txt2)', opacity: p2.feito && !sel2 ? .75 : 1,
                          }}>
                          <span style={{ width:18, height:18, borderRadius:'50%', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center',
                            fontSize:10, fontWeight:900, color:'#fff', background: p2.feito ? '#16a34a' : '#f59e0b' }}>
                            {p2.feito ? '✓' : i + 1}
                          </span>
                          <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p2.nome}</span>
                        </button>
                      );
                    })}
                  </div>
                  {protoSel && (() => {
                    const p2 = proto.passos.find(x => x.k === protoSel);
                    if (!p2) return null;
                    const editando2 = protoEditK === p2.k;
                    return (
                      <div style={{ marginTop:7, padding:'9px 12px', borderRadius:11, border:'1px solid var(--border)', background:'var(--bg)' }}>
                        <div style={{ fontSize:11.5, fontWeight:800, color:'var(--txt2)' }}>{p2.feito ? '✅ ' : `${p2.emoji} `}{p2.nome}</div>
                        <div style={{ fontSize:10.5, color:'var(--muted)', marginTop:2, lineHeight:1.45 }}>
                          {p2.feito ? 'Este passo já foi cumprido nesta conversa. 👏' : (p2.dica || 'Falta fazer este passo com o cliente.')}
                        </div>
                        {/* A FRASE SALVA sempre à vista (pedido do master) — e editável */}
                        {p2.modelo && !editando2 && (
                          <div style={{ marginTop:7, padding:'7px 10px', borderRadius:9, background:'var(--card)', border:'1px dashed var(--border)', fontSize:11.5, lineHeight:1.5, color:'var(--txt2)', whiteSpace:'pre-wrap' }}>
                            “{p2.modelo}”
                          </div>
                        )}
                        {/* Quem melhorou a frase por último (todas podem editar) */}
                        {p2.editado_por && !editando2 && (
                          <div style={{ marginTop:4, fontSize:10, color:'var(--muted)', fontWeight:700 }}>
                            ✍️ Frase melhorada por {p2.editado_por}
                            {p2.editado_em ? ` em ${String(p2.editado_em).slice(0, 10).split('-').reverse().join('/')}` : ''}
                          </div>
                        )}
                        {editando2 && (
                          <textarea value={protoEditTxt} onChange={e => setProtoEditTxt(e.target.value)} rows={3}
                            style={{ width:'100%', boxSizing:'border-box', marginTop:7, padding:'8px 10px', borderRadius:9, border:'1.5px solid var(--tq)', fontSize:11.5, lineHeight:1.5, resize:'vertical', background:'var(--card)', color:'var(--txt)', fontFamily:'inherit' }} />
                        )}
                        <div style={{ display:'flex', gap:6, marginTop:8, flexWrap:'wrap' }}>
                          {/* 📎 Em TODOS os passos: anexa e envia imagem, vídeo ou
                              documento na conversa, direto daqui */}
                          <input ref={protoFileRef} type="file" accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx" style={{ display:'none' }} onChange={anexarDoPasso} />
                          <button onClick={() => protoFileRef.current?.click()} disabled={protoBusy === 'anexo'}
                            title="Anexar e enviar um arquivo nesta conversa (imagem, vídeo, PDF, documento — até 45MB)"
                            style={{ flexShrink:0, borderRadius:9, padding:'6px 13px', cursor:'pointer', border:'1px solid #C4973B', background:'#fdf6e7', color:'#8a6417', fontSize:11, fontWeight:800 }}>
                            {protoBusy === 'anexo' ? '…' : '📎 Anexar'}
                          </button>
                          {p2.k === 'significado_nome' && !p2.feito && (
                            <button onClick={async () => {
                              const nome = proto.paciente || window.prompt('Nome da criança:');
                              if (!nome) return;
                              setProtoBusy(p2.k);
                              try {
                                const r = await api.post(`/inbox/conversations/${sel.id}/significado-nome`, { nome });
                                Toast.show(`✨ Cartão do nome ${r.nome} enviado!`, 'success');
                                api.get(`/inbox/conversations/${sel.id}/protocolo`).then(setProto).catch(() => {});
                              } catch (e) { Toast.show(e.message, 'error'); }
                              setProtoBusy('');
                            }} disabled={!!protoBusy}
                              style={{ flexShrink:0, border:'none', borderRadius:9, padding:'6px 13px', cursor:'pointer', background:'#7c3aed', color:'#fff', fontSize:11, fontWeight:800 }}>
                              {protoBusy === p2.k ? '…' : '✨ Gerar e enviar'}
                            </button>
                          )}
                          {p2.k === 'prova_social' && (
                            <button onClick={async () => {
                              setProtoBusy(p2.k);
                              try {
                                const r = await api.post(`/inbox/conversations/${sel.id}/prova-social`, {});
                                Toast.show(`📸 ${r.enviadas} foto(s) + Instagram enviados!`, 'success');
                                api.get(`/inbox/conversations/${sel.id}/protocolo`).then(setProto).catch(() => {});
                              } catch (e) { Toast.show(e.message, 'error'); }
                              setProtoBusy('');
                            }} disabled={!!protoBusy}
                              title="Envia até 3 fotos de prova social da Biblioteca com o Instagram na legenda"
                              style={{ flexShrink:0, border:'none', borderRadius:9, padding:'6px 13px', cursor:'pointer', background:'linear-gradient(120deg,#ec4899,#a855f7)', color:'#fff', fontSize:11, fontWeight:800 }}>
                              {protoBusy === p2.k ? '…' : '📸 Fotos + Insta'}
                            </button>
                          )}
                          {p2.modelo && !editando2 && (<>
                            <button onClick={() => { setInput(p2.modelo); textRef.current?.focus(); }}
                              title="Coloca a frase salva no campo de digitação — ajuste como quiser antes de enviar"
                              style={{ flexShrink:0, borderRadius:9, padding:'6px 13px', cursor:'pointer', border:'1px solid var(--tq3)', background:'var(--tq4)', color:'var(--tq2)', fontSize:11, fontWeight:800 }}>
                              ✍️ Usar frase
                            </button>
                            <button onClick={() => { setProtoEditK(p2.k); setProtoEditTxt(p2.modelo); }}
                              title="Editar a frase deste passo"
                              style={{ flexShrink:0, borderRadius:9, padding:'6px 13px', cursor:'pointer', border:'1px solid var(--border)', background:'var(--card)', color:'var(--txt2)', fontSize:11, fontWeight:800 }}>
                              ✏️ Editar
                            </button>
                          </>)}
                          {editando2 && (<>
                            <button onClick={() => { setInput(protoEditTxt); textRef.current?.focus(); setProtoEditK(null); }}
                              title="Usa a frase editada nesta conversa (vai pro campo de digitação)"
                              style={{ flexShrink:0, border:'none', borderRadius:9, padding:'6px 13px', cursor:'pointer', background:'var(--tq)', color:'#fff', fontSize:11, fontWeight:800 }}>
                              ✍️ Usar editada
                            </button>
                            {/* 💾 Pedido do master (24/08): TODAS podem salvar a frase do
                                passo pra equipe, não só a gestão. O sistema registra quem
                                editou por último e mostra no painel. */}
                            {(
                              <button onClick={async () => {
                                try {
                                  // Salva como padrão da equipe: pega a config CRUA (com os
                                  // curingas) e troca só o modelo deste passo
                                  const cfg2 = await api.get('/inbox/protocolo/config');
                                  const passos2 = (cfg2?.passos || []).map(x => x.k === p2.k ? { ...x, modelo: protoEditTxt } : x);
                                  await api.put('/inbox/protocolo/config', { passos: passos2, clinica: cfg2?.clinica || {} });
                                  Toast.show('💾 Frase salva pra toda a equipe!', 'success');
                                  setProtoEditK(null);
                                  api.get(`/inbox/conversations/${sel.id}/protocolo`).then(setProto).catch(() => {});
                                } catch (e) { Toast.show(e.message, 'error'); }
                              }}
                                title="Grava esta frase como o novo padrão deste passo pra toda a equipe"
                                style={{ flexShrink:0, border:'none', borderRadius:9, padding:'6px 13px', cursor:'pointer', background:'#16a34a', color:'#fff', fontSize:11, fontWeight:800 }}>
                                💾 Salvar pra equipe
                              </button>
                            )}
                            <button onClick={() => setProtoEditK(null)}
                              style={{ flexShrink:0, borderRadius:9, padding:'6px 13px', cursor:'pointer', border:'1px solid var(--border)', background:'var(--card)', color:'var(--muted)', fontSize:11, fontWeight:800 }}>
                              Cancelar
                            </button>
                          </>)}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          )}

          {/* 💡 Radar de intenção: lê a última mensagem do cliente e sugere a ação */}
          {sel && (() => {
            const ult = [...msgs].reverse().find(m => m.from_type === 'contact' && m.type === 'text' && m.content && !String(m.content).startsWith('['));
            if (!ult || intentOff === ult.id) return null;
            const t = String(ult.content).toLowerCase();
            let intent = null;
            if (/agend|marcar|remarc|hor[aá]rio|que dia|qual dia|disponib/.test(t)) intent = { rot: 'quer AGENDAR', emo: '📅', acao: 'Agendar agora', fn: () => setShowAgendar(true) };
            else if (/pre[cç]o|valor|quanto (custa|fica|é|sai)|or[cç]amento|promo[cç]/.test(t)) intent = { rot: 'pergunta PREÇO', emo: '💰', acao: 'IA responde com valores', fn: sugerirResposta };
            else if (/endere[cç]o|localiza|onde fica|como chego|\bmapa\b/.test(t)) intent = { rot: 'pede o ENDEREÇO', emo: '📍', acao: 'Respostas prontas', fn: () => setShowQR(true) };
            else if (/\bpix\b|cart[aã]o|parcel|pagamento|boleto/.test(t)) intent = { rot: 'fala de PAGAMENTO', emo: '💳', acao: 'IA responde', fn: sugerirResposta };
            if (!intent) return null;
            return (
              <div style={{ display:'flex', alignItems:'center', gap:9, padding:'7px 12px', background:'linear-gradient(90deg,#fffbeb,#fef3c7)', borderTop:'1px solid #fde68a', fontSize:12, flexShrink:0 }}>
                <span style={{ fontSize:14 }}>💡</span>
                {/* Selo pedido pelo master: deixar claro que isto é a LEITURA
                    da conversa (resumo do que o cliente acabou de dizer) */}
                <span style={{ flexShrink:0, fontSize:8.5, fontWeight:900, letterSpacing:.7, textTransform:'uppercase',
                  background:'#92400e', color:'#fde68a', borderRadius:6, padding:'2px 7px' }}>
                  Resumo da conversa
                </span>
                <span style={{ flex:1, minWidth:0, fontWeight:700, color:'#92400e', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  O cliente {intent.rot}: “{String(ult.content).slice(0, 64)}{String(ult.content).length > 64 ? '…' : ''}”
                </span>
                <button onClick={intent.fn}
                  style={{ flexShrink:0, display:'flex', alignItems:'center', gap:5, padding:'6px 13px', borderRadius:9, border:'none', cursor:'pointer', background:'#d97706', color:'#fff', fontWeight:800, fontSize:11.5, boxShadow:'0 2px 8px rgba(217,119,6,.35)' }}>
                  {intent.emo} {intent.acao}
                </button>
                <button onClick={() => setIntentOff(ult.id)} title="Dispensar sugestão"
                  style={{ flexShrink:0, background:'none', border:'none', cursor:'pointer', color:'#b45309', fontSize:15, fontWeight:800, padding:'0 3px' }}>×</button>
              </div>
            );
          })()}

          {/* 💜 CONVITE DA VITTA (pedido do master): só pra Danielle, Stefany e
              Mayara (flag ia_consultas) + o master. Nas conversas de consultas/
              terapias com o bot desligado, um convite impossível de ignorar:
              um toque e a Vitta — treinada nas conversas que agendaram — assume
              e conduz pro fechamento. */}
          {/* 🎨 As duas faixas roxas da IA saíram (ordem do master, 24/08): o
              estado da IA agora vive no botão do cabeçalho, que acende quando
              ela está ligada. Mesma informação, sem tomar a tela de quem atende. */}

          {/* ✍️ QUEM ESTÁ ASSINANDO (ordem do master, 27/08: mandou mensagem no
              nome dele numa conversa da Stefany e só viu depois). Se a conversa
              tem dona e quem escreve é outra pessoa da gestão, o aviso aparece
              ANTES de enviar, com um clique pra assinar no nome dela. */}
          {(() => {
            const dona = sel?.responsavel_nome;
            const donaId = sel?.responsavel_id;
            if (!dona || !donaId || String(donaId) === String(user?.id) || user?.role !== 'master') return null;
            const primeiro = String(dona).replace(/^(Dra?\.|Sra?\.|Enf\.|Prof\.)\s*/i, '').split(' ')[0];
            const assinando = assinarComo === dona;
            return (
              <div style={{ display:'flex', alignItems:'center', gap:9, padding:'6px 12px', flexShrink:0,
                background: assinando ? 'var(--tq4)' : 'var(--warn2,#fef8eb)',
                borderTop:`1px solid ${assinando ? 'var(--tq3)' : '#fde68a'}`, fontSize:11.5 }}>
                <span style={{ fontSize:13 }}>{assinando ? '✍️' : '⚠️'}</span>
                <span style={{ flex:1, minWidth:0, color: assinando ? 'var(--tq2)' : '#92400e', fontWeight:700 }}>
                  {assinando
                    ? `Escrevendo como ${primeiro} — o cliente vê o nome dela.`
                    : `Este atendimento é da ${primeiro}. Do seu jeito, vai sair no SEU nome.`}
                </span>
                <button onClick={()=>setAssinarComo(assinando ? '' : dona)}
                  style={{ flexShrink:0, border:'none', borderRadius:8, padding:'4px 11px', cursor:'pointer', fontWeight:800, fontSize:11,
                    background: assinando ? 'var(--bg2)' : '#d97706', color: assinando ? 'var(--muted)' : '#fff' }}>
                  {assinando ? 'Voltar ao meu nome' : `Assinar como ${primeiro}`}
                </button>
              </div>
            );
          })()}

          {/* ⚠️ VOCÊ ESTÁ COMO OUTRA PESSOA (28/08: o master entrou no usuário
              errado e mandou no nome da Raylane sendo da Poliana). O aviso roxo
              do topo existia, mas o olho de quem escreve está AQUI embaixo.
              Esta faixa fica colada na caixa de texto, impossível de ignorar. */}
          {(() => {
            let comoOutra = false;
            try { comoOutra = !!localStorage.getItem('vh_token_master'); } catch { /* ok */ }
            if (!comoOutra) return null;
            return (
              <div style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 14px', flexShrink:0,
                background:'#7c3aed', color:'#fff', fontSize:11.5, fontWeight:800 }}>
                <span style={{ fontSize:13 }}>⚠️</span>
                <span>Você está escrevendo como <u>{user?.nome}</u> — é este nome que vai aparecer na conversa.</span>
              </div>
            );
          })()}

          {/* Input bar */}
          <div className="chat-input-bar" style={{ background:'var(--card,#fff)', padding:'9px 12px', borderTop:'1px solid var(--border)', flexShrink:0 }}>
            <div style={{ display:'flex', gap:6, alignItems:'flex-end' }}>
              {/* Cápsula única com as ferramentas — lado a lado, mas lidas como
                  UM objeto. A divisória separa o que é conteúdo (mensagens,
                  figurinhas, mídia) do que é anexo do momento (clipe e emoji),
                  que ficam colados no campo de escrever. */}
              <div className="tb-grupo">
                <button onClick={corrigirTexto} disabled={!input.trim() || corrigindo} title="Corrigir ortografia com IA (não muda o tom)"
                  className="tb-ico-color" style={{ '--ic':'#8b5cf6', opacity:!input.trim()?.4:1 }}>
                  {corrigindo ? <Loader2 size={18} className="spin"/> : <Sparkles size={18} strokeWidth={2.3}/>}
                </button>
                <button onClick={()=>{setShowQR(p=>!p);setShowEmoji(false);}} title="Mensagens automáticas"
                  className={`tb-ico-color${showQR?' tb-on':''}`} style={{ '--ic':'#06b6d4' }}><Zap size={18} strokeWidth={2.3}/></button>
                <button onClick={()=>{setShowDocs(p=>!p);setShowQR(false);setShowEmoji(false);}} title="Banco de documentos — envie os principais em 1 clique"
                  className={`tb-ico-color${showDocs?' tb-on':''}`} style={{ '--ic':'#10b981' }}><FileText size={18} strokeWidth={2.3}/></button>
                {/* 🗓️ MONTAR AGENDAMENTO (ordem do master, 27/08): lê a conversa
                    inteira e escreve o cartão oficial na caixa, pronto pra revisar
                    e mandar. Não envia sozinho — quem manda é a atendente. */}
                <button onClick={montarCartaoAgenda} disabled={cartaoBusy}
                  title="🗓️ Montar mensagem de agendamento lendo a conversa"
                  className="tb-ico-color" style={{ '--ic':'#0ea5e9', opacity: cartaoBusy ? .5 : 1 }}>
                  {cartaoBusy ? <Loader2 size={18} className="spin"/> : <CalendarDays size={18} strokeWidth={2.3}/>}
                </button>
                <button onClick={()=>setShowAgendarMsg(true)} title="⏰ Agendar mensagem — escolha o dia e a hora pra disparar pro cliente"
                  className="tb-ico-color" style={{ '--ic':'#6366f1' }}><Clock size={18} strokeWidth={2.3}/></button>
                <Calculadora />

                <span className="tb-div" />

                <button onClick={()=>fileRef.current?.click()} title="Anexar arquivo"
                  className="tb-ico-color" style={{ '--ic':'#3b82f6' }}><Paperclip size={18} strokeWidth={2.3}/></button>
                {/* Biblioteca colada no clipe e no emoji — pedido do master: é
                    daqui que a equipe manda foto pro cliente, então tem que
                    estar junto do que ela já usa pra enviar. */}
                <button onClick={()=>{setBibAba('foto');setShowBib(true);}} title="🖼️ Biblioteca de Experiências — fotos e vídeos da clínica"
                  className="tb-ico-color" style={{ '--ic':'#d946ef' }}><Image size={18} strokeWidth={2.3}/></button>
                <button onClick={()=>{setShowEmoji(p=>!p);setShowQR(false);setShowProntas(false);}} title="Emojis"
                  className={`tb-ico-color${showEmoji?' tb-on':''}`} style={{ '--ic':'#f59e0b' }}><Smile size={18} strokeWidth={2.3}/></button>
                {/* 💟 Figurinhas coladas nos emojis (ordem do master, 24/08) */}
                <button onClick={()=>{setShowFigus(p=>!p);setShowEmoji(false);setShowQR(false);setShowProntas(false);}} title="Figurinhas da Vittalis"
                  className={`tb-ico-color${showFigus?' tb-on':''}`} style={{ '--ic':'#00B8C0' }}><Sticker size={18} strokeWidth={2.3}/></button>
                {/* 📝 MENSAGENS PRONTAS (pedido do master: tem atendente que não
                    usa a IA cem por cento) — os textos oficiais da casa em 1 toque */}
                <button onClick={()=>{setShowProntas(p=>!p);setShowEmoji(false);setShowQR(false);}} title="📝 Mensagens prontas da casa: boas-vindas, endereço, cartões de agendamento…"
                  className={`tb-ico-color${showProntas?' tb-on':''}`} style={{ '--ic':'#ec4899' }}><MessageSquare size={18} strokeWidth={2.3}/></button>
              </div>

              {/* Botão "IA responde" RETIRADO a pedido do master — a Vitta agora
                  responde sozinha (faixa roxa), e o rascunho sob demanda segue
                  disponível pelo Radar de intenção. */}
              <input ref={fileRef} type="file" accept="image/*,audio/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.gif" style={{ display:'none' }} onChange={handleFile}/>
              <textarea ref={textRef} onPaste={handlePaste} spellCheck lang="pt-BR" value={input} onChange={e=>setInput(e.target.value)}
                onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send();}}}
                placeholder="Mensagem… (Enter envia · Shift+Enter pula linha)" rows={2}
                style={{ flex:1, padding:'8px 12px', border:'1.5px solid var(--border)', borderRadius:10, fontSize:13, resize:'none', outline:'none', minHeight:44, maxHeight:170, overflowY:'auto', lineHeight:1.55, fontFamily:'DM Sans, sans-serif', transition:'border-color .15s', background:'var(--card,#fff)', color:'var(--txt)' }}
                onFocus={e=>{ e.target.style.borderColor='var(--tq)'; setShowEmoji(false); setShowProntas(false); }} onBlur={e=>e.target.style.borderColor='var(--border)'}/>
              {/* 🗓️ AGENDAR EM DESTAQUE (ordem do master, 27/08: "quero que ele
                  apareça embaixo também, em destaque, meio dourado"). É o botão
                  que fecha venda: lê a conversa e escreve o cartão na caixa.
                  Fica colado no enviar, dourado, impossível de não ver. */}
              <button onClick={montarCartaoAgenda} disabled={cartaoBusy}
                title="Lê a conversa e monta a mensagem de agendamento"
                style={{ display:'flex', alignItems:'center', gap:6, flexShrink:0, border:'none',
                  padding:'9px 15px', borderRadius:10, cursor: cartaoBusy ? 'wait' : 'pointer',
                  background:'linear-gradient(135deg,#E3B95C,#C4973B)', color:'#fff',
                  fontSize:12.5, fontWeight:800, letterSpacing:-.2,
                  boxShadow:'0 3px 12px rgba(196,151,59,.42)', opacity: cartaoBusy ? .65 : 1 }}>
                {cartaoBusy ? <Loader2 size={15} className="spin"/> : <CalendarDays size={15} strokeWidth={2.4}/>}
                <span className="vh-so-desktop">Agendar</span>
              </button>
              <button onClick={recording?stopRec:startRec} className="btn btn-ico" style={{ background:recording?'var(--err2)':'var(--bg2)', color:recording?'var(--err)':'var(--muted)', borderRadius:8, animation:recording?'pulse 1.2s infinite':'none' }}>
                {recording?<MicOff size={15}/>:<Mic size={15}/>}
              </button>
              <button onClick={()=>send()} disabled={(!input.trim()&&!filePreview)||sending} className="btn btn-ico" style={{ background:(input.trim()||filePreview)&&!sending?'var(--tq)':'var(--bg2)', color:(input.trim()||filePreview)&&!sending?'#fff':'var(--light)', borderRadius:8, transition:'all .15s' }}>
                {sending ? <Loader2 size={15} style={{animation:'spin 1s linear infinite'}}/> : <Send size={15}/>}
              </button>
            </div>
            {recording&&<div style={{ textAlign:'center', marginTop:5, fontSize:11, color:'var(--err)', fontWeight:600 }}>🔴 Gravando… clique para parar</div>}
          </div>
        </div>
      )}

      {/* 👤 Trocar quem assina a mensagem (gestão) */}
      {trocaRemet && (
        <div className="modal-bg" onClick={()=>setTrocaRemet(null)}>
          <div className="card" onClick={e=>e.stopPropagation()} style={{ width:'100%', maxWidth:380, padding:0, overflow:'hidden' }}>
            <div style={{ padding:'14px 16px 10px', borderBottom:'1px solid var(--border)' }}>
              <div style={{ fontSize:14.5, fontWeight:800, color:'var(--txt)' }}>
                {trocaRemet.varias ? '👥 Quem assinou as últimas mensagens?' : '👤 Quem enviou esta mensagem?'}
              </div>
              <div style={{ fontSize:11.5, color:'var(--muted)', marginTop:3 }}>
                {trocaRemet.varias
                  ? 'Passa a assinatura das últimas 15 mensagens da equipe nesta conversa.'
                  : 'Troca só o nome que aparece.'} A mensagem no WhatsApp do cliente não muda.
              </div>
            </div>
            <div style={{ maxHeight:300, overflowY:'auto', padding:'8px 10px 12px' }}>
              {atendentes.map(a2 => (
                <button key={a2.id} onClick={()=>confirmarTrocaRemetente(a2.nome)}
                  style={{ width:'100%', textAlign:'left', display:'flex', alignItems:'center', gap:9, padding:'9px 10px',
                    borderRadius:9, border:'none', background:'transparent', cursor:'pointer', fontSize:13, color:'var(--txt)' }}
                  onMouseEnter={e=>e.currentTarget.style.background='var(--bg)'}
                  onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                  <span style={{ width:26, height:26, borderRadius:'50%', background:a2.cor||'var(--tq)', color:'#fff',
                    display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:800 }}>
                    {fmt.initials(a2.nome)}
                  </span>
                  <span style={{ minWidth:0 }}>
                    {a2.nome}
                    {a2.titulo && <span style={{ display:'block', fontSize:10.5, color:'var(--muted)', fontWeight:700 }}>{a2.titulo}</span>}
                  </span>
                </button>
              ))}
              {!atendentes.length && <div style={{ padding:'14px 8px', fontSize:12.5, color:'var(--muted)' }}>Carregando a equipe…</div>}
            </div>
          </div>
        </div>
      )}

      {/* 📇 FICHA COMPLETA DO CLIENTE — dados pessoais + histórico de serviços */}
      {ficha && (
        <div onClick={e => e.target === e.currentTarget && (setFicha(null), setFichaEdit(null))}
          style={{ position:'fixed', inset:0, background:'rgba(3,43,48,.6)', zIndex:600, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div className="card" style={{ width:'100%', maxWidth:640, maxHeight:'90vh', padding:0, display:'flex', flexDirection:'column', overflow:'hidden' }}>
            <div style={{ padding:'14px 20px', background:'linear-gradient(120deg,#0E8C96,#00B8C0)', color:'#fff', display:'flex', alignItems:'center', gap:10 }}>
              <span style={{ fontSize:17 }}>📇</span>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontWeight:800, fontSize:14.5 }}>Ficha do cliente</div>
                <div style={{ fontSize:11, opacity:.9, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {ficha.cliente?.paciente || ficha.cliente?.nome_conversa || sel?.contact_name || ''}
                </div>
                {/* Dono do cliente por extenso — antes só existia a inicial num
                    círculo, e ninguém sabia de quem era a carteira. */}
                <div style={{ fontSize:11, marginTop:3, display:'flex', alignItems:'center', gap:5 }}>
                  <span style={{ background:'rgba(255,255,255,.22)', borderRadius:20, padding:'2px 9px', fontWeight:800 }}>
                    👤 {sel?.responsavel_nome ? `Responsável: ${sel.responsavel_nome}` : 'Sem responsável definido'}
                  </span>
                </div>
              </div>
              {/* 🏥 PUXAR DO VITTASYS: traz nascimento, responsável e doses já
                  aplicadas de lá. Evita a equipe redigitar o que já existe no
                  outro sistema — e errar a data, que é o que quebra a carteira. */}
              {ficha.cliente && !fichaEdit && (
                <button onClick={puxarVittasys} disabled={puxandoVs}
                  title="Puxar dados e doses do Vittasys"
                  style={{ background:'rgba(255,255,255,.2)', border:'none', color:'#fff', borderRadius:8, padding:'5px 10px', cursor:puxandoVs?'wait':'pointer', fontSize:11.5, fontWeight:800 }}>
                  {puxandoVs ? '⏳ puxando…' : '🏥 Puxar do Vittasys'}
                </button>
              )}
              {ficha.cliente && !fichaEdit && (
                <button onClick={() => setFichaEdit({ ...ficha.cliente })} title="Corrigir dados"
                  style={{ background:'rgba(255,255,255,.2)', border:'none', color:'#fff', borderRadius:8, padding:'5px 10px', cursor:'pointer', fontSize:11.5, fontWeight:800 }}>✏️ Editar</button>
              )}
              <button onClick={() => { setFicha(null); setFichaEdit(null); }} style={{ background:'rgba(255,255,255,.2)', border:'none', color:'#fff', borderRadius:8, padding:'5px 8px', cursor:'pointer' }}><X size={14}/></button>
            </div>

            <div style={{ flex:1, overflowY:'auto', padding:'16px 20px' }}>
              {ficha.carregando ? <div style={{ color:'var(--muted)', fontSize:13 }}>Carregando ficha…</div>
              : ficha.erro ? <div style={{ color:'var(--err)', fontSize:13, fontWeight:600 }}>⚠️ {ficha.erro}</div>
              : fichaEdit ? (<>
                {[['Nome do paciente','paciente'],['Nascimento (AAAA-MM-DD)','nascimento'],['CPF do paciente','cpf'],
                  ['Responsável','responsavel'],['CPF do responsável','responsavel_cpf'],['E-mail','email'],
                  ['Endereço','endereco'],['Bairro','bairro'],['CEP','cep'],['Outros filhos','filhos']].map(([lb, k]) => (
                  <div key={k} style={{ marginBottom:9 }}>
                    <label style={{ fontSize:10.5, fontWeight:800, color:'var(--muted)', textTransform:'uppercase', letterSpacing:.4 }}>{lb}</label>
                    <input value={fichaEdit[k] || ''} onChange={e => setFichaEdit(p2 => ({ ...p2, [k]: e.target.value }))}
                      style={{ width:'100%', padding:'8px 11px', borderRadius:10, border:'1.5px solid var(--border)', fontSize:13, background:'var(--card)', color:'var(--txt)', boxSizing:'border-box', marginTop:3 }} />
                  </div>
                ))}
                <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:12 }}>
                  <button onClick={() => setFichaEdit(null)} className="btn btn-s">Cancelar</button>
                  <button onClick={async () => {
                    try { await api.put(`/inbox/conversations/${sel.id}/ficha`, fichaEdit); setFichaEdit(null); Toast.show('Ficha salva! 📇', 'success'); abrirFicha(); }
                    catch (e) { Toast.show(e.message, 'error'); }
                  }} className="btn btn-p">Salvar ficha</button>
                </div>
              </>) : (<>
                {/* Resumo do relacionamento */}
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(110px,1fr))', gap:9, marginBottom:14 }}>
                  {[['🤝','Atendimentos', ficha.resumo?.atendimentos ?? 0],
                    ...(ficha.resumo?.total_gasto != null ? [['💰','Total investido', fmt.brl(ficha.resumo.total_gasto)]] : []),
                    ['📅','Agendamentos', ficha.resumo?.agendamentos ?? 0],
                    ['🗓️','Cliente desde', ficha.cliente?.cliente_desde ? new Date(ficha.cliente.cliente_desde).toLocaleDateString('pt-BR') : '—']].map(([ic, lb, v]) => (
                    <div key={lb} style={{ background:'var(--bg2)', borderRadius:11, padding:'9px 11px' }}>
                      <div style={{ fontSize:10.5, color:'var(--muted)', fontWeight:700 }}>{ic} {lb}</div>
                      <div style={{ fontSize:15, fontWeight:900, lineHeight:1.3 }}>{v}</div>
                    </div>
                  ))}
                </div>

                {/* Dados pessoais */}
                <div style={{ fontSize:10.5, fontWeight:800, color:'var(--muted)', textTransform:'uppercase', letterSpacing:.6, marginBottom:6 }}>Dados pessoais</div>
                {[['👶','Paciente', ficha.cliente?.paciente], ['🎂','Nascimento', ficha.cliente?.nascimento ? fmt.date(ficha.cliente.nascimento) : null],
                  ['🆔','CPF do paciente', ficha.cliente?.cpf], ['👤','Responsável', ficha.cliente?.responsavel],
                  ['🆔','CPF do responsável', ficha.cliente?.responsavel_cpf], ['📱','Telefone', fmt.phone(ficha.cliente?.telefone)],
                  ['✉️','E-mail', ficha.cliente?.email], ['🏠','Endereço', ficha.cliente?.endereco],
                  ['📍','CEP', ficha.cliente?.cep], ['👧','Outros filhos', ficha.cliente?.filhos],
                  ['📋','Etapa no funil', ficha.cliente?.status_funil]].filter(x => x[2]).map(([ic, lb, v]) => (
                  <div key={lb} style={{ display:'flex', gap:9, padding:'6px 0', borderBottom:'1px solid var(--border)' }}>
                    <span style={{ fontSize:13, width:18, flexShrink:0 }}>{ic}</span>
                    <span style={{ fontSize:11.5, color:'var(--muted)', minWidth:120, fontWeight:700 }}>{lb}</span>
                    {/* Telefone e CPF da ficha nem chegam a ser SELECIONÁVEIS
                        (pedido do master). O bloqueio de Ctrl+C já existia, mas
                        aqui o dado nem entra na seleção — não dá pra arrastar,
                        pegar no toque longo do celular nem no menu do botão
                        direito. Continua legível pra atendente ligar. */}
                    {/telefone|cpf/i.test(lb) ? (
                      <span data-nocopy="1" onCopy={e => e.preventDefault()} onContextMenu={e => e.preventDefault()}
                        style={{ fontSize:12.5, flex:1, minWidth:0, wordBreak:'break-word',
                          userSelect:'none', WebkitUserSelect:'none', MozUserSelect:'none', msUserSelect:'none',
                          WebkitTouchCallout:'none', cursor:'default' }}>{v}</span>
                    ) : (
                      <span style={{ fontSize:12.5, flex:1, minWidth:0, wordBreak:'break-word' }}>{v}</span>
                    )}
                  </div>
                ))}

                {/* 📝 BLOCO DE NOTAS — o que se descobre na ligação fica aqui,
                    com quem anotou e quando. Nada some quando outra pessoa edita. */}
                {/* 📝 O CORAÇÃO DO PERFIL (ordem do master, 24/08): aqui fica tudo o
                    que foi conversado por ligação, sem limite de tamanho, para
                    qualquer atendente abrir depois e já saber a história do cliente. */}
                <div style={{ fontSize:10.5, fontWeight:800, color:'var(--muted)', textTransform:'uppercase', letterSpacing:.6, margin:'16px 0 3px' }}>
                  📝 Anotações do cliente {notas.length ? `(${notas.length})` : ''}
                </div>
                <div style={{ fontSize:11, color:'var(--muted)', marginBottom:8, lineHeight:1.45 }}>
                  Escreva sem limite o que foi conversado na ligação e o que for importante. Fica guardado com o seu nome e a data, e qualquer atendente encontra aqui depois 💙
                </div>
                <div style={{ display:'flex', gap:6, marginBottom:7, flexWrap:'wrap' }}>
                  {[['ligacao','📞 Ligação'],['nota','📝 Nota'],['visita','🏥 Visita'],['importante','⭐ Importante']].map(([v,l]) => (
                    <button key={v} onClick={() => setNotaTipo(v)}
                      style={{ padding:'4px 10px', borderRadius:8, fontSize:11, fontWeight:700, cursor:'pointer',
                        border:`1.5px solid ${notaTipo===v?'var(--tq)':'var(--border)'}`,
                        background:notaTipo===v?'var(--tq3)':'var(--card)', color:notaTipo===v?'var(--tq2)':'var(--muted)' }}>{l}</button>
                  ))}
                </div>
                <textarea value={notaTxt} onChange={e => setNotaTxt(e.target.value)} rows={6}
                  placeholder="Ex.: Liguei 14h. A mãe decide, o pai paga. O Théo tem 8 meses, já tomou as do 6º mês em outra clínica. Vai viajar em janeiro e quer retomar em fevereiro. Pediu para chamar no WhatsApp só de tarde."
                  style={{ width:'100%', minHeight:120, padding:'10px 12px', borderRadius:10, border:'1.5px solid var(--border)', fontSize:12.5, lineHeight:1.55,
                    background:'var(--card)', color:'var(--txt)', boxSizing:'border-box', resize:'vertical', fontFamily:'inherit' }} />
                <button onClick={salvarNota} disabled={notaBusy || !notaTxt.trim()} className="btn btn-p btn-sm"
                  style={{ marginTop:7, fontWeight:700, opacity:(notaBusy || !notaTxt.trim())?.5:1 }}>
                  {notaBusy ? 'Salvando…' : 'Salvar anotação'}
                </button>

                <div style={{ marginTop:12, display:'flex', flexDirection:'column', gap:8 }}>
                  {!notas.length && <div style={{ fontSize:12.5, color:'var(--muted)' }}>Nenhuma anotação ainda.</div>}
                  {notas.map(n => (
                    <div key={n.id} style={{ padding:'9px 11px', borderRadius:10, background:'var(--bg2)',
                      borderLeft:`3px solid ${n.tipo==='importante'?'#eab308':n.tipo==='ligacao'?'#34d399':n.tipo==='visita'?'#8b5cf6':'var(--tq)'}` }}>
                      <div style={{ fontSize:12.5, whiteSpace:'pre-wrap', lineHeight:1.5 }}>{n.texto}</div>
                      <div style={{ display:'flex', alignItems:'center', gap:7, marginTop:5, fontSize:10.5, color:'var(--muted)' }}>
                        <b>{String(n.autor_nome || '—').split(' ')[0]}</b>
                        <span>{new Date(n.created_at).toLocaleString('pt-BR')}</span>
                        <button onClick={() => apagarNota(n.id)} title="Apagar"
                          style={{ marginLeft:'auto', border:'none', background:'none', color:'var(--muted)', cursor:'pointer', fontSize:11 }}>✕</button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Histórico de serviços */}
                <div style={{ fontSize:10.5, fontWeight:800, color:'var(--muted)', textTransform:'uppercase', letterSpacing:.6, margin:'16px 0 6px' }}>
                  Serviços realizados {ficha.vendas?.length ? `(${ficha.vendas.length})` : ''}
                </div>
                {!ficha.vendas?.length ? (
                  <div style={{ fontSize:12.5, color:'var(--muted)', padding:'6px 0' }}>Nenhum serviço registrado ainda.</div>
                ) : ficha.vendas.map(v => (
                  <div key={v.id} style={{ display:'flex', alignItems:'center', gap:9, padding:'8px 0', borderBottom:'1px solid var(--border)' }}>
                    <span style={{ fontSize:13, width:18, flexShrink:0 }}>{v.setor === 'consultas' ? '🩺' : v.setor === 'terapias' ? '🧩' : '💉'}</span>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:12.5, fontWeight:700, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{v.servico || v.categoria || 'Serviço'}</div>
                      <div style={{ fontSize:10.5, color:'var(--muted)' }}>
                        {fmt.date(v.data_venda)}{v.paciente_nome ? ` · ${v.paciente_nome}` : ''}{v.atendente_nome ? ` · ${String(v.atendente_nome).split(' ')[0]}` : ''}
                      </div>
                    </div>
                    {v.valor != null && <span style={{ fontSize:12.5, fontWeight:800, color:'var(--ok,#16a34a)' }}>{fmt.brl(v.valor)}</span>}
                  </div>
                ))}

                {/* Agendamentos */}
                {ficha.agenda?.length > 0 && (<>
                  <div style={{ fontSize:10.5, fontWeight:800, color:'var(--muted)', textTransform:'uppercase', letterSpacing:.6, margin:'16px 0 6px' }}>Agendamentos ({ficha.agenda.length})</div>
                  {ficha.agenda.map(a => (
                    <div key={a.id} style={{ display:'flex', alignItems:'center', gap:9, padding:'7px 0', borderBottom:'1px solid var(--border)' }}>
                      <span style={{ fontSize:12.5, fontWeight:800, color:'var(--tq2)', minWidth:74 }}>{fmt.date(a.data)}</span>
                      <span style={{ fontSize:12, minWidth:40 }}>{a.hora}</span>
                      <span style={{ flex:1, minWidth:0, fontSize:12, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{a.servico || a.paciente}</span>
                      <span style={{ fontSize:10, fontWeight:800, color: a.status === 'Realizado' ? 'var(--ok)' : a.status === 'Faltou' ? '#c2410c' : a.status === 'Cancelado' ? 'var(--err)' : 'var(--muted)' }}>{a.status}</span>
                    </div>
                  ))}
                </>)}

              </>)}
            </div>
          </div>
        </div>
      )}

      {/* ✏️ EDITOR DA MENSAGEM — caixa grande, com as linhas preservadas */}
      {editMsg && (
        <div onClick={e => e.target === e.currentTarget && setEditMsg(null)}
          style={{ position:'fixed', inset:0, background:'rgba(3,43,48,.6)', zIndex:700, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div className="card" style={{ width:'100%', maxWidth:560, padding:0, overflow:'hidden', display:'flex', flexDirection:'column', maxHeight:'88vh' }}>
            <div style={{ padding:'13px 18px', background:'var(--bg)', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:9 }}>
              <span style={{ fontSize:16 }}>✏️</span>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontWeight:800, fontSize:14 }}>Editar mensagem</div>
                <div style={{ fontSize:11, color:'var(--muted)' }}>O cliente vê a mensagem marcada como editada.</div>
              </div>
              <button onClick={()=>setEditMsg(null)} style={{ border:'none', background:'none', cursor:'pointer', color:'var(--muted)', fontSize:16 }}>✕</button>
            </div>
            <textarea value={editTxt} onChange={e=>setEditTxt(e.target.value)} autoFocus
              onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) salvarEdicao(); }}
              style={{ flex:1, minHeight:260, margin:0, padding:'14px 18px', border:'none', outline:'none', resize:'vertical',
                background:'var(--card)', color:'var(--txt)', fontSize:13.5, lineHeight:1.65, fontFamily:'inherit', whiteSpace:'pre-wrap' }} />
            <div style={{ padding:'11px 18px', borderTop:'1px solid var(--border)', display:'flex', alignItems:'center', gap:9, flexWrap:'wrap' }}>
              <span style={{ fontSize:11, color:'var(--muted)' }}>
                {editTxt.split('\n').length} linha(s) · {editTxt.length} caracteres · Ctrl+Enter salva
              </span>
              <button onClick={()=>setEditTxt(editMsg.original)} className="btn btn-sm"
                style={{ marginLeft:'auto', background:'var(--bg2)', color:'var(--muted)', border:'1.5px solid var(--border)' }}>↺ Voltar ao original</button>
              <button onClick={salvarEdicao} disabled={editBusy || !editTxt.trim()} className="btn btn-p btn-sm"
                style={{ fontWeight:800, opacity:(editBusy || !editTxt.trim())?.5:1 }}>{editBusy ? 'Salvando…' : 'Salvar'}</button>
            </div>
          </div>
        </div>
      )}

      {/* 📋 RAIO-X DA CONVERSA */}
      {resumo && (
        <div onClick={e => e.target === e.currentTarget && setResumo(null)}
          style={{ position:'fixed', inset:0, background:'rgba(3,43,48,.6)', zIndex:600, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div className="card" style={{ width:'100%', maxWidth:600, maxHeight:'88vh', padding:0, display:'flex', flexDirection:'column', overflow:'hidden' }}>
            <div style={{ padding:'14px 20px', background:'linear-gradient(120deg,#0f766e,#14b8a6)', color:'#fff', display:'flex', alignItems:'center', gap:10 }}>
              <span style={{ fontSize:17 }}>📋</span>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontWeight:800, fontSize:14.5 }}>Raio-X da conversa</div>
                <div style={{ fontSize:11, opacity:.9, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{sel?.contact_name || ''}{resumo.mensagens ? ` · ${resumo.mensagens} mensagens analisadas` : ''}</div>
              </div>
              {!resumo.erro && (
                <button onClick={async () => { setResumoLoad(true); try { setResumo(await api.get(`/inbox/conversations/${sel.id}/resumo?forcar=1`)); } catch (e) { setResumo({ erro: e.message }); } setResumoLoad(false); }}
                  title="Analisar de novo" style={{ background:'rgba(255,255,255,.2)', border:'none', color:'#fff', borderRadius:8, padding:'5px 9px', cursor:'pointer', fontSize:12 }}>🔄</button>
              )}
              <button onClick={() => setResumo(null)} style={{ background:'rgba(255,255,255,.2)', border:'none', color:'#fff', borderRadius:8, padding:'5px 8px', cursor:'pointer' }}><X size={14}/></button>
            </div>

            <div style={{ flex:1, overflowY:'auto', padding:'16px 20px' }}>
              {resumo.erro ? (
                <div style={{ color:'var(--err)', fontSize:13, fontWeight:600 }}>⚠️ {resumo.erro}</div>
              ) : (<>
                <div style={{ fontSize:13.5, lineHeight:1.7, color:'var(--txt)', marginBottom:14 }}>{resumo.resumo}</div>

                {[['👶','Cliente', resumo.cliente], ['🎯','Interesse', resumo.interesse], ['💬','Já oferecido', resumo.ja_oferecido],
                  ['🤝','Combinado', resumo.combinado], ['⏳','Pendente agora', resumo.pendente]].filter(x => x[2]).map(([ic, rot, val]) => (
                  <div key={rot} style={{ display:'flex', gap:9, padding:'7px 0', borderTop:'1px solid var(--border)' }}>
                    <span style={{ fontSize:14, width:20, flexShrink:0 }}>{ic}</span>
                    <div style={{ minWidth:0 }}>
                      <div style={{ fontSize:10, fontWeight:800, letterSpacing:.5, textTransform:'uppercase', color:'var(--muted)' }}>{rot}</div>
                      <div style={{ fontSize:13, lineHeight:1.55 }}>{val}</div>
                    </div>
                  </div>
                ))}

                {resumo.objecoes?.length > 0 && (
                  <div style={{ display:'flex', gap:9, padding:'7px 0', borderTop:'1px solid var(--border)' }}>
                    <span style={{ fontSize:14, width:20, flexShrink:0 }}>🛑</span>
                    <div>
                      <div style={{ fontSize:10, fontWeight:800, letterSpacing:.5, textTransform:'uppercase', color:'var(--muted)' }}>Objeções do cliente</div>
                      {resumo.objecoes.map((o, i) => <div key={i} style={{ fontSize:13, lineHeight:1.55 }}>• {o}</div>)}
                    </div>
                  </div>
                )}

                {resumo.proximo_passo && (
                  <div style={{ marginTop:14, padding:'12px 14px', borderRadius:12, background:'#ecfdf5', border:'1px solid #6ee7b7' }}>
                    <div style={{ fontSize:10, fontWeight:800, letterSpacing:.5, textTransform:'uppercase', color:'#047857', marginBottom:3 }}>🚀 Próximo passo pra fechar</div>
                    <div style={{ fontSize:13.5, lineHeight:1.6, color:'#065f46', fontWeight:600 }}>{resumo.proximo_passo}</div>
                  </div>
                )}

                {resumo.avaliacao && (
                  <div style={{ marginTop:14, padding:'13px 15px', borderRadius:12, background:'var(--bg2)', border:'1px solid var(--border)' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:9, marginBottom:9 }}>
                      <span style={{ fontSize:10, fontWeight:800, letterSpacing:.5, textTransform:'uppercase', color:'var(--muted)', flex:1 }}>⭐ Avaliação do atendimento</span>
                      <span style={{ fontSize:17, fontWeight:900, color: resumo.avaliacao.nota >= 8 ? 'var(--ok,#16a34a)' : resumo.avaliacao.nota >= 6 ? '#d97706' : 'var(--err,#dc2626)' }}>
                        {resumo.avaliacao.nota}/10
                      </span>
                    </div>
                    {resumo.avaliacao.pontos_fortes?.length > 0 && (
                      <div style={{ marginBottom:8 }}>
                        <div style={{ fontSize:11, fontWeight:800, color:'var(--ok,#16a34a)', marginBottom:2 }}>✅ Fez bem</div>
                        {resumo.avaliacao.pontos_fortes.map((x, i) => <div key={i} style={{ fontSize:12.5, lineHeight:1.55 }}>• {x}</div>)}
                      </div>
                    )}
                    {resumo.avaliacao.deixou_a_desejar?.length > 0 && (
                      <div style={{ marginBottom:8 }}>
                        <div style={{ fontSize:11, fontWeight:800, color:'var(--err,#dc2626)', marginBottom:2 }}>⚠️ Deixou a desejar</div>
                        {resumo.avaliacao.deixou_a_desejar.map((x, i) => <div key={i} style={{ fontSize:12.5, lineHeight:1.55 }}>• {x}</div>)}
                      </div>
                    )}
                    {resumo.avaliacao.dica && (
                      <div style={{ fontSize:12.5, lineHeight:1.6, fontStyle:'italic', color:'var(--txt2)', paddingTop:7, borderTop:'1px solid var(--border)' }}>
                        💡 {resumo.avaliacao.dica}
                      </div>
                    )}
                  </div>
                )}
              </>)}
            </div>
          </div>
        </div>
      )}

      {/* Lightbox */}
      {fotosModo && (
        <div style={{ position:'fixed', bottom:18, left:'50%', transform:'translateX(-50%)', zIndex:600, display:'flex', gap:8, alignItems:'center',
          background:'rgba(3,37,54,.92)', borderRadius:16, padding:'10px 14px', boxShadow:'0 10px 34px rgba(0,0,0,.4)', backdropFilter:'blur(4px)', flexWrap:'wrap', justifyContent:'center' }}>
          <span style={{ color:'#fff', fontSize:12.5, fontWeight:900 }}>🖼️ {Object.keys(fotosSel).length} foto(s) — toque nas fotos da conversa pra marcar · salvar em:</span>
          {[['terapias','🧩 Terapias'],['consultas','🩺 Consultas'],['vacinas','💉 Vacinas']].map(([k,rot]) => (
            <button key={k} onClick={()=>exportarFotos(k, rot)}
              style={{ padding:'7px 13px', borderRadius:10, border:'none', cursor:'pointer', background:'#fff', color:'#0e7490', fontSize:12, fontWeight:900 }}>{rot}</button>
          ))}
          <button onClick={()=>setFotosModo(false)} style={{ padding:'7px 11px', borderRadius:10, border:'1px solid rgba(255,255,255,.4)', cursor:'pointer', background:'transparent', color:'#fff', fontSize:12, fontWeight:800 }}>Cancelar</button>
        </div>
      )}

      {lightbox && (
        <div onClick={()=>setLightbox(null)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.92)', zIndex:500, display:'flex', alignItems:'center', justifyContent:'center', cursor:'zoom-out' }}>
          <img src={lightbox} alt="" style={{ maxWidth:'92vw', maxHeight:'90vh', borderRadius:8 }}/>
          {/* 📚 Foto da conversa → Biblioteca em 2 cliques (gestão): vira prova
              social da Mary. Lembrete de autorização de imagem no próprio botão. */}
          {['master','supervisor'].includes(user?.role) && String(lightbox).startsWith('data:image') && (
            <div onClick={e=>e.stopPropagation()} style={{ position:'absolute', bottom:22, left:'50%', transform:'translateX(-50%)', display:'flex', gap:8, alignItems:'center',
              background:'rgba(0,0,0,.55)', borderRadius:14, padding:'8px 12px', backdropFilter:'blur(4px)' }}>
              <span style={{ color:'#fff', fontSize:11.5, fontWeight:800 }}>📚 Salvar na Biblioteca:</span>
              {[['terapias','🧩 Terapias'],['consultas','🩺 Consultas'],['vacinas','💉 Vacinas']].map(([k,rot]) => (
                <button key={k} onClick={async ()=>{
                  try {
                    const m = String(lightbox).match(/^data:([^;]+);base64,(.+)$/s);
                    if (!m) return Toast.show('Formato da imagem não suportado.', 'error');
                    await api.post('/extras/biblioteca', { titulo:`Foto da conversa — ${sel?.contact_name || 'cliente'}`,
                      tipo:'foto', setor:k, categoria:'prova social', mime:m[1], data:m[2] });
                    Toast.show(`Foto salva na Biblioteca (${rot}) — confirme que há autorização de imagem! 📚`, 'success');
                    setLightbox(null);
                  } catch (e) { Toast.show(e.message, 'error'); }
                }} style={{ padding:'6px 12px', borderRadius:10, border:'none', cursor:'pointer', background:'#fff', color:'#0e7490', fontSize:11.5, fontWeight:900 }}>
                  {rot}
                </button>
              ))}
            </div>
          )}
          <button onClick={()=>setLightbox(null)} style={{ position:'absolute', top:18, right:18, background:'rgba(255,255,255,.14)', color:'#fff', border:'none', borderRadius:'50%', padding:9, cursor:'pointer' }}><X size={17}/></button>
        </div>
      )}

      {showAgendar && sel && (
        <AgendarModal sel={sel} api={api} onClose={(ok) => { setShowAgendar(false); if (ok) { Toast.show('Agendamento criado! 📅', 'success'); window.__auditLog?.('agendar', 'agenda', '', { paciente: sel?.contact_name }); } }} />
      )}
      {showAgendarMsg && sel && (
        <AgendarMsgModal sel={sel} api={api} textoInicial={input} onClose={(ok) => { setShowAgendarMsg(false); if (ok) Toast.show('Mensagem agendada! ⏰', 'success'); }} />
      )}
      {showIndicar && sel && (
        <IndicarModal sel={sel} api={api} onClose={() => setShowIndicar(false)} />
      )}
      {showBib && sel && (
        <BibliotecaPicker convId={sel.id} setor={sel.setor} api={api} abaInicial={bibAba} onClose={() => setShowBib(false)} />
      )}

      {showProposta && sel && (
        <PropostaModal convId={sel.id} token={token} contactName={sel.contact_name} atendente={user?.nome}
          onClose={txt=>{setShowProposta(false);if(txt)setMsgs(p=>[...p,{id:Date.now(),from_type:'me',type:'text',content:txt,created_at:new Date().toISOString(),status:'sent',sender_nome:user?.nome}]);}}/>
      )}

      {showTerapia && sel && (
        <TerapiaOrcamentoModal contactName={sel.contact_name} atendente={user?.nome} onClose={()=>setShowTerapia(false)} />
      )}

      {encOpen && sel && (
        <div onClick={()=>setEncOpen(false)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, padding:16 }}>
          <div onClick={e=>e.stopPropagation()} className="card" style={{ width:380, maxWidth:'100%', padding:22 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}><span style={{ fontSize:17 }}>📤</span><h3 style={{ fontSize:16, fontWeight:800 }}>Encaminhar conversa</h3></div>
            <p style={{ fontSize:12, color:'var(--muted)', marginBottom:14, lineHeight:1.5 }}>
              Envia o histórico de <b>{sel.contact_name || fmt.phone(sel.phone)}</b> pro WhatsApp de outro canal/setor, já com o <b>link do cliente no final</b> pra equipe de lá chamar e agendar.
            </p>
            <div style={{ display:'flex', flexDirection:'column', gap:11 }}>
              {encDestino?.configurado ? (
                <div style={{ display:'flex', alignItems:'center', gap:10, padding:'11px 13px', borderRadius:12,
                  background:'linear-gradient(120deg, var(--tq), #0aa6ae)', color:'#fff', boxShadow:'0 3px 10px rgba(0,184,192,.35)' }}>
                  <span style={{ fontSize:17 }}>📌</span>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:10, fontWeight:800, textTransform:'uppercase', letterSpacing:.6, opacity:.85 }}>Enviar para (destino fixo)</div>
                    <div style={{ fontSize:14, fontWeight:900 }}>{encDestino.nome || 'Planos Vacinais'}</div>
                  </div>
                  <span style={{ fontSize:15 }}>✅</span>
                </div>
              ) : (
                <div className="field" style={{ margin:0 }}><label>WhatsApp de destino (com DDD) *</label>
                  <input inputMode="numeric" value={encForm.destino} onChange={e=>setEncForm(p=>({ ...p, destino: e.target.value.replace(/[^\d() -]/g,'') }))} placeholder="(98) 9...." /></div>
              )}
              <div className="field" style={{ margin:0 }}><label>Quantas mensagens do histórico</label>
                <select value={encForm.mensagens} onChange={e=>setEncForm(p=>({ ...p, mensagens: parseInt(e.target.value) }))} style={{ width:'100%' }}>
                  {[10,20,40,60].map(n=><option key={n} value={n}>Últimas {n}</option>)}
                </select></div>
              <div className="field" style={{ margin:0 }}><label>Observação pro setor (opcional)</label>
                <input value={encForm.observacao} onChange={e=>setEncForm(p=>({ ...p, observacao: e.target.value }))} maxLength={200} placeholder="Ex.: cliente do plano ativo pedindo agendamento" /></div>
              <div style={{ display:'flex', gap:8, marginTop:4 }}>
                <button onClick={async ()=>{
                  if (!encDestino?.configurado && String(encForm.destino).replace(/\D/g,'').length < 10) { Toast.show('Informe o número de destino com DDD', 'error'); return; }
                  setEncSaving(true);
                  try {
                    await api.post(`/inbox/conversations/${sel.id}/encaminhar`, { destino: encForm.destino, mensagens: encForm.mensagens, observacao: encForm.observacao });
                    Toast.show('📤 Conversa encaminhada com o link do cliente!', 'success');
                    setEncOpen(false);
                  } catch (e) { Toast.show(e.message || 'Falha ao encaminhar', 'error'); }
                  setEncSaving(false);
                }} disabled={encSaving} className="btn btn-p" style={{ flex:1, fontWeight:800 }}>
                  {encSaving ? <span className="spin" style={{width:14,height:14}}/> : '📤 Encaminhar agora'}
                </button>
                <button onClick={()=>setEncOpen(false)} className="btn">Cancelar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {transfOpen && sel && (
        <div onClick={()=>setTransfOpen(false)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, padding:16 }}>
          <div onClick={e=>e.stopPropagation()} className="card" style={{ width:360, maxWidth:'100%', padding:22, maxHeight:'80vh', overflowY:'auto' }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
              <RefreshCw size={18} color="var(--tq)"/>
              <h3 style={{ fontSize:16, fontWeight:800 }}>Transferir atendimento</h3>
            </div>
            <p style={{ fontSize:12, color:'var(--muted)', marginBottom:14 }}>Ao transferir, este atendimento sai da sua lista e vai para a pessoa escolhida.</p>
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              {/* 👥 A equipe da supervisora vem PRIMEIRO, destacada — pedido do
                  master: Danielle recebe os leads e distribui pros dela. */}
              {/* Cartões sólidos e com contraste (cobrança do master: estava
                  "muito transparente, muito branco") */}
              {atendentes.filter(a => a.id !== user?.id)
                .sort((a,b)=>(b.supervisor_id===user?.id)-(a.supervisor_id===user?.id))
                .map(a => { const minha = a.supervisor_id === user?.id; return (
                <button key={a.id} onClick={()=>transferir(a)} disabled={transfSaving}
                  style={{ display:'flex', alignItems:'center', gap:11, justifyContent:'flex-start', padding:'11px 13px', textAlign:'left',
                    width:'100%', borderRadius:12, cursor:'pointer', transition:'transform .12s, box-shadow .12s',
                    background: minha ? 'linear-gradient(120deg, var(--tq), #0aa6ae)' : 'var(--bg2)',
                    border: minha ? 'none' : '1.5px solid var(--border)',
                    boxShadow: minha ? '0 3px 10px rgba(0,184,192,.35)' : '0 1px 4px rgba(0,0,0,.12)',
                    opacity: transfSaving ? .6 : 1 }}
                  onMouseEnter={e=>{ e.currentTarget.style.transform='translateX(3px)'; e.currentTarget.style.boxShadow='0 4px 14px rgba(0,184,192,.3)'; }}
                  onMouseLeave={e=>{ e.currentTarget.style.transform='none'; e.currentTarget.style.boxShadow= minha ? '0 3px 10px rgba(0,184,192,.35)' : '0 1px 4px rgba(0,0,0,.12)'; }}>
                  <div style={{ width:38, height:38, borderRadius:'50%', background:a.cor||'var(--tq)', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:900, flexShrink:0, border:'2px solid rgba(255,255,255,.35)' }}>
                    {(a.nome||'?').split(' ').map(p=>p[0]).slice(0,2).join('')}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontWeight:800, fontSize:13.5, color: minha ? '#fff' : 'var(--txt)' }}>
                      {a.nome}{minha && <span style={{ fontSize:9.5, fontWeight:900, background:'rgba(255,255,255,.25)', color:'#fff', borderRadius:7, padding:'1.5px 7px', marginLeft:7 }}>👥 MINHA EQUIPE</span>}
                    </div>
                    {/* 🏷️ O TÍTULO da carteira manda (ordem do master, 27/08:
                        "Poliana: Fidelidade, Raylane: Planos Vacinais…"); sem
                        título cadastrado, cai no setor como antes. */}
                    {(a.titulo || a.setor) && (
                      <div style={{ fontSize:11, fontWeight:700, color: minha ? 'rgba(255,255,255,.85)' : 'var(--muted)',
                        textTransform: a.titulo ? 'none' : 'capitalize' }}>{a.titulo || a.setor}</div>
                    )}
                  </div>
                  <span style={{ fontSize:15, color: minha ? '#fff' : 'var(--tq2)', flexShrink:0 }}>➜</span>
                </button>
              );})}
              {atendentes.filter(a => a.id !== user?.id).length === 0 && <div style={{ fontSize:12, color:'var(--muted)' }}>Nenhum outro atendente disponível.</div>}
            </div>
            <button onClick={()=>setTransfOpen(false)} className="btn btn-sm" style={{ width:'100%', marginTop:12 }}>Cancelar</button>
          </div>
        </div>
      )}

      {followOpen && sel && (
        <div onClick={()=>setFollowOpen(false)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, padding:16 }}>
          <div onClick={e=>e.stopPropagation()} className="card" style={{ width:360, maxWidth:'100%', padding:22 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}><span style={{ fontSize:18 }}>🔁</span><h3 style={{ fontSize:16, fontWeight:800 }}>Colocar no repique</h3></div>
            <p style={{ fontSize:12, color:'var(--muted)', marginBottom:16 }}>Cliente <b>{sel.contact_name || fmt.phone(sel.phone)}</b> vai dar retorno? Marque aqui e ele entra no painel de <b>Retornos</b> — ninguém esquece de recobrar. 💪</p>
            <div style={{ display:'flex', flexDirection:'column', gap:11 }}>
              <div className="field" style={{ margin:0 }}>
                <label>Recobrar quando? *</label>
                {/* Atalhos rápidos — a atendente marca o repique em 2 toques */}
                <div style={{ display:'flex', gap:6, flexWrap:'wrap', margin:'4px 0 7px' }}>
                  {[['Amanhã',1],['2 dias',2],['3 dias',3],['1 semana',7]].map(([rot,dias])=>{
                    const d = new Date(Date.now() + dias*86400000).toISOString().slice(0,10);
                    const on = followForm.data === d;
                    return (
                      <button key={rot} type="button" onClick={()=>setFollowForm(p=>({...p,data:d}))}
                        style={{ padding:'6px 12px', borderRadius:9, cursor:'pointer', fontSize:12, fontWeight:700,
                          border:`1.5px solid ${on?'#8b5cf6':'var(--border)'}`,
                          background:on?'#f5f3ff':'var(--card)', color:on?'#7c3aed':'var(--muted)' }}>{on?'✓ ':''}{rot}</button>
                    );
                  })}
                </div>
                <input type="date" value={followForm.data} onChange={e=>setFollowForm(p=>({...p,data:e.target.value}))} />
              </div>
              <div className="field" style={{ margin:0 }}><label>Motivo do repique</label>
                <select value={followForm.motivo} onChange={e=>setFollowForm(p=>({...p,motivo:e.target.value}))} style={{ width:'100%' }}>
                  <option value="">— (opcional)</option>
                  {MOTIVOS_FOLLOW.map(m=><option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div style={{ display:'flex', gap:8, marginTop:4 }}>
                <button onClick={salvarFollow} disabled={followSaving} className="btn btn-p" style={{ flex:1, fontWeight:800 }}>{followSaving ? <span className="spin" style={{width:14,height:14}}/> : '🔁 Colocar no repique'}</button>
                <button onClick={()=>setFollowOpen(false)} className="btn">Cancelar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {perderOpen && sel && (
        <div onClick={()=>setPerderOpen(false)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, padding:16 }}>
          <div onClick={e=>e.stopPropagation()} className="card" style={{ width:380, maxWidth:'100%', padding:22 }}>
            <h3 style={{ fontSize:16, fontWeight:800, marginBottom:6 }}>Marcar como perdido</h3>
            <p style={{ fontSize:12, color:'var(--muted)', marginBottom:16 }}>Cliente: <b>{sel.contact_name || fmt.phone(sel.phone)}</b>. O motivo é obrigatório e entra nos relatórios.</p>
            <div style={{ display:'flex', flexDirection:'column', gap:11 }}>
              <div className="field" style={{ margin:0 }}><label>Motivo *</label>
                <select value={perderForm.motivo} onChange={e=>setPerderForm(p=>({...p,motivo:e.target.value}))} style={{ width:'100%' }}>
                  <option value="">Escolha…</option>
                  {MOTIVOS_PERDA.map(m=><option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div className="field" style={{ margin:0 }}><label>Valor potencial perdido (opcional)</label><input type="number" value={perderForm.valor_potencial} onChange={e=>setPerderForm(p=>({...p,valor_potencial:e.target.value}))} placeholder="R$ que deixou de vender" /></div>
              <div className="field" style={{ margin:0 }}><label>Observação (opcional)</label><textarea value={perderForm.observacao} onChange={e=>setPerderForm(p=>({...p,observacao:e.target.value}))} rows={2} style={{ resize:'vertical' }} /></div>
              <div style={{ display:'flex', gap:8, marginTop:4 }}>
                <button onClick={salvarPerda} disabled={perderSaving} className="btn" style={{ flex:1, background:'#dc2626', color:'#fff', fontWeight:700 }}>{perderSaving ? <span className="spin" style={{width:14,height:14}}/> : 'Marcar perdido'}</button>
                <button onClick={()=>setPerderOpen(false)} className="btn">Cancelar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {vendaOpen && sel && (
        <div onClick={()=>setVendaOpen(false)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, padding:16 }}>
          <div onClick={e=>e.stopPropagation()} className="card" style={{ width:400, maxWidth:'100%', padding:22, maxHeight:'88vh', overflowY:'auto' }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
              <span style={{ fontSize:18 }}>💰</span>
              <h3 style={{ fontSize:16, fontWeight:800 }}>Registrar venda</h3>
            </div>
            <p style={{ fontSize:12, color:'var(--muted)', marginBottom:16 }}>Cliente: <b>{sel.contact_name || fmt.phone(sel.phone)}</b> · entra na meta 🎯</p>
            {(() => {
              const brutoV = parseFloat(String(vendaForm.valor).replace(',', '.')) || 0;
              const descV = parseFloat(String(vendaForm.desconto || '').replace(',', '.')) || 0;
              const totalV = Math.max(0, brutoV - descV);
              const combos = COMBOS_SERVICO[grupoCombo(vendaForm.categoria)] || [];
              const lblSec = { fontSize:10.5, fontWeight:800, letterSpacing:.6, color:'var(--muted)', textTransform:'uppercase', margin:'4px 0 2px' };
              return (
            <div style={{ display:'flex', flexDirection:'column', gap:11 }}>
              <div style={lblSec}>O que foi vendido</div>
              <div className="field" style={{ margin:0 }}><label>Categoria *</label>
                <select value={vendaForm.categoria} onChange={e=>setVendaForm(p=>({...p,categoria:e.target.value, servico:''}))} style={{ width:'100%' }}>
                  <option value="">Escolha…</option>
                  {['Vacinação Geral','Plano Vacinal','Fidelidade Mensal','Consulta','Terapia'].map(c=><option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="field" style={{ margin:0 }}><label>Serviço / combo</label>
                <input list="vh-combos-servico" value={vendaForm.servico} onChange={e=>setVendaForm(p=>({...p,servico:e.target.value}))} placeholder="Escolha um combo ou digite…" />
                <datalist id="vh-combos-servico">{combos.map(c=><option key={c} value={c} />)}</datalist>
                {combos.length>0 && (
                  <div style={{ display:'flex', flexWrap:'wrap', gap:5, marginTop:7 }}>
                    {combos.slice(0,8).map(c=>(
                      <button key={c} type="button" onClick={()=>setVendaForm(p=>({...p,servico:c}))}
                        style={{ fontSize:10.5, fontWeight:700, padding:'4px 9px', borderRadius:20, cursor:'pointer',
                          border:`1px solid ${vendaForm.servico===c?'#16a34a':'var(--border)'}`,
                          background: vendaForm.servico===c?'#dcfce7':'var(--bg2)', color: vendaForm.servico===c?'#15803d':'var(--txt2)' }}>{c}</button>
                    ))}
                  </div>
                )}
              </div>

              <div style={lblSec}>Valores</div>
              <div style={{ display:'flex', gap:10 }}>
                <div className="field" style={{ flex:1, margin:0 }}><label>Valor (R$) *</label><input type="number" min="0" step="0.01" value={vendaForm.valor} onChange={e=>setVendaForm(p=>({...p,valor:e.target.value}))} placeholder="0,00" /></div>
                <div className="field" style={{ flex:1, margin:0 }}><label>Desconto (R$)</label><input type="number" min="0" step="0.01" value={vendaForm.desconto} onChange={e=>setVendaForm(p=>({...p,desconto:e.target.value}))} placeholder="0,00" /></div>
              </div>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 14px', borderRadius:11, background:'#ecfdf3', border:'1px solid #bbf7d0' }}>
                <span style={{ fontSize:12.5, fontWeight:700, color:'#166534' }}>Total a receber{descV>0?` (− ${fmt.brl(descV)})`:''}</span>
                <span style={{ fontSize:18, fontWeight:800, color:'#16a34a' }}>{fmt.brl(totalV)}</span>
              </div>
              <div style={{ display:'flex', gap:10 }}>
                <div className="field" style={{ flex:1, margin:0 }}><label>Forma de pagamento</label>
                  <select value={vendaForm.forma_pagamento} onChange={e=>setVendaForm(p=>({...p,forma_pagamento:e.target.value}))} style={{ width:'100%' }}>
                    <option value="">—</option>
                    {['Pix','Cartão','Dinheiro','Link de pagamento','Parcelado','Cortesia'].map(f=><option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
                <div className="field" style={{ flex:1, margin:0 }}><label>Status</label>
                  <select value={vendaForm.status_pagamento} onChange={e=>setVendaForm(p=>({...p,status_pagamento:e.target.value}))} style={{ width:'100%' }}>
                    <option value="pago">Pago</option>
                    <option value="sinal">Sinal pago</option>
                    <option value="aguardando">Aguardando</option>
                    <option value="parcelado">Parcelado</option>
                    <option value="cortesia">Cortesia</option>
                    <option value="pendente">Pendente</option>
                  </select>
                </div>
              </div>
              <div className="field" style={{ margin:0 }}><label>Observação (opcional)</label><textarea value={vendaForm.observacao} onChange={e=>setVendaForm(p=>({...p,observacao:e.target.value}))} rows={2} placeholder="Anotações da venda…" style={{ resize:'vertical' }} /></div>
              {/* 📞 Ligação: a equipe marca se falou por voz antes de fechar */}
              <label onClick={()=>setVendaForm(p=>({...p,ligou:!p.ligou}))}
                style={{ display:'flex', alignItems:'center', gap:9, padding:'9px 12px', borderRadius:10, cursor:'pointer', marginTop:8,
                  background: vendaForm.ligou ? '#ecfdf5' : 'var(--bg2)', border:`1.5px solid ${vendaForm.ligou ? '#6ee7b7' : 'var(--border)'}` }}>
                <span style={{ width:19, height:19, borderRadius:6, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center',
                  border:`2px solid ${vendaForm.ligou ? '#16a34a' : 'var(--border)'}`, background: vendaForm.ligou ? '#16a34a' : 'transparent', color:'#fff', fontSize:12, fontWeight:900 }}>
                  {vendaForm.ligou ? '✓' : ''}
                </span>
                <span style={{ fontSize:12.5, fontWeight:700, color: vendaForm.ligou ? '#15803d' : 'var(--txt2)' }}>
                  📞 Liguei para a cliente antes de fechar
                </span>
              </label>
              {vendaErro && <div style={{ fontSize:12.5, color:'#fff', background:'#dc2626', borderRadius:8, padding:'8px 11px', fontWeight:600 }}>{vendaErro}</div>}
              <div style={{ display:'flex', gap:8, marginTop:4 }}>
                <button onClick={salvarVenda} disabled={vendaSaving} className="btn btn-p" style={{ flex:1, background:'#16a34a' }}>{vendaSaving ? <span className="spin" style={{width:14,height:14}}/> : '💰 Registrar venda'}</button>
                <button onClick={()=>setVendaOpen(false)} className="btn">Cancelar</button>
              </div>
            </div>
              );
            })()}
          </div>
        </div>
      )}

      {agendarOpen && sel && (
        <div onClick={()=>setAgendarOpen(false)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, padding:16 }}>
          <div onClick={e=>e.stopPropagation()} className="card" style={{ width:380, maxWidth:'100%', padding:22 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
              <CalendarDays size={18} color="var(--tq)"/>
              <h3 style={{ fontSize:16, fontWeight:800 }}>Agendar atendimento</h3>
            </div>
            <p style={{ fontSize:12, color:'var(--muted)', marginBottom:16 }}>Cliente: <b>{sel.contact_name || fmt.phone(sel.phone)}</b> · conta na meta do mês 🎯</p>
            <div style={{ display:'flex', flexDirection:'column', gap:11 }}>
              <div style={{ display:'flex', gap:10 }}>
                <div className="field" style={{ flex:1, margin:0 }}><label>Data</label><input type="date" value={agForm.data} onChange={e=>setAgForm(p=>({...p,data:e.target.value}))} /></div>
                <div className="field" style={{ flex:1, margin:0 }}><label>Hora</label><input type="time" value={agForm.hora} onChange={e=>setAgForm(p=>({...p,hora:e.target.value}))} /></div>
              </div>
              <div className="field" style={{ margin:0 }}>
                <label>Setor (abate da meta deste setor)</label>
                <select value={agForm.setor} onChange={e=>setAgForm(p=>({...p,setor:e.target.value}))} style={{ width:'100%' }}>
                  <option value="vacinas">💉 Vacinas</option>
                  <option value="consultas">🩺 Consultas</option>
                  <option value="terapias">🧩 Terapias</option>
                </select>
              </div>
              {profsAgenda.filter(p=>p.setor===agForm.setor).length > 0 && (
                <div className="field" style={{ margin:0 }}>
                  <label>Profissional</label>
                  <select value={agForm.profissional} onChange={e=>setAgForm(p=>({...p,profissional:e.target.value}))} style={{ width:'100%' }}>
                    <option value="">— escolher —</option>
                    {profsAgenda.filter(p=>p.setor===agForm.setor).map(p=>(
                      <option key={p.id} value={p.nome}>{p.nome}{p.especialidade?` · ${p.especialidade}`:''}</option>
                    ))}
                  </select>
                  {agForm.profissional && (() => { const p = profsAgenda.find(x=>x.nome===agForm.profissional); return p ? <span style={{ fontSize:11, color:'var(--muted)' }}>🕒 {dispProf(p)}</span> : null; })()}
                </div>
              )}
              <div className="field" style={{ margin:0 }}><label>Serviço (opcional)</label><input value={agForm.servico} onChange={e=>setAgForm(p=>({...p,servico:e.target.value}))} placeholder="Ex: Avaliação inicial, Vacina..." /></div>
              <div style={{ display:'flex', gap:10 }}>
                <div className="field" style={{ flex:1, margin:0 }}><label>Valor (opcional)</label><input type="number" value={agForm.valor} onChange={e=>setAgForm(p=>({...p,valor:e.target.value}))} placeholder="R$" /></div>
                <div className="field" style={{ flex:1, margin:0 }}>
                  <label>Forma de pagamento</label>
                  <select value={agForm.forma_pagamento} onChange={e=>setAgForm(p=>({...p,forma_pagamento:e.target.value}))} style={{ width:'100%' }}>
                    <option value="">—</option>
                    <option value="À vista">À vista</option>
                    <option value="Pix">Pix</option>
                    <option value="Débito">Débito</option>
                    <option value="Crédito">Crédito</option>
                  </select>
                </div>
              </div>
              <div className="field" style={{ margin:0 }}><label>Endereço (opcional)</label><input value={agForm.endereco} onChange={e=>setAgForm(p=>({...p,endereco:e.target.value}))} placeholder="Ex: Av. Colares Moreira, 3 — sala 36" /></div>
              <div className="field" style={{ margin:0 }}><label>Link do endereço (Google Maps)</label><input value={agForm.local_link} onChange={e=>setAgForm(p=>({...p,local_link:e.target.value}))} placeholder="https://maps.google.com/..." /></div>
              <div className="field" style={{ margin:0 }}><label>Observações (opcional)</label><textarea value={agForm.observacoes} onChange={e=>setAgForm(p=>({...p,observacoes:e.target.value}))} rows={2} style={{ resize:'vertical' }} /></div>
              <div style={{ display:'flex', gap:8, marginTop:4 }}>
                <button onClick={salvarAgendamento} disabled={agSaving} className="btn btn-p" style={{ flex:1 }}>{agSaving ? <span className="spin" style={{width:14,height:14}}/> : '✅ Agendar'}</button>
                <button onClick={()=>setAgendarOpen(false)} className="btn">Cancelar</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


/* ── Picker da Biblioteca: envia foto/vídeo/figurinha na conversa ──────────── */
function BibliotecaPicker({ convId, setor, api, onClose, abaInicial = 'foto' }) {
  const [aba, setAba] = React.useState(abaInicial);
  /* Filtro de setor no próprio picker — pedido do master: a equipe escolhe a
     coluna (vacinas ou consultas) e manda. Começa no setor da conversa, que é
     quase sempre o certo. */
  const [filtroSetor, setFiltroSetor] = React.useState(setor || '');
  const SETORES_PICK = [['', 'Todos'], ['vacinas', '💉 Vacinas'], ['consultas', '🩺 Consultas'], ['terapias', '🧩 Terapias'], ['geral', '⭐ Geral']];
  const [itens, setItens] = React.useState([]);
  const [previews, setPreviews] = React.useState({});
  const [enviando, setEnviando] = React.useState(null);
  const ABAS = [['foto','📷 Fotos'],['video','🎥 Vídeos'],['depoimento','⭐ Depoimentos'],['apresentacao','📋 Apresentações'],['figurinha','💟 Figurinhas']];

  React.useEffect(() => {
    const q = new URLSearchParams({ tipo: aba });
    if (filtroSetor) q.set('setor', filtroSetor);
    api.get(`/extras/biblioteca?${q}`).then(d => {
      // A rota passou a paginar: { itens, tem_mais } (aceita o formato antigo)
      const lista = Array.isArray(d) ? d : (d?.itens || []);
      // prioriza o setor da conversa, depois geral, depois o resto
      lista.sort((a, b) => (a.setor === setor ? 0 : a.setor === 'geral' ? 1 : 2) - (b.setor === setor ? 0 : b.setor === 'geral' ? 1 : 2));
      setItens(lista);
    }).catch(() => {});
  }, [aba, filtroSetor]); // eslint-disable-line

  React.useEffect(() => {
    (async () => {
      for (const it of itens.slice(0, 18)) {
        if (previews[it.id] || it.tipo === 'video') continue;
        try {
          const m = await api.get(`/extras/biblioteca/${it.id}`);
          setPreviews(p => ({ ...p, [it.id]: `data:${m.mime};base64,${m.data}` }));
        } catch {}
      }
    })();
  }, [itens]); // eslint-disable-line

  const enviar = async (it) => {
    if (enviando) return;
    setEnviando(it.id);
    try {
      await api.post(`/inbox/conversations/${convId}/send-midia`, { midiaId: it.id });
      onClose();
    } catch (e) { Toast.show(e.message, 'error'); }
    finally { setEnviando(null); }
  };

  return (
    <div onClick={e => e.target === e.currentTarget && onClose()}
      style={{ position:'fixed', inset:0, background:'rgba(3,43,48,.55)', zIndex:520, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div style={{ width:'100%', maxWidth:640, maxHeight:'80vh', background:'var(--card)', borderRadius:16, boxShadow:'var(--s4)', display:'flex', flexDirection:'column', overflow:'hidden' }}>
        <div style={{ padding:'13px 18px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:10 }}>
          <span style={{ fontSize:17 }}>🖼️</span>
          <div style={{ flex:1 }}>
            <div style={{ fontWeight:800, fontSize:14 }}>Biblioteca de Experiências</div>
            <div style={{ fontSize:11, color:'var(--muted)' }}>Clique pra enviar direto na conversa{setor ? ` · setor ${setor}` : ''}</div>
          </div>
          <button onClick={onClose} style={{ width:28, height:28, borderRadius:8, border:'1px solid var(--border)', background:'var(--bg2)', color:'var(--muted)', cursor:'pointer' }}><X size={14}/></button>
        </div>
        <div style={{ display:'flex', gap:5, padding:'10px 18px 0', flexWrap:'wrap' }}>
          {ABAS.map(([k, l]) => (
            <button key={k} onClick={() => setAba(k)}
              style={{ padding:'5px 12px', borderRadius:9, fontSize:11.5, fontWeight:700, cursor:'pointer',
                border:`1.5px solid ${aba===k?'var(--tq)':'var(--border)'}`,
                background: aba===k?'var(--tq)':'var(--card)', color: aba===k?'#fff':'var(--muted)' }}>{l}</button>
          ))}
        </div>
        {/* Coluna do setor: vacinas de um lado, consultas do outro */}
        <div style={{ display:'flex', gap:5, padding:'8px 18px 0', flexWrap:'wrap' }}>
          {SETORES_PICK.map(([k, l]) => (
            <button key={k || 'todos'} onClick={() => setFiltroSetor(k)}
              style={{ padding:'4px 11px', borderRadius:999, fontSize:11, fontWeight:700, cursor:'pointer',
                border:`1.5px solid ${filtroSetor===k?'#7c5cbf':'var(--border)'}`,
                background: filtroSetor===k?'#7c5cbf':'var(--card)', color: filtroSetor===k?'#fff':'var(--muted)' }}>{l}</button>
          ))}
        </div>
        <div style={{ flex:1, overflowY:'auto', padding:'14px 18px', display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(135px,1fr))', gap:10 }}>
          {itens.length === 0 && <div style={{ gridColumn:'1 / -1', textAlign:'center', padding:'26px 0', fontSize:12.5, color:'var(--muted)' }}>Nada nesta categoria ainda — alimente na página 🖼️ Biblioteca.</div>}
          {itens.map(it => (
            <button key={it.id} onClick={() => enviar(it)} disabled={!!enviando}
              style={{ borderRadius:12, overflow:'hidden', border:'1.5px solid var(--border)', background:'var(--card)', cursor:'pointer', padding:0, opacity: enviando && enviando!==it.id ? .5 : 1 }}>
              <div style={{ height:88, background:'var(--bg2)', display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden' }}>
                {enviando === it.id ? <Loader2 size={18} className="spin" color="var(--tq)"/>
                  : it.tipo === 'video' ? <span style={{ fontSize:24 }}>🎥</span>
                  : previews[it.id] ? <img src={previews[it.id]} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }}/>
                  : <span style={{ fontSize:22 }}>🖼️</span>}
              </div>
              <div style={{ padding:'6px 8px', fontSize:10.5, fontWeight:700, color:'var(--txt2)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', textAlign:'left' }}>{it.titulo}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}


/* ── Faixa de contexto sob o header (Interesse · Responsável · Etapa · Score) ── */
function FaixaContexto({ sel, leadInfo, setLeadInfo, api, scoreChip, setScoreChip, usersById, metaSetor, changeResp, setSel, setConvos, onTransferir }) {
  React.useEffect(() => {
    setLeadInfo(null); setScoreChip(null);
    if (!sel?.lead_id) return;
    api.get(`/leads/${sel.lead_id}`).then(setLeadInfo).catch(() => {});
  }, [sel?.id]); // eslint-disable-line

  const calcularScore = async () => {
    if (scoreChip === 'calc') return;
    setScoreChip('calc');
    try {
      const d = await api.post('/inbox/ai-assist', { convId: sel.id, mode: 'score' });
      const n = parseInt(d?.score ?? d?.nota ?? d?.pontuacao);
      setScoreChip(Number.isFinite(n) ? Math.min(Math.max(n, 0), 100) : null);
    } catch { setScoreChip(null); }
  };

  const resp = sel?.responsavel_id ? usersById?.[sel.responsavel_id]?.nome?.split(' ')[0] : null;

  /* Classificação editável NA FAIXA (pedido do master). Antes era só leitura e
     pra trocar qualquer coisa era preciso abrir o lead noutra tela — o que
     ninguém fazia no meio do atendimento, e a base ficava desclassificada. */
  const [etapas, setEtapas] = React.useState([]);
  const [editando, setEditando] = React.useState(null);   // campo aberto
  const [rascunho, setRascunho] = React.useState('');
  React.useEffect(() => {
    api.get('/leads/colunas').then(c => setEtapas((Array.isArray(c) ? c : []).map(x => x.nome).filter(Boolean))).catch(() => {});
  }, []); // eslint-disable-line

  // Grava no lead e atualiza a faixa na hora (sem esperar recarregar a conversa)
  const salvarLead = async (campo, valor) => {
    setEditando(null);
    if (!sel?.lead_id) { Toast.show('Esta conversa ainda não virou lead — classifique depois de qualificar.', 'info'); return; }
    setLeadInfo(p => ({ ...(p || {}), [campo]: valor }));
    try { await api.put(`/leads/${sel.lead_id}`, { [campo]: valor }); }
    catch (e) { Toast.show(e.message, 'error'); api.get(`/leads/${sel.lead_id}`).then(setLeadInfo).catch(() => {}); }
  };

  /* 🎨 Faixa de contexto em tom neutro (ordem do master, 24/08): os rótulos
     eram turquesa forte em cinco caixas seguidas e competiam com a conversa.
     Agora informam sem gritar; cor forte só na meta. */
  const caixa = { display:'flex', alignItems:'center', gap:8, padding:'0 14px', borderRight:'1px solid var(--border)' };
  const rotulo = { fontSize:9.5, fontWeight:800, color:'var(--muted)', textTransform:'uppercase', letterSpacing:.4 };
  const valorSt = { fontSize:12, fontWeight:700, color:'var(--txt)', maxWidth:140, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' };
  const campoSt = { fontSize:12, fontWeight:700, padding:'2px 6px', borderRadius:7, border:'1.5px solid var(--tq)', background:'var(--card)', color:'var(--txt)', maxWidth:150 };

  /* 🎴 PAINEL DE CONTEXTO (ordem do master, 27/08: "melhora esse painel, deixa
     mais bonito e organizado"). Seis cartões, na ordem que a atendente lê:
     o que a família quer, quem é o cliente, quem é o paciente, de que setor é,
     quem atende e o código. Editar é clicar no cartão. Etapa e memória viram
     selos discretos no fim, pra não competir com o que importa. */
  const Cartao = ({ ic, label, valor, editavel, aberto, onAbrir, children, aoClicar, dica }) => (
    <div onClick={aoClicar || (editavel && !aberto ? onAbrir : undefined)}
      title={dica || (editavel ? `Clique para alterar ${label.toLowerCase()}` : label)}
      style={{ display:'flex', alignItems:'center', gap:9, padding:'7px 12px', borderRadius:12,
        background:'var(--card)', border:`1px solid ${aberto ? 'var(--tq)' : 'var(--border)'}`,
        boxShadow:'var(--s1)', flexShrink:0, minWidth:132,
        cursor:(editavel || aoClicar) ? 'pointer' : 'default', transition:'border-color .15s' }}>
      <span style={{ width:28, height:28, borderRadius:9, background:'var(--tq4)', display:'flex',
        alignItems:'center', justifyContent:'center', fontSize:14, flexShrink:0 }}>{ic}</span>
      <div style={{ minWidth:0 }}>
        <div style={rotulo}>{label}{editavel && <span style={{ opacity:.5 }}> ✎</span>}</div>
        {children || <div style={valorSt}>{valor || '—'}</div>}
      </div>
    </div>
  );

  const abrir = (campo, valorAtual) => { setRascunho(valorAtual || ''); setEditando(campo); };
  const [ligarAberto, setLigarAberto] = React.useState(false);
  const telLimpo = String(sel?.phone || '').replace(/\D/g, '');
  const tel55 = telLimpo.startsWith('55') ? telLimpo : `55${telLimpo}`;
  /* Registra a tentativa: o master quer medir quem liga, e a conversa fica com
     a marca de que houve chamada (o WhatsApp não avisa a gente disso). */
  const marcarLigacao = (via) => {
    api.post('/extras/ligacoes', {
      contato_nome: sel?.contact_name || 'Cliente', telefone: telLimpo,
      direcao: 'realizada', status: 'Retornar',
      observacoes: `Chamada iniciada pelo VittaHub (${via})`,
    }).catch(() => {});
    window.__auditLog?.('ligar', 'conversa', sel?.id, { nome: sel?.contact_name, via });
  };
  const codigoTxt = sel?.codigo ? `VT-${String(sel.codigo).padStart(4, '0')}` : null;

  return (
    <div style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 12px', background:'var(--bg)',
      borderBottom:'1px solid var(--border)', overflowX:'auto', flexShrink:0 }}>

      {/* 1 · Interesse — o que a família procura */}
      <Cartao ic="💉" label="Interesse" editavel aberto={editando === 'interesse'}
        onAbrir={() => abrir('interesse', leadInfo?.interesse || sel?.setor)}
        valor={leadInfo?.interesse || sel?.setor}>
        {editando === 'interesse' && (
          <select autoFocus value={leadInfo?.interesse || ''} style={campoSt}
            onChange={e => salvarLead('interesse', e.target.value)} onBlur={() => setEditando(null)}>
            <option value="">—</option>
            {INTERESSES_FAIXA.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        )}
      </Cartao>

      {/* 🔁 Transferir logo depois do Interesse (ordem do master, 27/08): passar
          o atendimento adiante é decisão que se toma olhando pro interesse. */}
      {/* Lead ainda sem dona é DISTRIBUIÇÃO, não transferência — o nome muda
          pra deixar claro o que se está fazendo (ordem do master, 28/08). */}
      <Cartao ic={sel?.responsavel_id ? '🔁' : '📤'}
        label={sel?.responsavel_id ? 'Transferir' : 'Distribuir'}
        valor={sel?.responsavel_id ? 'Passar adiante' : 'Escolher quem atende'}
        dica={sel?.responsavel_id ? 'Passar este atendimento para outra pessoa' : 'Entregar este lead para alguém da equipe'}
        aoClicar={() => onTransferir?.()} />

      {/* 📞 LIGAR PRO CLIENTE (ordem do master, 28/08: "quero que elas consigam
          ligar para os clientes via WhatsApp"). Abre a conversa no WhatsApp do
          aparelho, onde o botão de chamada fica a um toque; e oferece a ligação
          normal pelo telefone. A chamada em si o navegador NÃO consegue fazer:
          o WhatsApp não abre linha por link, nem pela API. */}
      {sel?.phone && (
        <Cartao ic="📞" label="Ligar" valor="Chamar cliente"
          dica="Abrir no WhatsApp para chamar, ou ligar pelo telefone"
          aoClicar={() => setLigarAberto(true)} />
      )}

      {/* 2 · Cliente — quem fala com a gente (o nome do contato) */}
      <Cartao ic="🧑" label="Cliente" editavel aberto={editando === 'cliente'}
        onAbrir={() => abrir('cliente', sel?.contact_name)} valor={sel?.contact_name}>
        {editando === 'cliente' && (
          <input autoFocus value={rascunho} style={campoSt}
            onChange={e => setRascunho(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setEditando(null); }}
            onBlur={async () => {
              const novo = rascunho.trim(); setEditando(null);
              if (!novo || novo === sel?.contact_name) return;
              try {
                await api.patch(`/inbox/conversations/${sel.id}/contato`, { nome: novo });
                setSel(p => ({ ...p, contact_name: novo }));
                setConvos(p => p.map(c => c.id === sel.id ? { ...c, contact_name: novo } : c));
              } catch (err) { Toast.show(err.message, 'error'); }
            }} />
        )}
      </Cartao>

      {/* 3 · Paciente — a criança que vai ser atendida */}
      <Cartao ic="👶" label="Paciente" editavel aberto={editando === 'nome'}
        onAbrir={() => abrir('nome', leadInfo?.nome || sel?.memoria?.paciente)}
        valor={leadInfo?.nome || sel?.memoria?.paciente}>
        {editando === 'nome' && (
          <input autoFocus value={rascunho} style={campoSt}
            onChange={e => setRascunho(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') salvarLead('nome', rascunho.trim()); if (e.key === 'Escape') setEditando(null); }}
            onBlur={() => salvarLead('nome', rascunho.trim())} />
        )}
      </Cartao>

      {/* 🧹 SETOR SAIU DO PAINEL (ordem do master, 27/08): o setor já vem da
          classificação da conversa e da carteira de quem atende — repetir aqui
          só ocupava espaço. A troca continua possível pela classificação. */}
      {/* 5 · Responsável pelo atendimento — quem responde a família */}
      <Cartao ic="👤" label="Responsável" editavel aberto={editando === 'resp'}
        onAbrir={() => setEditando('resp')} valor={resp || 'Sem responsável'}>
        {editando === 'resp' && (
          <select autoFocus value={sel?.responsavel_id || ''} style={campoSt}
            onChange={e => { changeResp(e.target.value || null); setEditando(null); }} onBlur={() => setEditando(null)}>
            <option value="">Sem responsável</option>
            {Object.values(usersById || {}).filter(u => u?.ativo !== false)
              .map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
          </select>
        )}
      </Cartao>

      {/* 6 · Situação do atendimento — veio da barra de cima (ordem do master) */}
      <Cartao ic="🟢" label="Situação" editavel aberto={editando === 'situacao'}
        onAbrir={() => setEditando('situacao')}
        valor={{ aberto:'Aberto', em_atendimento:'Em atendimento', resolvido:'Resolvido' }[sel?.status_atend || 'aberto']}>
        {editando === 'situacao' && (
          <select autoFocus value={sel?.status_atend || 'aberto'} style={campoSt} onBlur={() => setEditando(null)}
            onChange={async e => {
              const novo = e.target.value; setEditando(null);
              try {
                await api.patch(`/inbox/conversations/${sel.id}/status`, { status: novo });
                setSel(p => ({ ...p, status_atend: novo }));
                setConvos(p => p.map(c => c.id === sel.id ? { ...c, status_atend: novo } : c));
              } catch (err) { Toast.show(err.message, 'error'); }
            }}>
            <option value="aberto">🟢 Aberto</option>
            <option value="em_atendimento">🔵 Em atendimento</option>
            <option value="resolvido">⚫ Resolvido</option>
          </select>
        )}
      </Cartao>

      {/* 7 · Código do cliente — clique copia, é assim que a casa se acha */}
      <Cartao ic="🆔" label="Código do cliente" valor={codigoTxt || '—'}
        dica={codigoTxt ? 'Clique para copiar o código' : 'O código nasce quando a conversa é classificada'}
        aoClicar={codigoTxt ? () => {
          try { navigator.clipboard.writeText(codigoTxt); Toast.show('Código copiado! 🆔', 'success'); }
          catch { /* webview sem área de transferência */ }
        } : undefined} />

      {/* 📞 Como ligar: as duas formas que existem de verdade */}
      {ligarAberto && (
        <div onClick={() => setLigarAberto(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 1200,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()} className="card"
            style={{ width: '100%', maxWidth: 360, padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--txt)' }}>📞 Ligar para {sel?.contact_name || 'o cliente'}</div>
              <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 3 }}>{fmt.phone(sel?.phone)}</div>
            </div>
            <div style={{ padding: '10px 12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {/* 📲 ABRE O APLICATIVO DIRETO, não o navegador (ordem do master,
                  28/08: "quero que de alguma forma seja via WhatsApp"). O
                  esquema whatsapp:// pula a página do wa.me e cai na conversa
                  dentro do app — de lá é UM toque no ícone de chamada. Se o app
                  não estiver instalado, o link de baixo resolve. */}
              <a href={`whatsapp://send?phone=${tel55}`}
                onClick={() => { marcarLigacao('WhatsApp'); setTimeout(() => setLigarAberto(false), 400); }}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 14px', borderRadius: 11,
                  textDecoration: 'none', background: '#25D366', color: '#fff', fontWeight: 800, fontSize: 13.5,
                  boxShadow: '0 4px 14px rgba(37,211,102,.35)' }}>
                📞 Chamar no WhatsApp
                <span style={{ marginLeft: 'auto', fontSize: 10.5, fontWeight: 700, opacity: .95 }}>abre o app no contato</span>
              </a>
              <a href={`https://wa.me/${tel55}`} target="_blank" rel="noreferrer"
                onClick={() => { marcarLigacao('WhatsApp Web'); setLigarAberto(false); }}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 13px', borderRadius: 11,
                  textDecoration: 'none', background: 'var(--wa2,#e8fdf0)', color: '#128C7E', fontWeight: 800, fontSize: 12.5,
                  border: '1px solid #25D366' }}>
                💬 Abrir pelo WhatsApp Web
                <span style={{ marginLeft: 'auto', fontSize: 10.5, fontWeight: 700, opacity: .8 }}>se o app não abrir</span>
              </a>
              <a href={`tel:${telLimpo}`}
                onClick={() => { marcarLigacao('telefone'); setLigarAberto(false); }}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 13px', borderRadius: 11,
                  textDecoration: 'none', background: 'var(--bg2)', color: 'var(--txt)', fontWeight: 800, fontSize: 13,
                  border: '1px solid var(--border)' }}>
                📞 Ligar pelo telefone
                <span style={{ marginLeft: 'auto', fontSize: 10.5, fontWeight: 700, color: 'var(--muted)' }}>chamada normal</span>
              </a>
              <div style={{ fontSize: 10.5, color: 'var(--light)', lineHeight: 1.5, marginTop: 2 }}>
                O primeiro botão abre o WhatsApp já na conversa do cliente: a chamada é um toque no 📞 lá em cima.
                A voz do WhatsApp só roda dentro do aplicativo — é assim para qualquer sistema. A tentativa fica registrada em Ligações.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Selos discretos: etapa do funil e o que a IA lembrou */}
      {leadInfo?.status && (
        <span style={{ flexShrink:0, fontSize:10.5, fontWeight:800, padding:'4px 10px', borderRadius:99,
          background:'var(--bg2)', color:'var(--muted)' }} title="Etapa no funil">📋 {leadInfo.status}</span>
      )}
      {(() => {
        const linhas = memoriaLinhas(sel?.memoria);
        if (!linhas.length) return null;
        return (
          <span title={linhas.join('\n')} style={{ flexShrink:0, fontSize:10.5, fontWeight:800, padding:'4px 10px',
            borderRadius:99, background:'var(--tq3)', color:'var(--tq2)', cursor:'help' }}>
            🧠 {linhas.length} fato{linhas.length === 1 ? '' : 's'}
          </span>
        );
      })()}

      {/* Faixa de meta escondida por enquanto (a pedido) — trocar 'false' por 'true' pra reativar */}
      {false && metaSetor && metaSetor.metaGlobal > 0 && (() => {
        // Multi-setor: mostra a meta do setor DESTA conversa (ex.: atendendo consulta → meta consultas)
        const m = (metaSetor.porSetor || []).find(p => p.setor === sel?.setor) || metaSetor;
        const batida = (m.faltaGlobal ?? 0) <= 0;
        const pct = Math.min(m.pctGlobal ?? 0, 100);
        const nomeSetor = m.setor && m.setor !== 'geral'
          ? m.setor.charAt(0).toUpperCase() + m.setor.slice(1)
          : 'Geral';
        const Bloco = ({ rotulo, valor, cor, tam = 12, principal = false }) => (
          <div style={{ display:'flex', flexDirection:'column', lineHeight:1.1 }}>
            <span style={{ fontSize:8.5, fontWeight:800, color: principal ? '#d4af37' : 'rgba(255,255,255,.5)', textTransform:'uppercase', letterSpacing:.6 }}>{rotulo}</span>
            <span style={{ fontSize:tam, fontWeight:900, color:cor, textShadow: principal ? '0 1px 6px rgba(212,175,55,.45)' : 'none' }}>{valor}</span>
          </div>
        );
        return (
          <div style={{ display:'flex', alignItems:'center', gap:14, padding:'5px 18px', marginLeft:4, borderRadius:14, position:'relative', overflow:'hidden',
            background: batida
              ? 'linear-gradient(135deg,#052e16 0%,#065f46 55%,#0f766e 100%)'
              : 'linear-gradient(135deg,#0b1023 0%,#1b1740 55%,#2a1a52 100%)',
            border:'1px solid rgba(212,175,55,.35)',
            boxShadow:'0 6px 20px rgba(10,8,30,.45), inset 0 1px 0 rgba(255,255,255,.06)' }}>
            <span style={{ position:'absolute', inset:0, background:'radial-gradient(120% 120% at 0% 0%, rgba(212,175,55,.14), transparent 55%)', pointerEvents:'none' }} />
            <div style={{ display:'flex', alignItems:'center', gap:7, position:'relative' }}>
              <span style={{ fontSize:19, filter:'drop-shadow(0 1px 2px rgba(0,0,0,.4))' }}>{batida ? '🏆' : '🎯'}</span>
              <span style={{ fontSize:9, fontWeight:900, color:'#e9d8a6', textTransform:'uppercase', letterSpacing:.8 }}>Meta<br/>{nomeSetor}</span>
            </div>
            <Bloco rotulo="Meta" valor={fmt.brl(m.metaGlobal)} cor="#fde68a" tam={17} principal />
            <Bloco rotulo="Alcançado" valor={`${fmt.brl(m.confirmado || 0)}`} cor="rgba(126,231,199,.9)" tam={11.5} />
            <Bloco rotulo={batida ? 'Status' : 'Falta'} valor={batida ? '✅ Batida' : fmt.brl(m.faltaGlobal)} cor={batida ? 'rgba(126,231,199,.9)' : 'rgba(252,165,165,.9)'} tam={11.5} />
            <div style={{ position:'relative', minWidth:120 }}>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:3 }}>
                <span style={{ fontSize:10, fontWeight:900, color:'#fbbf24' }}>{pct}%</span>
                <span style={{ fontSize:9, fontWeight:800, color:'rgba(255,255,255,.8)' }}>{batida ? 'Bora além! 🔥' : 'Fecha essa! 🔥'}</span>
              </div>
              <div style={{ width:'100%', height:6, borderRadius:5, background:'rgba(255,255,255,.14)', overflow:'hidden' }}>
                <div style={{ width:`${pct}%`, height:'100%', borderRadius:5, background: batida ? 'linear-gradient(90deg,#34d399,#a7f3d0)' : 'linear-gradient(90deg,#d4af37,#fbbf24,#fde68a)', boxShadow:'0 0 8px rgba(251,191,36,.5)', transition:'width .4s ease' }} />
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

/* ── Modal Agendar dentro da conversa (mock): cria evento + funil + confirmação ── */
/* ── Agendar MENSAGEM: dispara um texto pro cliente numa data/hora futura ── */
function AgendarMsgModal({ sel, api, textoInicial, onClose }) {
  const [texto, setTexto] = React.useState(textoInicial || '');
  const [quando, setQuando] = React.useState('');
  const [lista, setLista] = React.useState([]);
  const [erro, setErro] = React.useState('');
  const [salvando, setSalvando] = React.useState(false);
  // 📎 Anexo (pedido do master): documento ou imagem que sai junto na hora marcada
  const [anexo, setAnexo] = React.useState(null); // { data, nome }
  const fileRef = React.useRef(null);
  const escolherArquivo = (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (f.size > 6 * 1024 * 1024) { setErro('Arquivo muito grande — máximo 6MB.'); return; }
    const r = new FileReader();
    r.onload = () => { setAnexo({ data: r.result, nome: f.name }); setErro(''); };
    r.readAsDataURL(f);
  };

  const load = () => api.get(`/inbox/conversations/${sel.id}/agendadas`).then(d => setLista(Array.isArray(d) ? d : [])).catch(() => {});
  React.useEffect(() => { load(); }, []); // eslint-disable-line

  const fmtQuando = (s) => { try { return new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch { return s; } };

  const agendar = async () => {
    if (!texto.trim() && !anexo) { setErro('Escreva a mensagem ou anexe um arquivo.'); return; }
    if (!quando) { setErro('Escolha a data e a hora.'); return; }
    // A hora escolhida é a daqui; se já passou, o envio nunca aconteceria
    if (new Date(quando).getTime() < Date.now() - 60000) { setErro('Essa data e hora já passaram — escolha um horário à frente.'); return; }
    setSalvando(true); setErro('');
    try {
      await api.post(`/inbox/conversations/${sel.id}/agendar`, {
        texto: texto.trim(), enviar_em: new Date(quando).toISOString(),
        ...(anexo ? { anexo: anexo.data, anexo_nome: anexo.nome } : {}),
      });
      setTexto(''); setQuando(''); setAnexo(null); load(); onClose?.(true);
    } catch (e) { setErro(e.message || 'Falha ao agendar.'); setSalvando(false); }
  };
  const cancelar = async (ag) => {
    setLista(p => p.filter(x => x.id !== ag.id));
    try { await api.del(`/inbox/agendadas/${ag.id}`); } catch { load(); }
  };

  const ST = { pendente: { l: 'Agendada', c: '#d97706' }, enviada: { l: 'Enviada', c: '#16a34a' }, cancelada: { l: 'Cancelada', c: 'var(--muted)' }, erro: { l: 'Falhou', c: 'var(--err)' } };

  return (
    <div onClick={() => onClose?.(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
      <div onClick={e => e.stopPropagation()} className="card" style={{ width: 460, maxWidth: '100%', maxHeight: '88vh', padding: 22, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h3 style={{ fontSize: 16, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}><Clock size={18} color="var(--tq2)" /> Agendar mensagem</h3>
          <button onClick={() => onClose?.(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={16} /></button>
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 12 }}>Para {sel?.contact_name || 'o cliente'} — será enviada automaticamente na hora marcada.</div>
        <div className="field" style={{ margin: 0, marginBottom: 10 }}><label>Mensagem</label>
          <textarea value={texto} onChange={e => setTexto(e.target.value)} rows={3} placeholder="Ex: Oi! Passando pra lembrar da sua vacina amanhã 💉" style={{ resize: 'vertical' }} /></div>
        {/* 📎 Anexo opcional: sai ANTES do texto, na mesma hora marcada */}
        <div style={{ marginBottom: 10 }}>
          <input ref={fileRef} type="file" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx" style={{ display: 'none' }} onChange={escolherArquivo} />
          {anexo ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 11px', background: 'var(--tq3)', borderRadius: 9, border: '1px solid var(--tq)' }}>
              <span style={{ fontSize: 14 }}>📎</span>
              <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 700, color: 'var(--tq2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{anexo.nome}</span>
              <button onClick={() => setAnexo(null)} title="Remover anexo" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tq2)', display: 'flex' }}><X size={14} /></button>
            </div>
          ) : (
            <button onClick={() => fileRef.current?.click()} className="btn btn-s btn-sm" style={{ width: '100%', gap: 6, fontWeight: 700 }}>
              📎 Anexar documento ou imagem (opcional)
            </button>
          )}
        </div>
        <div className="field" style={{ margin: 0, marginBottom: 10 }}><label>Quando enviar</label>
          <input type="datetime-local" value={quando} onChange={e => setQuando(e.target.value)} /></div>
        {erro && <div style={{ fontSize: 12, color: 'var(--err)', fontWeight: 600, marginBottom: 8 }}>{erro}</div>}
        <button onClick={agendar} disabled={salvando} className="btn btn-p" style={{ gap: 6 }}><Clock size={14} /> {salvando ? 'Agendando…' : 'Agendar envio'}</button>

        {lista.length > 0 && (
          <div style={{ marginTop: 16, overflow: 'auto' }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: .4, marginBottom: 8 }}>Agendadas</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {lista.map(ag => {
                const st = ST[ag.status] || ST.pendente;
                return (
                  <div key={ag.id} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 11px', background: 'var(--bg2)', borderRadius: 9 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {ag.tem_anexo && <span title={ag.anexo_nome || 'com anexo'} style={{ marginRight: 4 }}>📎</span>}
                        {ag.texto || ag.anexo_nome || 'Anexo'}
                      </div>
                      <div style={{ fontSize: 10.5, color: st.c, fontWeight: 700 }}>{st.l} · {fmtQuando(ag.enviar_em)}</div>
                    </div>
                    {ag.status === 'pendente' && <button onClick={() => cancelar(ag)} title="Cancelar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={15} /></button>}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function AgendarModal({ sel, api, onClose }) {
  const hoje = new Date().toISOString().slice(0, 10);
  const [m, setM] = React.useState({ paciente: sel?.contact_name || '', responsavel: '', email: '', endereco: '', local_link: '', servico: '', profissional: '', data: hoje, hora: '', observacoes: '', valor: '', forma_pagamento: '', confirmar: true });
  const [erro, setErro] = React.useState('');
  const [salvando, setSalvando] = React.useState(false);
  const [extraindo, setExtraindo] = React.useState(false);
  const [leadBase, setLeadBase] = React.useState(null);

  // Pré-preenche com a ficha do lead, se existir
  React.useEffect(() => {
    if (!sel?.lead_id) return;
    api.get(`/leads/${sel.lead_id}`).then(l => {
      setLeadBase(l);
      setM(prev => ({ ...prev,
        paciente: prev.paciente || l.nome || '',
        responsavel: prev.responsavel || l.responsavel_cliente || '',
        email: prev.email || l.email || '',
        endereco: prev.endereco || [l.endereco, l.bairro].filter(Boolean).join(', '),
      }));
    }).catch(() => {});
  }, []); // eslint-disable-line

  // IA lê a conversa e preenche o que o cliente já informou (só campos vazios)
  const puxarDaConversa = async () => {
    if (extraindo) return;
    setExtraindo(true); setErro('');
    try {
      const d = await api.post('/inbox/ai-extrair', { convId: sel.id });
      let achou = 0;
      setM(prev => {
        const nx = { ...prev };
        const põe = (campo, valor) => { if (valor && !String(prev[campo] || '').trim()) { nx[campo] = String(valor); achou++; } };
        põe('paciente', d.paciente); põe('responsavel', d.responsavel);
        põe('endereco', d.endereco); põe('email', d.email);
        if (d.observacao) nx.observacoes = prev.observacoes ? prev.observacoes : String(d.observacao).slice(0, 300);
        if (d.nascimento) nx._nascimento = d.nascimento;
        return nx;
      });
      Toast.show(achou ? `A IA encontrou ${achou} dado(s) na conversa ✨` : 'Não achei dados novos na conversa.', achou ? 'success' : 'error');
    } catch (e) { setErro(e.message); }
    finally { setExtraindo(false); }
  };

  const salvar = async () => {
    setErro('');
    if (!m.paciente.trim()) return setErro('Informe o paciente.');
    if (!/^\d{2}:\d{2}$/.test(m.hora || '')) return setErro('Informe a hora (HH:MM).');
    if (m.local_link && !/^https?:\/\//i.test(m.local_link.trim())) return setErro('O link da localização precisa começar com http:// ou https://');
    if (m.email && !/.+@.+\..+/.test(m.email.trim())) return setErro('E-mail inválido.');
    setSalvando(true);
    try {
      // 1) Evento na Agenda geral (com endereço, link e e-mail)
      await api.post('/extras/agenda', {
        paciente: m.paciente.trim(), responsavel_nome: m.responsavel.trim(),
        servico: m.servico, profissional: m.profissional,
        data: m.data, hora: m.hora, observacoes: m.observacoes,
        endereco: m.endereco.trim(), local_link: m.local_link.trim(), email: m.email.trim(),
        valor: m.valor, forma_pagamento: m.forma_pagamento, parcelas: m.parcelas,
        telefone: String(sel.phone || '').replace(/\D/g, ''), setor: sel.setor || 'vacinas', lead_id: sel.lead_id || null,
      });
      // 2) Funil: lead vai pra "Agendado" + ficha sincronizada
      if (sel.lead_id) {
        await api.patch(`/leads/${sel.lead_id}/status`, { status: 'Agendado' }).catch(() => {});
        const ficha = { data_retorno: m.data };
        if (m.responsavel.trim() && !leadBase?.responsavel_cliente) ficha.responsavel_cliente = m.responsavel.trim();
        if (m.endereco.trim() && !leadBase?.endereco) ficha.endereco = m.endereco.trim();
        if (m.email.trim() && !leadBase?.email) ficha.email = m.email.trim();
        if (m._nascimento && !leadBase?.nascimento) ficha.nascimento = m._nascimento;
        await api.put(`/leads/${sel.lead_id}`, ficha).catch(() => {});
      }
      // 3) Confirmação automática pro cliente — SEMPRE no cartão oficial da casa
      //    (ordem do master: a confirmação da agenda é idêntica à da IA, com
      //    endereço, Maps, especialidade e Instagram). O texto vem montado do
      //    backend, que é a fonte única do cartão.
      if (m.confirmar) {
        const { texto } = await api.post('/inbox/cartao-agendamento', {
          cliente: sel.contact_name || m.responsavel.trim(),
          paciente: m.paciente.trim(), data: m.data, hora: m.hora,
          profissional: m.profissional, servico: m.servico, endereco: m.endereco.trim(),
        }).catch(() => ({ texto: '' }));
        if (texto) await api.post(`/inbox/conversations/${sel.id}/send`, { type: 'text', content: texto }).catch(() => {});
      }
      onClose(true);
    } catch (e) { setErro(e.message); }
    finally { setSalvando(false); }
  };

  return (
    <div onClick={e => e.target === e.currentTarget && onClose(false)}
      style={{ position:'fixed', inset:0, background:'rgba(3,43,48,.55)', zIndex:520, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div style={{ width:'100%', maxWidth:480, maxHeight:'92vh', overflowY:'auto', background:'var(--card)', borderRadius:16, boxShadow:'var(--s4)', padding:'18px 22px' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
          <div style={{ fontWeight:800, fontSize:15 }}>📅 Agendar pra {sel?.contact_name?.split(' ')[0] || 'cliente'}</div>
          <button onClick={() => onClose(false)} style={{ width:28, height:28, borderRadius:8, border:'1px solid var(--border)', background:'var(--bg2)', color:'var(--muted)', cursor:'pointer' }}><X size={14}/></button>
        </div>
        <button onClick={puxarDaConversa} disabled={extraindo}
          style={{ width:'100%', marginBottom:12, padding:'8px 0', borderRadius:11, border:'1.5px dashed var(--tq)', background:'var(--tq4)', color:'var(--tq2)', fontWeight:800, fontSize:12, cursor:'pointer', opacity:extraindo?.6:1 }}>
          {extraindo ? 'Lendo a conversa…' : '✨ Puxar dados que o cliente já enviou na conversa'}
        </button>
        {erro && <div style={{ marginBottom:10, padding:'8px 12px', borderRadius:9, background:'var(--err2)', color:'var(--err)', fontSize:12, fontWeight:600 }}>{erro}</div>}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
          <div className="field"><label>Responsável (família)</label>
            <input value={m.responsavel} maxLength={80} onChange={e=>setM({...m, responsavel:e.target.value})} placeholder="Ex: Maria Silva" /></div>
          <div className="field"><label>Paciente *</label>
            <input value={m.paciente} maxLength={80} onChange={e=>setM({...m, paciente:e.target.value})} /></div>
          <div className="field" style={{ gridColumn:'1 / -1' }}><label>E-mail</label>
            <input type="email" value={m.email} maxLength={120} onChange={e=>setM({...m, email:e.target.value})} placeholder="email@exemplo.com" /></div>
          <div className="field" style={{ gridColumn:'1 / -1' }}><label>Endereço (atendimento domiciliar)</label>
            <input value={m.endereco} maxLength={160} onChange={e=>setM({...m, endereco:e.target.value})} placeholder="Rua, nº, bairro — São Luís/MA" /></div>
          <div className="field" style={{ gridColumn:'1 / -1' }}><label>Link da localização (Google Maps)</label>
            <input value={m.local_link} maxLength={300} onChange={e=>setM({...m, local_link:e.target.value})} placeholder="https://maps.app.goo.gl/…" /></div>
          <div className="field"><label>Valor (R$)</label>
            <input type="number" min="0" step="0.01" value={m.valor} onChange={e=>setM({...m, valor:e.target.value})} placeholder="0,00" /></div>
          <div className="field"><label>Pagamento</label>
            <select value={m.forma_pagamento} onChange={e=>setM({...m, forma_pagamento:e.target.value, parcelas: e.target.value==='Crédito' ? (m.parcelas||'1') : ''})}
              style={{ width:'100%', padding:'8px 10px', borderRadius:10, border:'1.5px solid var(--border)', fontSize:12.5, background:'var(--card)', color:'var(--txt)' }}>
              <option value="">—</option><option>À vista</option><option>Pix</option><option>Débito</option><option>Crédito</option>
            </select></div>
          {m.forma_pagamento === 'Crédito' && (
            <div className="field" style={{ gridColumn:'1 / -1' }}><label>Parcelamento</label>
              <select value={m.parcelas || '1'} onChange={e=>setM({...m, parcelas:e.target.value})}
                style={{ width:'100%', padding:'8px 10px', borderRadius:10, border:'1.5px solid var(--border)', fontSize:12.5, background:'var(--card)', color:'var(--txt)' }}>
                {Array.from({length:12},(_,i)=>i+1).map(n=>(
                  <option key={n} value={n}>{n}x{m.valor && !isNaN(parseFloat(m.valor)) ? ` de ${(parseFloat(m.valor)/n).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}` : ''}</option>
                ))}
              </select></div>
          )}
          <div className="field"><label>Serviço</label>
            <input value={m.servico} maxLength={80} onChange={e=>setM({...m, servico:e.target.value})} placeholder="Ex: Vacina 6 meses" /></div>
          <div className="field"><label>Profissional</label>
            <input value={m.profissional} maxLength={80} onChange={e=>setM({...m, profissional:e.target.value})} /></div>
          <div className="field"><label>Data *</label>
            <input type="date" value={m.data} onChange={e=>setM({...m, data:e.target.value})} /></div>
          <div className="field"><label>Hora *</label>
            <input type="time" value={m.hora} onChange={e=>setM({...m, hora:e.target.value})} /></div>
          <div className="field" style={{ gridColumn:'1 / -1' }}><label>Observação</label>
            <input value={m.observacoes} maxLength={300} onChange={e=>setM({...m, observacoes:e.target.value})} /></div>
        </div>
        <label style={{ display:'flex', alignItems:'center', gap:7, fontSize:12, fontWeight:600, color:'var(--txt2)', marginTop:10, cursor:'pointer' }}>
          <input type="checkbox" checked={m.confirmar} onChange={e=>setM({...m, confirmar:e.target.checked})} />
          Enviar confirmação automática no WhatsApp 💙
        </label>
        <div style={{ display:'flex', justifyContent:'flex-end', gap:8, marginTop:13 }}>
          <button onClick={() => onClose(false)} className="btn btn-s">Cancelar</button>
          <button onClick={salvar} disabled={salvando} className="btn btn-p" style={{ opacity:salvando?.6:1 }}>{salvando ? 'Agendando…' : 'Confirmar agendamento'}</button>
        </div>
      </div>
    </div>
  );
}

/* ── Modal Indicação dentro da conversa: o cliente atual indica alguém ── */
function IndicarModal({ sel, api, onClose }) {
  const [m, setM] = React.useState({ indicado_nome: '', indicado_telefone: '' });
  const [erro, setErro] = React.useState('');
  const salvar = async () => {
    setErro('');
    if (!m.indicado_nome.trim()) return setErro('Informe quem foi indicado.');
    try {
      await api.post('/extras/indicacoes', {
        indicador_nome: sel?.contact_name || 'Cliente',
        indicador_telefone: String(sel?.phone || '').replace(/\D/g, ''),
        indicado_nome: m.indicado_nome.trim(),
        indicado_telefone: String(m.indicado_telefone || '').replace(/\D/g, ''),
      });
      Toast.show('Indicação registrada! 🎁', 'success');
      window.__auditLog?.('indicacao', 'indicacoes', '', { indicador: sel?.contact_name });
      onClose();
    } catch (e) { setErro(e.message); }
  };
  return (
    <div onClick={e => e.target === e.currentTarget && onClose()}
      style={{ position:'fixed', inset:0, background:'rgba(3,43,48,.55)', zIndex:520, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div style={{ width:'100%', maxWidth:380, background:'var(--card)', borderRadius:16, boxShadow:'var(--s4)', padding:'18px 22px' }}>
        <div style={{ fontWeight:800, fontSize:15, marginBottom:3 }}>🎁 Registrar indicação</div>
        <div style={{ fontSize:12, color:'var(--muted)', marginBottom:13 }}><b>{sel?.contact_name}</b> está indicando alguém — pontos e prêmios na página Indicações.</div>
        {erro && <div style={{ marginBottom:10, padding:'8px 12px', borderRadius:9, background:'var(--err2)', color:'var(--err)', fontSize:12, fontWeight:600 }}>{erro}</div>}
        <div className="field" style={{ marginBottom:10 }}><label>Nome do indicado *</label>
          <input value={m.indicado_nome} maxLength={80} onChange={e=>setM({...m, indicado_nome:e.target.value})} autoFocus /></div>
        <div className="field"><label>Telefone do indicado</label>
          <input value={m.indicado_telefone} maxLength={15} onChange={e=>setM({...m, indicado_telefone:e.target.value.replace(/[^\d() -]/g,'')})} placeholder="(98) 9...." /></div>
        <div style={{ display:'flex', justifyContent:'flex-end', gap:8, marginTop:13 }}>
          <button onClick={onClose} className="btn btn-s">Cancelar</button>
          <button onClick={salvar} className="btn btn-p">Registrar 🎁</button>
        </div>
      </div>
    </div>
  );
}


/* ── Ficha do paciente (mock): dados, funil em bolinhas e próximas etapas ──── */
const MARCOS_VACINAIS = [2, 3, 4, 5, 6, 7, 9, 12, 15, 16, 18]; // meses

/* ═══ 🩺 PRONTUÁRIO DO PACIENTE ═══════════════════════════════════════════════
   Pedido do master (22/08): "um verdadeiro prontuário onde posso anotar o que
   eu quiser e anexar documentos — deixa algo mais premium". Anotações livres
   com autor e hora + anexos (PDF, imagem, Office). Vive no painel Info. */
function Prontuario({ sel, api, user }) {
  const [dados, setDados] = React.useState(null);
  const [nota, setNota] = React.useState('');
  const [salvando, setSalvando] = React.useState(false);
  const [anexando, setAnexando] = React.useState(false);
  const fileRef = React.useRef(null);
  const ehGestao = ['master', 'supervisor'].includes(user?.role);

  const load = React.useCallback(() => {
    api.get(`/extras/prontuario?conversa_id=${sel.id}`).then(setDados).catch(() => setDados({ notas: [], docs: [] }));
  }, [sel.id]); // eslint-disable-line
  React.useEffect(load, [load]);

  const salvarNota = async () => {
    if (!nota.trim() || salvando) return;
    setSalvando(true);
    try {
      await api.post('/extras/prontuario/nota', { conversa_id: sel.id, lead_id: sel.lead_id || null, texto: nota.trim() });
      setNota(''); load();
    } catch (e) { Toast.show(e.message, 'error'); }
    setSalvando(false);
  };
  const apagarNota = async (n) => {
    if (!window.confirm('Apagar esta anotação do prontuário?')) return;
    try { await api.del(`/extras/prontuario/nota/${n.id}`); load(); } catch (e) { Toast.show(e.message, 'error'); }
  };
  const anexar = (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (f.size > 6 * 1024 * 1024) { Toast.show('Arquivo muito grande — máximo 6MB.', 'error'); return; }
    setAnexando(true);
    const r = new FileReader();
    r.onload = async () => {
      try {
        await api.post('/extras/prontuario/doc', { conversa_id: sel.id, lead_id: sel.lead_id || null, nome: f.name, data: r.result });
        Toast.show('Documento anexado ao prontuário 📎', 'success'); load();
      } catch (e2) { Toast.show(e2.message, 'error'); }
      setAnexando(false);
    };
    r.readAsDataURL(f);
  };
  const abrirDoc = async (d) => {
    try {
      const full = await api.get(`/extras/prontuario/doc/${d.id}`);
      const [cab, b64] = String(full.data).split(',');
      const bin = atob(b64); const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const blob = new Blob([bytes], { type: full.mime || 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      // PDF e imagem abrem pra ver; o resto baixa com o nome certo
      if (/pdf|image/.test(full.mime || '')) window.open(url, '_blank');
      else { const a = document.createElement('a'); a.href = url; a.download = full.nome || 'documento'; a.click(); }
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) { Toast.show(e.message, 'error'); }
  };
  const apagarDoc = async (d) => {
    if (!window.confirm(`Excluir "${d.nome}" do prontuário?`)) return;
    try { await api.del(`/extras/prontuario/doc/${d.id}`); load(); } catch (e) { Toast.show(e.message, 'error'); }
  };

  const kb = (n) => n > 1024 * 1024 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
  const icone = (mime) => /pdf/.test(mime) ? '📕' : /image/.test(mime) ? '🖼️' : /word|document/.test(mime) ? '📘' : /sheet|excel/.test(mime) ? '📗' : '📄';
  const quando = (s) => new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
  const total = (dados?.notas?.length || 0) + (dados?.docs?.length || 0);

  return (
    <div style={{ borderBottom: '1px solid var(--border)' }}>
      {/* Cabeçalho premium */}
      <div style={{ padding: '11px 14px', background: 'linear-gradient(120deg,#06424A,#0E8C96)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 15 }}>🩺</span>
        <span style={{ fontWeight: 800, fontSize: 13, color: '#fff', flex: 1 }}>Prontuário do Paciente</span>
        {total > 0 && <span style={{ fontSize: 10, fontWeight: 800, background: 'rgba(255,255,255,.22)', color: '#fff', borderRadius: 20, padding: '2px 9px' }}>{total}</span>}
      </div>

      <div style={{ padding: '11px 14px' }}>
        {/* ✍️ Nova anotação */}
        <textarea value={nota} onChange={e => setNota(e.target.value)} rows={2}
          placeholder="Anote o que quiser sobre o paciente: evolução, alergias, combinados com a família…"
          style={{ width: '100%', boxSizing: 'border-box', padding: '9px 11px', borderRadius: 10, border: '1.5px solid var(--border)', fontSize: 12, resize: 'vertical', background: 'var(--bg)', color: 'var(--txt)', fontFamily: 'inherit' }} />
        <div style={{ display: 'flex', gap: 6, marginTop: 7 }}>
          <button onClick={salvarNota} disabled={salvando || !nota.trim()}
            style={{ flex: 1, padding: '8px 10px', borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 11.5, fontWeight: 800,
              background: 'linear-gradient(120deg,#0E8C96,#00B8C0)', color: '#fff', opacity: (salvando || !nota.trim()) ? .55 : 1 }}>
            {salvando ? 'Salvando…' : '✍️ Salvar anotação'}
          </button>
          <input ref={fileRef} type="file" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" style={{ display: 'none' }} onChange={anexar} />
          <button onClick={() => fileRef.current?.click()} disabled={anexando} title="Anexar documento ao prontuário (PDF, imagem, Word, Excel — máx 6MB)"
            style={{ padding: '8px 12px', borderRadius: 10, cursor: 'pointer', fontSize: 11.5, fontWeight: 800,
              border: '1.5px solid #C4973B', background: '#fdf6e7', color: '#8a6417' }}>
            {anexando ? '…' : '📎 Anexar'}
          </button>
        </div>

        {/* 📎 Documentos */}
        {(dados?.docs || []).length > 0 && (
          <div style={{ marginTop: 11 }}>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: .8, textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 6 }}>📎 Documentos</div>
            {dados.docs.map(d => (
              <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 9px', borderRadius: 10, background: 'var(--bg2)', marginBottom: 5, border: '1px solid var(--border)' }}>
                <span style={{ fontSize: 15 }}>{icone(d.mime || '')}</span>
                <div onClick={() => abrirDoc(d)} style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} title="Abrir / baixar">
                  <div style={{ fontSize: 11.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--tq2)' }}>{d.nome}</div>
                  <div style={{ fontSize: 9.5, color: 'var(--muted)' }}>{kb(d.tamanho || 0)} · {String(d.autor_nome || '').split(' ')[0]} · {quando(d.created_at)}</div>
                </div>
                {ehGestao && <button onClick={() => apagarDoc(d)} title="Excluir (gestão)" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 12 }}>✕</button>}
              </div>
            ))}
          </div>
        )}

        {/* 📋 Anotações (linha do tempo) */}
        {(dados?.notas || []).length > 0 && (
          <div style={{ marginTop: 11 }}>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: .8, textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 6 }}>📋 Anotações</div>
            {dados.notas.map(n => (
              <div key={n.id} style={{ padding: '8px 11px', borderRadius: 10, background: 'var(--bg)', border: '1px solid var(--border)', borderLeft: '3px solid var(--tq)', marginBottom: 6 }}>
                <div style={{ fontSize: 12, lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{n.texto}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                  <span style={{ fontSize: 9.5, color: 'var(--muted)', fontWeight: 700, flex: 1 }}>
                    {String(n.autor_nome || '').split(' ')[0]} · {quando(n.created_at)}
                  </span>
                  {(n.autor_id === user?.id || user?.role === 'master') && (
                    <button onClick={() => apagarNota(n)} title="Apagar anotação" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 11 }}>🗑️</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {dados && total === 0 && (
          <div style={{ marginTop: 9, fontSize: 11, color: 'var(--muted)', textAlign: 'center', lineHeight: 1.5 }}>
            Prontuário vazio — a primeira anotação ou documento fica registrado aqui, com autor e hora. 💙
          </div>
        )}
      </div>
    </div>
  );
}

function FichaPaciente({ leadId, api, setor }) {
  const [lead, setLead] = React.useState(null);
  const [colunas, setColunas] = React.useState([]);
  const [editando, setEditando] = React.useState(false);
  const [form, setForm] = React.useState({});
  const [salvando, setSalvando] = React.useState(false);

  const carrega = React.useCallback(() => {
    api.get(`/leads/${leadId}`).then(l => { setLead(l); setForm(l); }).catch(() => {});
    api.get(`/leads/colunas?setor=${setor || 'vacinas'}`).then(c => setColunas((c || []).filter(x => x.ordem < 99))).catch(() => {});
  }, [leadId]); // eslint-disable-line
  React.useEffect(carrega, [carrega]);

  if (!lead) return null;

  // Próxima vacina: calculada do nascimento pelo calendário 2→18 meses
  const proximaVacina = (() => {
    if (!lead.nascimento) return null;
    const nasc = new Date(String(lead.nascimento).slice(0, 10) + 'T12:00:00');
    if (isNaN(nasc)) return null;
    const hoje = new Date();
    for (const meses of MARCOS_VACINAIS) {
      const alvo = new Date(nasc); alvo.setMonth(alvo.getMonth() + meses);
      if (alvo > hoje) return { meses, data: alvo.toLocaleDateString('pt-BR') };
    }
    return null;
  })();

  const idade = (() => {
    if (!lead.nascimento) return '';
    const nasc = new Date(String(lead.nascimento).slice(0, 10) + 'T12:00:00');
    const meses = Math.floor((Date.now() - nasc) / (30.44 * 86400000));
    return meses < 24 ? ` (${meses} meses)` : ` (${Math.floor(meses / 12)} anos)`;
  })();

  const salvar = async () => {
    if (salvando) return;
    setSalvando(true);
    try {
      const upd = await api.put(`/leads/${leadId}`, {
        nome: form.nome, responsavel_cliente: form.responsavel_cliente,
        nascimento: form.nascimento ? String(form.nascimento).slice(0, 10) : '',
        endereco: form.endereco, bairro: form.bairro, observacoes: form.observacoes,
        // filhos NÃO era enviado — o campo era editável e a edição se perdia
        filhos: form.filhos, anotacoes: form.anotacoes,
      });
      setLead(upd); setEditando(false);
    } catch (e) { Toast.show(e.message, 'error'); }
    finally { setSalvando(false); }
  };

  const mudaEtapa = async (status) => {
    try {
      const upd = await api.patch(`/leads/${leadId}/status`, { status });
      setLead(upd);
    } catch (e) {
      if (/motivo/i.test(e.message)) Toast.show('Mover pra Perdido pede o motivo — use o Kanban da Organização.', 'error');
      else Toast.show(e.message, 'error');
    }
  };

  /* Caixas organizadas (pedido do master: "deixa as caixas dos textos bem
     lindas e organizadas"): rótulo em cima, valor numa caixinha — nada de
     texto cortado com "…"; o que não cabe quebra a linha. */
  const Linha = ({ label, campo, tipo = 'text', placeholder = '—', mask, largo }) => (
    <div style={{ gridColumn: largo ? '1 / -1' : 'auto', minWidth: 0 }}>
      <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: .7, textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 3 }}>{label}</div>
      {editando ? (
        <input type={tipo} value={form[campo] ? (tipo === 'date' ? String(form[campo]).slice(0, 10) : form[campo]) : ''} maxLength={tipo === 'date' ? undefined : 160}
          placeholder={placeholder === '—' ? '' : placeholder}
          onChange={e => setForm({ ...form, [campo]: mask ? mask(e.target.value) : e.target.value })}
          style={{ width: '100%', boxSizing: 'border-box', padding: '7px 10px', borderRadius: 9, border: '1.5px solid var(--tq)', fontSize: 12, background: 'var(--card)', color: 'var(--txt)' }} />
      ) : (
        <div style={{ padding: '7px 10px', borderRadius: 9, background: 'var(--bg)', border: '1px solid var(--border)', fontSize: 12, fontWeight: 700, minHeight: 18, lineHeight: 1.45, overflowWrap: 'anywhere', color: lead[campo] ? 'var(--txt)' : 'var(--muted)' }}>
          {campo === 'nascimento' && lead.nascimento ? fmt.date(String(lead.nascimento).slice(0, 10)) + idade : (lead[campo] || placeholder)}
        </div>
      )}
    </div>
  );

  const idxAtual = colunas.findIndex(c => c.nome === lead.status);

  return (
    <>
      {/* Dados do cliente */}
      <div style={{ padding: '13px 14px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7 }}>
          <span style={{ fontWeight: 800, fontSize: 13 }}>Dados do cliente</span>
          {editando ? (
            <button onClick={salvar} disabled={salvando} style={{ border: 'none', background: 'var(--tq)', color: '#fff', borderRadius: 8, padding: '3px 11px', fontSize: 10.5, fontWeight: 800, cursor: 'pointer', opacity: salvando ? .6 : 1 }}>{salvando ? '…' : 'Salvar'}</button>
          ) : (
            <button onClick={() => { setForm(lead); setEditando(true); }} style={{ border: 'none', background: 'none', color: 'var(--tq2)', fontSize: 11, fontWeight: 800, cursor: 'pointer' }}>✏️ Editar</button>
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <Linha label="👤 Responsável" campo="responsavel_cliente" placeholder="Quem responde pela família" largo />
          <Linha label="🧒 Paciente" campo="nome" largo />
          <Linha label="🎂 Nascimento" campo="nascimento" tipo="date" />
          <Linha label="📍 Bairro" campo="bairro" />
          <Linha label="🏠 Endereço" campo="endereco" largo />
          <Linha label="👶 Outros filhos" campo="filhos" placeholder="Ex.: João (03/2026), Ana (2023)" largo />
          <Linha label="🗒️ Observações" campo="observacoes" largo />
          {/* 📝 ANOTAÇÕES SEM LIMITE (pedido do master): escreve à vontade,
              o texto inteiro fica visível — nada é cortado. */}
          <div style={{ gridColumn: '1 / -1' }}>
            <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: .7, textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 3 }}>📝 Anotações <span style={{ textTransform: 'none', fontWeight: 700 }}>(sem limite)</span></div>
            {editando ? (
              <textarea value={form.anotacoes || ''} onChange={e => setForm({ ...form, anotacoes: e.target.value })}
                rows={Math.min(14, Math.max(4, String(form.anotacoes || '').split('\n').length + 1))}
                placeholder="Escreva à vontade sobre o paciente e a família — histórico, preferências, tudo que importa…"
                style={{ width: '100%', boxSizing: 'border-box', padding: '9px 11px', borderRadius: 9, border: '1.5px solid var(--tq)', fontSize: 12, lineHeight: 1.6, resize: 'vertical', background: 'var(--card)', color: 'var(--txt)', fontFamily: 'inherit' }} />
            ) : lead.anotacoes ? (
              <div style={{ padding: '9px 11px', borderRadius: 9, background: 'var(--bg)', border: '1px solid var(--border)', borderLeft: '3px solid var(--tq)', fontSize: 12, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{lead.anotacoes}</div>
            ) : (
              <div style={{ padding: '9px 11px', borderRadius: 9, background: 'var(--bg)', border: '1px dashed var(--border)', fontSize: 11.5, color: 'var(--muted)' }}>Toque em ✏️ Editar pra escrever a primeira anotação.</div>
            )}
          </div>
        </div>
      </div>

      {/* Funil em bolinhas */}
      {colunas.length > 0 && (
        <div style={{ padding: '13px 14px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 8 }}>Funil de {setor === 'consultas' ? 'Consultas' : setor === 'terapias' ? 'Terapias' : 'Vacinas'}</div>
          <select value={lead.status || ''} onChange={e => mudaEtapa(e.target.value)}
            style={{ width: '100%', padding: '7px 10px', borderRadius: 10, border: '1.5px solid var(--border)', fontSize: 12, fontWeight: 700, background: 'var(--card)', color: 'var(--txt)', marginBottom: 10 }}>
            {colunas.map(c => <option key={c.id} value={c.nome}>{c.nome}</option>)}
            <option value="Perdido">Perdido</option>
          </select>
          <div style={{ display: 'flex', alignItems: 'flex-start', overflowX: 'auto', paddingBottom: 2 }}>
            {colunas.map((c, i) => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                <div style={{ textAlign: 'center', width: 46 }}>
                  <div style={{ width: 18, height: 18, borderRadius: '50%', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: i < idxAtual ? 'var(--tq3)' : i === idxAtual ? 'var(--tq)' : 'var(--bg2)',
                    border: `2px solid ${i <= idxAtual ? 'var(--tq)' : 'var(--border)'}`, fontSize: 9, color: i < idxAtual ? 'var(--tq2)' : '#fff', fontWeight: 800 }}>
                    {i < idxAtual ? '✓' : ''}
                  </div>
                  <div style={{ fontSize: 7.5, fontWeight: 700, color: i === idxAtual ? 'var(--tq2)' : 'var(--light)', marginTop: 3, lineHeight: 1.15 }}>{c.nome.split(' ').slice(0, 2).join(' ')}</div>
                </div>
                {i < colunas.length - 1 && <div style={{ width: 14, height: 2, background: i < idxAtual ? 'var(--tq)' : 'var(--border)', marginTop: -12, flexShrink: 0 }} />}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Próximas etapas automáticas */}
      <div style={{ padding: '13px 14px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 8 }}>Próximas etapas</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 11.5 }}>
          {proximaVacina && (
            <div style={{ display: 'flex', gap: 8 }}><span>💉</span><span>Próxima vacina: <b>{proximaVacina.data}</b> ({proximaVacina.meses} meses)</span></div>
          )}
          {lead.data_retorno && (
            <div style={{ display: 'flex', gap: 8 }}><span>🔔</span><span>Follow-up: <b>{fmt.date(String(lead.data_retorno).slice(0, 10))}</b></span></div>
          )}
          {lead.status === 'Vacinado' && (
            <div style={{ display: 'flex', gap: 8 }}><span>❤️</span><span>Pós-vacinal: <b>contato em 24h</b></span></div>
          )}
          {!proximaVacina && !lead.data_retorno && lead.status !== 'Vacinado' && (
            <div style={{ color: 'var(--muted)' }}>Preencha o nascimento pra eu calcular o calendário vacinal 2→18 meses. ✨</div>
          )}
        </div>
      </div>
    </>
  );
}
