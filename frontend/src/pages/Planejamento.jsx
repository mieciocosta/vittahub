import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Rocket, Users, Trophy, Coins, ClipboardCheck, GraduationCap, ArrowRight, Target } from 'lucide-react';
import { useApi, useAuth } from '../context/AuthContext.jsx';
import { fmt } from '../hooks/utils.js';

/* PLANEJAMENTO — plano de crescimento e bônus da líder. Motiva a formar equipe
   e padronizar o atendimento pra bater a meta e ganhar os bônus. */

export default function Planejamento() {
  const api = useApi();
  const nav = useNavigate();
  const { user } = useAuth();
  const nome = (user?.nome || '').split(' ')[0];
  const [plan, setPlan] = useState(null);

  useEffect(() => { api.get('/extras/planejamento').then(setPlan).catch(() => {}); }, []); // eslint-disable-line

  const pct = plan ? Math.min(plan.pct || 0, 100) : 0;

  const BONUS = [
    { Icon: Users, cor: '#00B8C0', titulo: 'Forme e ganhe em cima de cada uma', txt: 'Com 2 pessoas bem treinadas na sua equipe, você passa a ganhar sobre o resultado de cada uma delas. Quanto melhor você treina, mais você fatura junto.' },
    { Icon: Trophy, cor: '#C4973B', titulo: 'Setor bateu R$ 500 mil no mês', txt: 'Quando o setor alcança R$ 500 mil no mês, você recebe um bônus de R$ 10.000 — e todo mês que bater, ganha de novo.', destaque: 'R$ 10.000 / mês' },
    { Icon: Coins, cor: '#16a34a', titulo: 'Bônus por cada pessoa liderada', txt: 'Cada pessoa que você lidera e desenvolve gera pra você um bônus de R$ 2.000. Liderar dá resultado no seu bolso.', destaque: 'R$ 2.000 por pessoa' },
  ];

  return (
    <div style={{ padding: 28, maxWidth: 940, margin: '0 auto' }}>
      {/* Hero */}
      <div style={{ borderRadius: 20, padding: '26px 28px', marginBottom: 20, color: '#fff', position: 'relative', overflow: 'hidden',
        background: 'linear-gradient(135deg, #06424A 0%, #0E8C96 55%, #00B8C0 130%)', boxShadow: '0 12px 34px rgba(6,66,74,.35)' }}>
        <div style={{ position: 'absolute', right: -30, top: -30, width: 150, height: 150, borderRadius: '50%', background: 'rgba(255,255,255,.09)' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, fontSize: 25, fontWeight: 800 }}><Rocket size={26} /> Planejamento — {nome}</div>
        <div style={{ fontSize: 14, opacity: .96, marginTop: 8, maxWidth: 640, lineHeight: 1.55 }}>
          Você não cresce sozinha — <b>cresce formando gente</b>. Treine bem a sua equipe, padronize o atendimento e transforme resultado em bônus. Este é o seu plano. 🚀
        </div>
      </div>

      {/* Progresso rumo aos R$ 500 mil */}
      {plan && (
        <div className="card" style={{ padding: '18px 22px', marginBottom: 18, borderLeft: '4px solid #C4973B' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
            <div style={{ fontWeight: 800, fontSize: 15, display: 'flex', alignItems: 'center', gap: 8 }}><Target size={17} color="#C4973B" /> Meta do bônus — R$ 500 mil no mês</div>
            <div style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 700, textTransform: 'capitalize' }}>Setor: {plan.setor}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 26, fontWeight: 800, color: 'var(--ok,#16a34a)' }}>{fmt.brl(plan.confirmado)}</span>
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>de {fmt.brl(plan.meta)} · {Math.round(plan.pct || 0)}%</span>
          </div>
          <div style={{ height: 11, borderRadius: 7, background: 'var(--bg2)', overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', borderRadius: 7, background: 'linear-gradient(90deg,#C4973B,#e8b04a)', transition: 'width .5s' }} />
          </div>
          <div style={{ fontSize: 12, color: pct >= 100 ? 'var(--ok)' : 'var(--muted)', fontWeight: 600, marginTop: 7 }}>
            {pct >= 100 ? '🏆 Meta batida — bônus de R$ 10 mil garantido!' : `Faltam ${fmt.brl(plan.falta)} pra destravar os R$ 10 mil deste mês.`}
          </div>
        </div>
      )}

      {/* Bônus */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 14, marginBottom: 20 }}>
        {BONUS.map(({ Icon, cor, titulo, txt, destaque }) => (
          <div key={titulo} className="card" style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 9, borderTop: `3px solid ${cor}` }}>
            <div style={{ width: 44, height: 44, borderRadius: 13, background: cor + '1a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon size={22} color={cor} /></div>
            <div style={{ fontWeight: 800, fontSize: 15 }}>{titulo}</div>
            {destaque && <div style={{ fontSize: 18, fontWeight: 800, color: cor }}>{destaque}</div>}
            <div style={{ fontSize: 12.5, color: 'var(--txt2)', lineHeight: 1.55 }}>{txt}</div>
          </div>
        ))}
      </div>

      {/* Requisito: padrão de conversas */}
      <div className="card" style={{ padding: '20px 22px', background: 'var(--tq4)', border: '1.5px solid var(--tq3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontWeight: 800, fontSize: 15, marginBottom: 8 }}>
          <ClipboardCheck size={19} color="var(--tq2)" /> A chave de tudo: PADRÃO de conversas
        </div>
        <p style={{ fontSize: 13, color: 'var(--txt2)', lineHeight: 1.6, marginBottom: 14 }}>
          Nada disso acontece no improviso. Pra sua equipe vender de forma consistente, <b>precisa existir um padrão de atendimento</b> — do "oi" ao fechamento.
          Construa esse padrão a partir do que já deu certo e ensine cada pessoa a repetir.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button onClick={() => nav('/cases-sucesso')} className="btn btn-p" style={{ gap: 7 }}><Trophy size={15} /> Ver Cases de Sucesso <ArrowRight size={14} /></button>
          <button onClick={() => nav('/cursos')} className="btn btn-s" style={{ gap: 7 }}><GraduationCap size={15} /> Cursos de treinamento</button>
          <button onClick={() => nav('/planos-vacinais')} className="btn btn-s" style={{ gap: 7 }}><ClipboardCheck size={15} /> Passo a passo dos funis</button>
        </div>
      </div>
    </div>
  );
}
