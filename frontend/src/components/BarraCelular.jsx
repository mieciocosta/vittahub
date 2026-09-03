import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { MessageSquare, CalendarDays, LayoutGrid, Wallet, Search, Menu } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';

/* 📱 BARRA DE NAVEGAÇÃO DO CELULAR (ordem do master, 03/09: "uma versão
   totalmente compatível com tablet e smartphone... nas telas os menus ficam
   escondidos, ou seja, somente responsividade não resolve").

   Ele está certo: o menu do celular EXISTIA, mas atrás do ☰ — e menu atrás de
   um botão é menu que ninguém abre. Todo app que a equipe usa (WhatsApp,
   Instagram, banco) resolve isso do mesmo jeito: uma barra fixa embaixo com
   os quatro ou cinco destinos que importam, sempre à vista. O resto continua
   no ☰, que aqui virou a última aba, "Menu".

   Só aparece em tela pequena (a regra mora no CSS, .vh-barra-celular). E some
   quando uma conversa está aberta — dentro do chat o rodapé é da caixa de
   digitar, exatamente como no WhatsApp. */
export default function BarraCelular({ unread = 0, onAbrirMenu }) {
  const { user } = useAuth();
  const loc = useLocation();
  const gestao = user?.role === 'master' || user?.role === 'supervisor'
    || user?.ve_tudo === true || user?.distribuidor === true;

  const abas = [
    { to: '/inbox',  icon: MessageSquare, rotulo: 'Chat', badge: unread },
    { to: '/agenda', icon: CalendarDays,  rotulo: 'Agenda' },
    gestao
      ? { to: '/painel-comercial', icon: LayoutGrid, rotulo: 'Painel' }
      : { to: '/minha-carteira',   icon: Wallet,     rotulo: 'Carteira' },
    { acao: () => window.dispatchEvent(new CustomEvent('vh-abrir-busca', { detail: { q: '' } })), icon: Search, rotulo: 'Buscar' },
    { acao: onAbrirMenu, icon: Menu, rotulo: 'Menu' },
  ];

  const estilo = (ativo) => ({
    flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3,
    padding: '8px 4px 6px', border: 'none', background: 'transparent', textDecoration: 'none', cursor: 'pointer',
    color: ativo ? 'var(--tq2)' : 'var(--muted)', fontSize: 10.5, fontWeight: ativo ? 800 : 600,
    position: 'relative', minWidth: 0,
  });

  return (
    <nav className="vh-barra-celular" aria-label="Navegação principal">
      {abas.map(a => {
        const Icone = a.icon;
        const ativo = a.to ? (loc.pathname === a.to || (a.to === '/inbox' && loc.pathname === '/')) : false;
        const miolo = (
          <>
            <span style={{ position: 'relative', display: 'inline-flex' }}>
              <Icone size={22} strokeWidth={ativo ? 2.5 : 2} />
              {a.badge > 0 && (
                <span style={{ position: 'absolute', top: -6, right: -10, minWidth: 17, height: 17, padding: '0 4px',
                  borderRadius: 99, background: 'var(--err,#dc2626)', color: '#fff', fontSize: 9.5, fontWeight: 900,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid var(--card,#fff)' }}>
                  {a.badge > 99 ? '99+' : a.badge}
                </span>
              )}
            </span>
            <span style={{ whiteSpace: 'nowrap' }}>{a.rotulo}</span>
            {ativo && <span style={{ position: 'absolute', top: 0, width: 28, height: 3, borderRadius: 99, background: 'var(--tq)' }} />}
          </>
        );
        return a.to
          ? <NavLink key={a.rotulo} to={a.to} style={estilo(ativo)}>{miolo}</NavLink>
          : <button key={a.rotulo} type="button" onClick={a.acao} style={estilo(false)}>{miolo}</button>;
      })}
    </nav>
  );
}
