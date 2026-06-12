import React, { useState } from 'react';
import { X, Sun, Sparkles } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';

/* ─── Boas-vindas diárias ─────────────────────────────────────────────────────
   Manhã: versículo bíblico · Tarde/noite: mensagem motivacional.
   Cicla pelo dia do ano (nunca repete em dias seguidos) e pode ser
   dispensada — volta só no dia seguinte.                                     */

const VERSICULOS = [
  ['Entrega o teu caminho ao Senhor; confia nele, e ele o fará.', 'Salmos 37:5'],
  ['Tudo posso naquele que me fortalece.', 'Filipenses 4:13'],
  ['O Senhor é o meu pastor; nada me faltará.', 'Salmos 23:1'],
  ['Não temas, porque eu sou contigo.', 'Isaías 41:10'],
  ['Em tudo dai graças, porque esta é a vontade de Deus.', '1 Tessalonicenses 5:18'],
  ['O coração alegre é como o bom remédio.', 'Provérbios 17:22'],
  ['Confia no Senhor de todo o teu coração.', 'Provérbios 3:5'],
  ['Posso todas as coisas em Cristo que me fortalece.', 'Filipenses 4:13'],
  ['O choro pode durar uma noite, mas a alegria vem pela manhã.', 'Salmos 30:5'],
  ['Sede fortes e corajosos; não temais.', 'Deuteronômio 31:6'],
  ['Lança o teu cuidado sobre o Senhor, e ele te susterá.', 'Salmos 55:22'],
  ['As misericórdias do Senhor se renovam a cada manhã.', 'Lamentações 3:22-23'],
  ['Buscai primeiro o Reino de Deus, e todas estas coisas vos serão acrescentadas.', 'Mateus 6:33'],
  ['O Senhor te abençoe e te guarde.', 'Números 6:24'],
  ['Aquietai-vos e sabei que eu sou Deus.', 'Salmos 46:10'],
  ['Tudo o que fizerem, façam de todo o coração, como para o Senhor.', 'Colossenses 3:23'],
  ['A tua palavra é lâmpada para os meus pés e luz para o meu caminho.', 'Salmos 119:105'],
  ['Vinde a mim todos os que estais cansados, e eu vos aliviarei.', 'Mateus 11:28'],
  ['Porque para Deus nada é impossível.', 'Lucas 1:37'],
  ['O Senhor é a minha força e o meu escudo.', 'Salmos 28:7'],
  ['Este é o dia que o Senhor fez; regozijemo-nos e alegremo-nos nele.', 'Salmos 118:24'],
  ['Deleita-te também no Senhor, e te concederá os desejos do teu coração.', 'Salmos 37:4'],
  ['Sê forte e corajoso; não te atemorizes, porque o Senhor teu Deus é contigo.', 'Josué 1:9'],
  ['Grandes coisas fez o Senhor por nós, e por isso estamos alegres.', 'Salmos 126:3'],
  ['O amor é paciente, o amor é bondoso.', '1 Coríntios 13:4'],
];

const MOTIVACIONAIS = [
  'Você está indo muito bem hoje. Cada atendimento representa uma família confiando na Vittalis. Continue assim!',
  'Cada mensagem respondida com carinho hoje é uma família mais protegida amanhã. 💙',
  'Seu cuidado no atendimento é o que transforma clientes em famílias da Vittalis.',
  'Boa tarde! Lembre: por trás de cada conversa existe uma mãe ou um pai buscando o melhor pro filho — e encontrando você.',
  'A diferença entre um atendimento comum e um atendimento Vittalis é o seu toque humano. Continue brilhando! ✨',
  'Mais da metade do dia já foi — e você está fazendo a diferença em cada conversa.',
  'Cada proposta enviada hoje é uma semente. Continue plantando! 🌱',
  'Seu sorriso aparece até no texto. As famílias sentem isso. 💙',
  'Atendimento humanizado não é técnica — é o que você faz naturalmente todos os dias.',
  'Cada criança vacinada começou com uma conversa como as que você está tendo agora.',
  'Reta final do dia: respire fundo e capriche nas últimas conversas. Elas também merecem o seu melhor!',
  'Você não está só respondendo mensagens — está construindo a reputação da Vittalis, uma família por vez.',
  'Hoje alguém vai escolher a Vittalis por causa do SEU atendimento. 🏆',
  'Constância vence talento. E você tem os dois!',
  'Que tal revisitar aquela conversa sem resposta? Às vezes o "sim" está a um oi de distância. 😊',
];

export default function BoasVindas() {
  const { user } = useAuth();
  const hoje = new Date();
  const hora = hoje.getHours();
  const ehManha = hora < 12;
  const chave = `vh_bemvindo_${hoje.toISOString().slice(0, 10)}_${ehManha ? 'am' : 'pm'}`;
  const [visivel, setVisivel] = useState(() => !localStorage.getItem(chave));
  if (!visivel || !user) return null;

  const inicioAno = new Date(hoje.getFullYear(), 0, 0);
  const diaDoAno = Math.floor((hoje - inicioAno) / 86400000);
  const nome = (user.nome || '').split(' ')[0];

  const dispensar = () => { localStorage.setItem(chave, '1'); setVisivel(false); };

  let titulo, corpo, fonte, Icone;
  if (ehManha) {
    const [v, ref] = VERSICULOS[diaDoAno % VERSICULOS.length];
    titulo = `☀️ Bom dia, ${nome}!`;
    corpo = `“${v}”`;
    fonte = ref;
    Icone = Sun;
  } else {
    titulo = `🌟 ${hora < 18 ? 'Boa tarde' : 'Boa noite'}, ${nome}!`;
    corpo = MOTIVACIONAIS[diaDoAno % MOTIVACIONAIS.length];
    fonte = null;
    Icone = Sparkles;
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', marginBottom: 18,
      borderRadius: 16, border: '1.5px solid var(--tq)', position: 'relative',
      background: 'linear-gradient(120deg, var(--tq4), #ffffff 60%, var(--tq4))',
      boxShadow: '0 4px 18px rgba(0,184,192,.12)' }}>
      {user.avatar
        ? <img src={user.avatar} alt="" style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: '2px solid var(--tq)' }} />
        : <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'linear-gradient(135deg, var(--tq), var(--pet))', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Icone size={20} color="#fff" />
          </div>}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 800, fontSize: 14.5, marginBottom: 2 }}>{titulo}</div>
        <div style={{ fontSize: 13, color: 'var(--txt2)', lineHeight: 1.45 }}>
          {corpo}{fonte && <span style={{ color: 'var(--tq2)', fontWeight: 700 }}> — {fonte}</span>}
        </div>
      </div>
      <button onClick={dispensar} title="Dispensar por hoje"
        style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid var(--border)', background: '#fff', color: 'var(--muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <X size={14} />
      </button>
    </div>
  );
}
