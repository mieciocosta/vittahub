import React, { useEffect, useState } from 'react';
import { useApi } from '../context/AuthContext.jsx';

/* 💠💰💾 CONFIGURAÇÕES FINANCEIRAS E BACKUP (pedido do master, 21/09: "arruma
   tudo isso"). Três coisas que antes só mudavam pelo servidor:
   · as chaves Pix de cada setor (o botão Pix do chat lê daqui);
   · as regras do bônus do Caixa (padrão e Influenza);
   · o backup do banco, pra baixar quando quiser.
   Só o master vê (a página Configurações já barra o resto). */
const inp = { border: '1.5px solid var(--border)', borderRadius: 9, padding: '8px 11px', fontSize: 13, background: 'var(--bg)', color: 'var(--txt)' };
const rot = { fontSize: 11, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: .5, display: 'block', marginBottom: 4 };

export default function ConfigFinanceiro() {
  const api = useApi();
  const [pix, setPix] = useState(null);
  const [pixSalvando, setPixSalvando] = useState(false);
  const [bonus, setBonus] = useState(null);
  const [bonusSalvando, setBonusSalvando] = useState(false);
  const [ultimoBackup, setUltimoBackup] = useState(null);
  const [baixando, setBaixando] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    // As chaves vêm em "opções" (uma por setor visível); pro master são as duas
    api.get('/inbox/pix/chaves').then(d => {
      const op = Array.isArray(d?.opcoes) ? d.opcoes : [];
      const v = op.find(o => o.setor === 'vacinas') || {}; const c = op.find(o => o.setor === 'consultas') || {};
      setPix({ vacinas: { chave: v.chave || '', tipo: v.tipo || 'CNPJ' }, consultas: { chave: c.chave || '', tipo: c.tipo || 'CNPJ' } });
    }).catch(() => setPix({ vacinas: { chave: '', tipo: 'CNPJ' }, consultas: { chave: '', tipo: 'CNPJ' } }));
    api.get('/extras/bonus-caixa/regras').then(d => setBonus({
      padrao: { pct: d?.padrao?.pct ?? 1 },
      influenza: { tipo: d?.influenza?.tipo || 'pct', valor: d?.influenza?.valor ?? 1 },
      so_com_comprovante: d?.so_com_comprovante !== false, definido: !!d?.definido,
    })).catch(() => {});
    api.get('/extras/backup/ultimo').then(setUltimoBackup).catch(() => {});
  }, []); // eslint-disable-line

  const aviso = (t) => { setMsg(t); setTimeout(() => setMsg(''), 3500); };
  const salvarPix = async () => {
    setPixSalvando(true);
    try {
      await api.put('/inbox/pix/chaves', { vacinas: pix.vacinas, consultas: pix.consultas, terapias: pix.consultas });
      aviso('✅ Chaves Pix salvas. O botão Pix do chat já usa as novas.');
    } catch (e) { aviso('❌ ' + (e.message || 'Falha ao salvar')); }
    setPixSalvando(false);
  };
  const salvarBonus = async () => {
    setBonusSalvando(true);
    try { const d = await api.put('/extras/bonus-caixa/regras', bonus); setBonus(b => ({ ...b, definido: !!d?.definido })); aviso('✅ Regras do bônus salvas. O Caixa recalcula na hora.'); }
    catch (e) { aviso('❌ ' + (e.message || 'Falha ao salvar')); }
    setBonusSalvando(false);
  };
  const baixarBackup = async () => {
    setBaixando(true);
    try {
      const BASE = import.meta.env.VITE_API_URL || '';
      const r = await fetch(`${BASE}/api/extras/backup`, { headers: { Authorization: `Bearer ${localStorage.getItem('vh_token') || ''}` } });
      if (!r.ok) throw new Error('Servidor recusou o backup');
      const blob = await r.blob();
      const nome = (r.headers.get('Content-Disposition') || '').match(/filename="([^"]+)"/)?.[1] || 'vittahub-backup.json.gz';
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nome; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      setUltimoBackup({ em: new Date().toISOString(), por: 'você' });
      aviso('✅ Backup baixado. Guarde o arquivo num lugar seguro (Drive, pen drive).');
    } catch (e) { aviso('❌ ' + (e.message || 'Falha ao baixar')); }
    setBaixando(false);
  };

  return (
    <div className="card" style={{ padding: '16px 18px', marginTop: 16 }}>
      <div style={{ fontWeight: 900, fontSize: 14, marginBottom: 4 }}>💠 Pix, bônus e backup</div>
      <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.55, marginBottom: 12 }}>
        Chaves Pix que o botão do chat envia, regras do bônus do Caixa e a cópia de segurança do banco.
      </div>
      {msg && <div style={{ fontSize: 12.5, fontWeight: 800, padding: '8px 12px', borderRadius: 9, background: msg.startsWith('✅') ? '#e7f8ef' : '#fee2e2', color: msg.startsWith('✅') ? '#166534' : '#991b1b', marginBottom: 12 }}>{msg}</div>}

      {/* 💠 Pix */}
      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginBottom: 14 }}>
        <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 8 }}>💠 Chaves Pix por setor</div>
        {!pix ? <div style={{ fontSize: 12, color: 'var(--muted)' }}>Carregando…</div> : (
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            {[['vacinas', '💉 Vacinas'], ['consultas', '🩺 Consultas e terapias']].map(([k, r]) => (
              <div key={k} style={{ flex: '1 1 260px' }}>
                <span style={rot}>{r}</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <select value={pix[k].tipo} onChange={e => setPix(p => ({ ...p, [k]: { ...p[k], tipo: e.target.value } }))} style={{ ...inp, width: 96 }}>
                    {['CNPJ', 'CPF', 'PHONE', 'EMAIL', 'EVP'].map(t => <option key={t} value={t}>{t === 'PHONE' ? 'Celular' : t === 'EMAIL' ? 'E-mail' : t === 'EVP' ? 'Aleatória' : t}</option>)}
                  </select>
                  <input value={pix[k].chave} onChange={e => setPix(p => ({ ...p, [k]: { ...p[k], chave: e.target.value } }))} placeholder="Chave Pix" style={{ ...inp, flex: 1, fontWeight: 800 }} />
                </div>
              </div>
            ))}
            <button onClick={salvarPix} disabled={pixSalvando} className="btn btn-p" style={{ fontWeight: 800 }}>{pixSalvando ? 'Salvando…' : 'Salvar chaves'}</button>
          </div>
        )}
      </div>

      {/* 💰 Bônus */}
      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginBottom: 14 }}>
        <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 8 }}>🎁 Regras do bônus do Caixa
          {bonus && !bonus.definido && <span style={{ marginLeft: 8, fontSize: 10.5, fontWeight: 800, color: '#b91c1c', background: '#fee2e2', borderRadius: 20, padding: '2px 8px' }}>Influenza ainda no padrão</span>}
        </div>
        {!bonus ? <div style={{ fontSize: 12, color: 'var(--muted)' }}>Carregando…</div> : (
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div><span style={rot}>Padrão (% da venda)</span>
              <input value={bonus.padrao.pct} onChange={e => setBonus(b => ({ ...b, padrao: { pct: e.target.value } }))} inputMode="decimal" style={{ ...inp, width: 90, fontWeight: 800 }} /></div>
            <div><span style={rot}>Influenza: tipo</span>
              <select value={bonus.influenza.tipo} onChange={e => setBonus(b => ({ ...b, influenza: { ...b.influenza, tipo: e.target.value } }))} style={inp}>
                <option value="pct">% da venda</option><option value="fixo">Valor fixo por venda (R$)</option>
              </select></div>
            <div><span style={rot}>Influenza: {bonus.influenza.tipo === 'fixo' ? 'R$ por venda' : '% da venda'}</span>
              <input value={bonus.influenza.valor} onChange={e => setBonus(b => ({ ...b, influenza: { ...b.influenza, valor: e.target.value } }))} inputMode="decimal" style={{ ...inp, width: 100, fontWeight: 800 }} /></div>
            <label style={{ fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, paddingBottom: 8 }}>
              <input type="checkbox" checked={bonus.so_com_comprovante} onChange={e => setBonus(b => ({ ...b, so_com_comprovante: e.target.checked }))} /> só venda com comprovante</label>
            <button onClick={salvarBonus} disabled={bonusSalvando} className="btn btn-p" style={{ fontWeight: 800 }}>{bonusSalvando ? 'Salvando…' : 'Salvar regras'}</button>
          </div>
        )}
      </div>

      {/* 💾 Backup */}
      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
        <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 4 }}>💾 Backup do banco</div>
        <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.55, marginBottom: 8 }}>
          Baixa uma cópia de todas as tabelas (conversas, mensagens, vendas, agenda, leads, usuários, configurações) num arquivo comprimido. Arquivos pesados (comprovantes, fotos, áudios) ficam de fora. Recomendação: baixar toda semana e guardar no Drive. E confira no painel do Railway se o backup automático do PostgreSQL está ligado.
          {ultimoBackup?.em && <div style={{ marginTop: 4, fontWeight: 700 }}>Último backup: {new Date(ultimoBackup.em).toLocaleString('pt-BR')}{ultimoBackup.por ? ` · por ${String(ultimoBackup.por).split(' ')[0]}` : ''}</div>}
        </div>
        <button onClick={baixarBackup} disabled={baixando} className="btn btn-p" style={{ fontWeight: 800 }}>{baixando ? 'Gerando o arquivo… pode levar um minuto' : '💾 Baixar backup agora'}</button>
      </div>
    </div>
  );
}
