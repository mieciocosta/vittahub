import React, { useState, useEffect, useRef } from 'react';
import { X, FileText, Download, Send, Sparkles, ChevronRight, Check, Printer } from 'lucide-react';

// ── Diamond SVG inline (brand icon) ─────────────────────────────────────────
const Diamond = ({ size = 40, color = '#00B8C0' }) => (
  <svg width={size} height={size} viewBox="0 0 100 85" fill="none">
    <polygon points="50,5 90,32 90,70 50,95 10,70 10,32" fill="none" stroke={color} strokeWidth="3"/>
    <polygon points="50,5 75,32 75,70 50,92 25,70 25,32" fill="none" stroke={color} strokeWidth="2" opacity=".6"/>
    <line x1="10" y1="32" x2="90" y2="32" stroke={color} strokeWidth="2"/>
    <line x1="25" y1="32" x2="50" y2="5" stroke={color} strokeWidth="2"/>
    <line x1="75" y1="32" x2="50" y2="5" stroke={color} strokeWidth="2"/>
    <line x1="10" y1="32" x2="50" y2="92" stroke={color} strokeWidth="1.5" opacity=".5"/>
    <line x1="90" y1="32" x2="50" y2="92" stroke={color} strokeWidth="1.5" opacity=".5"/>
    <line x1="50" y1="5" x2="50" y2="92" stroke={color} strokeWidth="1.5" opacity=".5"/>
  </svg>
);

// ── PDF generator ─────────────────────────────────────────────────────────────
function gerarPropostaPDF({ cliente, itens, desconto, valTotal, valFinal, atendente, validade, observacao }) {
  const hoje = new Date().toLocaleDateString('pt-BR', { day:'2-digit', month:'long', year:'numeric' });
  const validadeDate = new Date(); validadeDate.setDate(validadeDate.getDate() + (parseInt(validade)||7));
  const validadeStr = validadeDate.toLocaleDateString('pt-BR', { day:'2-digit', month:'long', year:'numeric' });

  const linhasItens = itens.map((it, i) => `
    <tr>
      <td style="padding:12px 16px; border-bottom:1px solid #eef2f5; font-size:13.5px; color:#0a1520; font-weight:500;">${it.nome}</td>
      <td style="padding:12px 16px; border-bottom:1px solid #eef2f5; font-size:13px; color:#5a7285; text-align:center;">${it.doses || '—'}</td>
      <td style="padding:12px 16px; border-bottom:1px solid #eef2f5; font-size:13.5px; color:#0a1520; text-align:right; font-weight:600;">R$ ${it.preco.toFixed(2).replace('.',',')}</td>
    </tr>`).join('');

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8"/>
<title>Proposta Vittalis Saúde — ${cliente}</title>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap" rel="stylesheet"/>
<style>
  * { box-sizing:border-box; margin:0; padding:0; }
  body { font-family:'DM Sans',Arial,sans-serif; background:#fff; color:#0a1520; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  @page { margin: 0; size: A4; }

  .page { width:210mm; min-height:297mm; padding:0; position:relative; }

  /* Header */
  .header { background:linear-gradient(135deg, #071e2c 0%, #0d3d52 45%, #207898 80%, #00B8C0 130%); padding:44px 52px 36px; position:relative; overflow:hidden; }
  .header::after { content:''; position:absolute; right:-60px; top:-60px; width:280px; height:280px; border-radius:50%; background:rgba(0,184,192,0.08); }
  .header-inner { position:relative; z-index:1; display:flex; justify-content:space-between; align-items:flex-start; }
  .brand { display:flex; align-items:center; gap:14px; }
  .brand-text .name { font-size:22px; font-weight:700; color:#fff; letter-spacing:-.3px; }
  .brand-text .tagline { font-size:11px; color:rgba(255,255,255,0.45); font-weight:500; letter-spacing:1.5px; text-transform:uppercase; margin-top:2px; }
  .proposta-badge { background:rgba(0,184,192,0.2); border:1px solid rgba(0,184,192,0.4); border-radius:8px; padding:10px 18px; text-align:right; }
  .proposta-badge .label { font-size:10px; color:rgba(255,255,255,0.5); text-transform:uppercase; letter-spacing:1.2px; margin-bottom:3px; }
  .proposta-badge .num { font-size:18px; font-weight:700; color:#fff; }
  .proposta-badge .date { font-size:11px; color:rgba(255,255,255,0.45); margin-top:2px; }

  /* Hero line */
  .hero-line { background:linear-gradient(90deg, #00B8C0, #207898); height:3px; }

  /* Body */
  .body { padding:40px 52px; }

  /* Client section */
  .client-section { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:36px; padding-bottom:28px; border-bottom:1.5px solid #eef2f5; }
  .client-block .pre { font-size:10.5px; font-weight:700; color:#00B8C0; text-transform:uppercase; letter-spacing:1px; margin-bottom:6px; }
  .client-block .name { font-size:22px; font-weight:600; color:#0a1520; }
  .client-block .sub { font-size:12.5px; color:#5a7285; margin-top:4px; }
  .meta-grid { display:grid; grid-template-columns:1fr 1fr; gap:8px 28px; text-align:right; }
  .meta-item .mlabel { font-size:10px; text-transform:uppercase; letter-spacing:.8px; color:#8fa3b3; font-weight:600; }
  .meta-item .mval { font-size:12.5px; color:#2d4255; font-weight:500; margin-top:1px; }

  /* Intro text */
  .intro { background:#f7f9fb; border-left:3px solid #00B8C0; border-radius:0 8px 8px 0; padding:16px 20px; margin-bottom:32px; font-size:13.5px; color:#2d4255; line-height:1.7; }

  /* Section title */
  .sec-title { font-size:10.5px; font-weight:700; color:#207898; text-transform:uppercase; letter-spacing:1px; margin-bottom:14px; display:flex; align-items:center; gap:8px; }
  .sec-title::after { content:''; flex:1; height:1px; background:#eef2f5; }

  /* Table */
  .items-table { width:100%; border-collapse:collapse; margin-bottom:0; border-radius:10px; overflow:hidden; border:1.5px solid #eef2f5; }
  .items-table thead tr { background:linear-gradient(90deg, #0d3d52, #207898); }
  .items-table thead th { padding:11px 16px; font-size:10.5px; font-weight:700; color:rgba(255,255,255,0.8); text-transform:uppercase; letter-spacing:.6px; }
  .items-table thead th:last-child { text-align:right; }
  .items-table thead th:nth-child(2) { text-align:center; }

  /* Totals */
  .totals { margin-top:0; border:1.5px solid #eef2f5; border-top:none; border-radius:0 0 10px 10px; overflow:hidden; }
  .total-row { display:flex; justify-content:space-between; padding:10px 16px; font-size:13px; color:#5a7285; border-top:1px solid #f2f5f7; }
  .total-row.subtotal { background:#fafcfd; }
  .total-row.discount { color:#0fb07a; background:#f0fdf8; }
  .total-final { display:flex; justify-content:space-between; padding:16px 16px; background:linear-gradient(90deg, #071e2c, #0d3d52); }
  .total-final .lbl { font-size:14px; font-weight:600; color:#fff; display:flex; align-items:center; gap:8px; }
  .total-final .val { font-size:22px; font-weight:700; color:#00B8C0; }

  /* Payment */
  .payment-grid { display:grid; grid-template-columns:1fr 1fr 1fr; gap:12px; margin-top:24px; margin-bottom:28px; }
  .pay-card { border:1.5px solid #eef2f5; border-radius:10px; padding:14px 16px; text-align:center; }
  .pay-card .pay-icon { font-size:20px; margin-bottom:6px; }
  .pay-card .pay-label { font-size:11px; font-weight:700; color:#207898; text-transform:uppercase; letter-spacing:.5px; }
  .pay-card .pay-desc { font-size:11.5px; color:#5a7285; margin-top:3px; }

  /* Benefits */
  .benefits { background:linear-gradient(135deg, #f0fdfe, #e5f7f8); border-radius:12px; padding:22px 24px; margin-bottom:24px; }
  .benefits-grid { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:14px; }
  .benefit-item { display:flex; align-items:flex-start; gap:8px; font-size:12.5px; color:#2d4255; }
  .benefit-dot { width:18px; height:18px; border-radius:50%; background:#00B8C0; display:flex; align-items:center; justify-content:center; flex-shrink:0; margin-top:1px; }

  /* Obs */
  .obs-box { background:#fffbeb; border:1.5px solid #fde68a; border-radius:8px; padding:14px 16px; margin-bottom:28px; font-size:12.5px; color:#92400e; line-height:1.6; }

  /* Footer */
  .footer { background:#071e2c; padding:24px 52px; display:flex; justify-content:space-between; align-items:center; }
  .footer-brand { display:flex; align-items:center; gap:10px; }
  .footer-brand .fn { font-size:15px; font-weight:700; color:#fff; }
  .footer-brand .fs { font-size:10.5px; color:rgba(255,255,255,.35); margin-top:1px; }
  .footer-info { text-align:right; font-size:11px; color:rgba(255,255,255,.35); line-height:1.8; }
  .footer-slogan { font-size:12px; color:rgba(0,184,192,.7); font-style:italic; font-weight:500; }

  /* Validity strip */
  .validity-strip { background:linear-gradient(90deg, #00B8C0, #207898); padding:10px 52px; display:flex; justify-content:space-between; align-items:center; }
  .validity-strip .vl { font-size:11.5px; color:#fff; font-weight:600; }
  .validity-strip .vv { font-size:12px; color:rgba(255,255,255,.8); }

  @media print {
    body { -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; }
  }
</style>
</head>
<body>
<div class="page">

  <!-- HEADER -->
  <div class="header">
    <div class="header-inner">
      <div class="brand">
        <svg width="44" height="44" viewBox="0 0 100 85" fill="none">
          <polygon points="50,5 90,32 90,70 50,95 10,70 10,32" fill="none" stroke="#00B8C0" stroke-width="4"/>
          <polygon points="50,5 75,32 75,70 50,92 25,70 25,32" fill="none" stroke="#00B8C0" stroke-width="2.5" opacity=".6"/>
          <line x1="10" y1="32" x2="90" y2="32" stroke="#00B8C0" stroke-width="2.5"/>
          <line x1="25" y1="32" x2="50" y2="5" stroke="#00B8C0" stroke-width="2.5"/>
          <line x1="75" y1="32" x2="50" y2="5" stroke="#00B8C0" stroke-width="2.5"/>
        </svg>
        <div class="brand-text">
          <div class="name">Vittalis Saúde</div>
          <div class="tagline">Sua vida é preciosa</div>
        </div>
      </div>
      <div class="proposta-badge">
        <div class="label">Proposta Comercial</div>
        <div class="num">N° ${String(Date.now()).slice(-6)}</div>
        <div class="date">${hoje}</div>
      </div>
    </div>
  </div>
  <div class="hero-line"></div>

  <div class="body">

    <!-- CLIENT + META -->
    <div class="client-section">
      <div class="client-block">
        <div class="pre">Proposta preparada para</div>
        <div class="name">${cliente}</div>
        <div class="sub">Cliente Vittalis Saúde · São Luís, MA</div>
      </div>
      <div class="meta-grid">
        <div class="meta-item">
          <div class="mlabel">Atendente</div>
          <div class="mval">${atendente}</div>
        </div>
        <div class="meta-item">
          <div class="mlabel">Data</div>
          <div class="mval">${hoje}</div>
        </div>
        <div class="meta-item">
          <div class="mlabel">Validade</div>
          <div class="mval">${validadeStr}</div>
        </div>
        <div class="meta-item">
          <div class="mlabel">Condição</div>
          <div class="mval">Parcelado ou À vista</div>
        </div>
      </div>
    </div>

    <!-- INTRO -->
    <div class="intro">
      Prezado(a) <strong>${cliente}</strong>, é com muito prazer que apresentamos esta proposta personalizada para o seu cuidado com a saúde. Na Vittalis Saúde, cada paciente é tratado como uma joia rara — com atenção, empatia e compromisso com o seu bem-estar.
    </div>

    <!-- ITEMS TABLE -->
    <div class="sec-title">Serviços e Vacinas Incluídos</div>
    <table class="items-table">
      <thead>
        <tr>
          <th style="text-align:left">Produto / Serviço</th>
          <th>Doses</th>
          <th>Valor</th>
        </tr>
      </thead>
      <tbody>${linhasItens}</tbody>
    </table>

    <!-- TOTALS -->
    <div class="totals">
      <div class="total-row subtotal">
        <span>Subtotal</span>
        <span style="font-weight:600;color:#2d4255">R$ ${valTotal.toFixed(2).replace('.',',')}</span>
      </div>
      ${desconto > 0 ? `<div class="total-row discount"><span>Desconto aplicado (${desconto}%)</span><span style="font-weight:700">− R$ ${(valTotal - valFinal).toFixed(2).replace('.',',')}</span></div>` : ''}
      <div class="total-final">
        <div class="lbl">
          <svg width="16" height="16" viewBox="0 0 100 85" fill="none"><polygon points="50,5 90,32 90,70 50,95 10,70 10,32" fill="none" stroke="#00B8C0" stroke-width="6"/></svg>
          Valor Total${desconto > 0 ? ` (com ${desconto}% desconto)` : ''}
        </div>
        <div class="val">R$ ${valFinal.toFixed(2).replace('.',',')}</div>
      </div>
    </div>

    <!-- PAYMENT -->
    <div class="sec-title" style="margin-top:24px">Formas de Pagamento</div>
    <div class="payment-grid">
      <div class="pay-card">
        <div class="pay-icon">💳</div>
        <div class="pay-label">Cartão de Crédito</div>
        <div class="pay-desc">Em até 12x sem juros*</div>
      </div>
      <div class="pay-card">
        <div class="pay-icon">⚡</div>
        <div class="pay-label">Pix</div>
        <div class="pay-desc">Desconto adicional à vista</div>
      </div>
      <div class="pay-card">
        <div class="pay-icon">🏦</div>
        <div class="pay-label">Boleto</div>
        <div class="pay-desc">Parcelado em até 3x</div>
      </div>
    </div>

    <!-- BENEFITS -->
    <div class="benefits">
      <div class="sec-title" style="margin-top:0; color:#0d3d52">Por que escolher a Vittalis Saúde?</div>
      <div class="benefits-grid">
        ${[
          ['💎','Atendimento humanizado e acolhedor em cada consulta'],
          ['🏥','Clínica moderna com equipamentos de última geração'],
          ['👨‍⚕️','Equipe especializada e treinada com foco no paciente'],
          ['📋','Acompanhamento completo do seu histórico vacinal'],
          ['🚀','Agendamento online fácil e rápido'],
          ['❤️','Cuidado preventivo para toda a família'],
        ].map(([icon,txt])=>`
        <div class="benefit-item">
          <div class="benefit-dot"><span style="font-size:9px">${icon}</span></div>
          <span>${txt}</span>
        </div>`).join('')}
      </div>
    </div>

    ${observacao ? `<div class="obs-box">📝 <strong>Observações:</strong> ${observacao}</div>` : ''}

  </div>

  <!-- VALIDITY STRIP -->
  <div class="validity-strip">
    <div class="vl">⏰ Esta proposta é válida até ${validadeStr}</div>
    <div class="vv">Para aceitar, entre em contato com seu atendente Vittalis</div>
  </div>

  <!-- FOOTER -->
  <div class="footer">
    <div class="footer-brand">
      <svg width="28" height="28" viewBox="0 0 100 85" fill="none"><polygon points="50,5 90,32 90,70 50,95 10,70 10,32" fill="none" stroke="#00B8C0" stroke-width="5"/><line x1="10" y1="32" x2="90" y2="32" stroke="#00B8C0" stroke-width="3"/></svg>
      <div>
        <div class="fn">Vittalis Saúde</div>
        <div class="fs">vittalissaude.com.br · São Luís, MA</div>
      </div>
    </div>
    <div class="footer-slogan">"Sua vida é preciosa."</div>
    <div class="footer-info">
      Proposta gerada via VittaHub CRM<br/>
      Atendente: ${atendente}<br/>
      ${hoje}
    </div>
  </div>

</div>
</body>
</html>`;

  const w = window.open('', '_blank');
  w.document.write(html);
  w.document.close();
  setTimeout(() => w.print(), 800);
}

// ── PropostaModal component ───────────────────────────────────────────────────
export default function PropostaModal({ convId, token, contactName, atendente, onClose }) {
  const [planos, setPlanos] = useState([]);
  const [vacinas, setVacinas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('planos');
  const [carrinho, setCarrinho] = useState([]);
  const [desconto, setDesconto] = useState('');
  const [observacao, setObservacao] = useState('');
  const [validade, setValidade] = useState('7');
  const [sending, setSending] = useState(false);
  const [step, setStep] = useState('select'); // select | preview

  useEffect(() => {
    fetch('/api/inbox/vittasys/proposta', { method:'POST', headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`}, body:'{}' })
      .then(r=>r.json()).then(d=>{ setPlanos(d.planos||[]); setVacinas(d.vacinas||[]); setLoading(false); });
  }, []);

  const addItem = (item) => {
    if (!carrinho.find(c=>c.id===item.id)) setCarrinho(p=>[...p, item]);
  };
  const removeItem = (id) => setCarrinho(p=>p.filter(c=>c.id!==id));

  const valTotal = carrinho.reduce((s,i)=>s+(i.preco||0), 0);
  const discP = parseFloat(desconto)||0;
  const valFinal = discP > 0 ? valTotal*(1-discP/100) : valTotal;

  const sendChat = async () => {
    setSending(true);
    const itensMsg = carrinho.map(i=>`  • *${i.nome}* — R$ ${i.preco.toFixed(2).replace('.',',')}`).join('\n');
    const discMsg = discP > 0 ? `\n\n🎁 *Desconto especial:* ${discP}% = −R$ ${(valTotal-valFinal).toFixed(2).replace('.',',')}` : '';
    const txt = `💎 *Proposta Personalizada — Vittalis Saúde*\n\nOlá, ${contactName}! Preparei uma proposta especial para você:\n\n${itensMsg}${discMsg}\n\n💰 *Valor total: R$ ${valFinal.toFixed(2).replace('.',',')}*\n\n✅ Parcelamos em até 12x no cartão\n⚡ Pix com desconto adicional\n📋 Agenda disponível esta semana!\n\n_Posso enviar o PDF detalhado com todos os benefícios incluídos. Interesse?_ 😊`;
    await fetch(`/api/inbox/conversations/${convId}/send`, { method:'POST', headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`}, body:JSON.stringify({content:txt}) });
    setSending(false);
    onClose(txt);
  };

  const gerarPDF = () => {
    gerarPropostaPDF({ cliente:contactName, itens:carrinho.map(i=>({nome:i.nome,preco:i.preco,doses:i.doses})), desconto:discP, valTotal, valFinal, atendente: atendente||'Equipe Vittalis', validade, observacao });
  };

  const allItems = [...planos, ...vacinas.filter(v=>v.preco>0)];

  return (
    <div onClick={e=>e.target===e.currentTarget&&onClose()} style={{ position:'fixed', inset:0, background:'rgba(7,30,44,.7)', zIndex:400, display:'flex', alignItems:'center', justifyContent:'center', padding:16, backdropFilter:'blur(6px)' }}>
      <div style={{ background:'#fff', borderRadius:18, width:'100%', maxWidth:680, maxHeight:'90vh', display:'flex', flexDirection:'column', boxShadow:'0 24px 80px rgba(0,0,0,0.3)' }} className="anim">

        {/* Header */}
        <div style={{ padding:'20px 24px 0', flexShrink:0 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:16 }}>
            <div style={{ display:'flex', alignItems:'center', gap:12 }}>
              <div style={{ width:40, height:40, borderRadius:12, background:'linear-gradient(135deg,#071e2c,#207898)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <Diamond size={22} />
              </div>
              <div>
                <h2 style={{ fontSize:17, fontWeight:700, color:'var(--txt)' }}>Montar Proposta</h2>
                <p style={{ fontSize:12, color:'var(--muted)', marginTop:1 }}>Para: <strong>{contactName}</strong></p>
              </div>
            </div>
            <button onClick={()=>onClose()} style={{ padding:7, background:'var(--bg)', borderRadius:8, color:'var(--muted)', cursor:'pointer', border:'none' }}><X size={16}/></button>
          </div>

          {/* Steps */}
          <div style={{ display:'flex', gap:0, borderBottom:'1px solid var(--border)' }}>
            {[['select','1. Selecionar itens'],['preview','2. Revisar & Enviar']].map(([s,l],i)=>(
              <button key={s} onClick={()=>s==='preview'&&carrinho.length>0?setStep(s):setStep('select')}
                style={{ padding:'10px 18px', fontSize:13, fontWeight:600, background:'none', border:'none', borderBottom:`2px solid ${step===s?'var(--tq)':'transparent'}`, color:step===s?'var(--tq)':'var(--muted)', cursor:'pointer', transition:'all .15s', marginBottom:-1 }}>
                {l}
              </button>
            ))}
            {carrinho.length > 0 && (
              <div style={{ flex:1, display:'flex', justifyContent:'flex-end', alignItems:'center', paddingRight:4 }}>
                <span style={{ background:'var(--tq)', color:'#fff', borderRadius:20, padding:'2px 10px', fontSize:12, fontWeight:700 }}>{carrinho.length} item{carrinho.length>1?'s':''}</span>
              </div>
            )}
          </div>
        </div>

        {step === 'select' ? (
          <>
            {/* Tab bar */}
            <div style={{ display:'flex', gap:6, padding:'12px 24px 8px', flexShrink:0 }}>
              {['planos','vacinas'].map(t=>(
                <button key={t} onClick={()=>setTab(t)} className="btn btn-sm" style={{ background:tab===t?'var(--pet2)':'var(--bg2)', color:tab===t?'#fff':'var(--muted)', border:'none' }}>
                  {t==='planos'?'📋 Planos Vacinais':'💉 Vacinas Avulsas'}
                </button>
              ))}
            </div>

            {/* Item grid */}
            <div style={{ flex:1, overflowY:'auto', padding:'4px 24px 16px' }}>
              {loading ? <div style={{display:'flex',justifyContent:'center',padding:40}}><span className="spin"/></div> : (
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                  {(tab==='planos'?planos:vacinas.filter(v=>v.preco>0)).map(item => {
                    const inCart = carrinho.find(c=>c.id===item.id);
                    return (
                      <div key={item.id} onClick={()=>inCart?removeItem(item.id):addItem(item)}
                        style={{ padding:'14px 16px', borderRadius:12, border:`2px solid ${inCart?'var(--tq)':'var(--border)'}`, cursor:'pointer', background:inCart?'var(--tq4)':'#fff', transition:'all .13s', position:'relative' }}>
                        {inCart && <div style={{ position:'absolute', top:10, right:10, width:20, height:20, borderRadius:'50%', background:'var(--tq)', display:'flex', alignItems:'center', justifyContent:'center' }}><Check size={11} color="#fff" strokeWidth={3}/></div>}
                        <div style={{ fontWeight:600, fontSize:13.5, paddingRight:inCart?24:0 }}>{item.nome}</div>
                        {item.descricao && <div style={{ fontSize:11.5, color:'var(--muted)', marginTop:3, lineHeight:1.5 }}>{item.descricao}</div>}
                        {item.doses && !item.descricao && <div style={{ fontSize:11.5, color:'var(--muted)', marginTop:2 }}>{item.doses} dose{item.doses>1?'s':''}</div>}
                        <div style={{ fontWeight:700, color:inCart?'var(--tq2)':'var(--ok)', fontSize:15, marginTop:8 }}>R$ {item.preco?.toFixed(2)?.replace('.',',')}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer CTA */}
            <div style={{ padding:'14px 24px', borderTop:'1px solid var(--border)', display:'flex', gap:10, justifyContent:'flex-end', flexShrink:0 }}>
              <button onClick={()=>onClose()} className="btn btn-s btn-sm">Cancelar</button>
              <button onClick={()=>setStep('preview')} disabled={carrinho.length===0} className="btn btn-p btn-sm">
                Revisar proposta <ChevronRight size={14}/>
              </button>
            </div>
          </>
        ) : (
          <>
            <div style={{ flex:1, overflowY:'auto', padding:'16px 24px' }}>
              {/* Cart */}
              <div style={{ marginBottom:18 }}>
                <div style={{ fontSize:11, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:.8, marginBottom:10 }}>Itens selecionados</div>
                {carrinho.map(i=>(
                  <div key={i.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'9px 0', borderBottom:'1px solid var(--border)' }}>
                    <div>
                      <div style={{ fontWeight:600, fontSize:13.5 }}>{i.nome}</div>
                      {i.doses && <div style={{ fontSize:11.5, color:'var(--muted)' }}>{i.doses} dose{i.doses>1?'s':''}</div>}
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                      <span style={{ fontWeight:700, color:'var(--ok)' }}>R$ {i.preco?.toFixed(2)?.replace('.',',')}</span>
                      <button onClick={()=>removeItem(i.id)} style={{ padding:4, background:'var(--err2)', color:'var(--err)', borderRadius:6, border:'none', cursor:'pointer' }}><X size={12}/></button>
                    </div>
                  </div>
                ))}
                <button onClick={()=>setStep('select')} className="btn btn-g btn-sm" style={{ marginTop:10 }}>+ Adicionar mais itens</button>
              </div>

              {/* Options */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12, marginBottom:16 }}>
                <div className="field">
                  <label>Desconto (%)</label>
                  <input type="number" min="0" max="50" value={desconto} onChange={e=>setDesconto(e.target.value)} placeholder="0" />
                </div>
                <div className="field">
                  <label>Validade (dias)</label>
                  <input type="number" min="1" value={validade} onChange={e=>setValidade(e.target.value)} placeholder="7" />
                </div>
                <div style={{ display:'flex', flexDirection:'column', justifyContent:'flex-end' }}>
                  <div style={{ fontSize:11, color:'var(--muted)', marginBottom:4 }}>Valor final</div>
                  <div style={{ fontSize:22, fontWeight:700, color:'var(--ok)' }}>R$ {valFinal.toFixed(2).replace('.',',')}</div>
                  {discP > 0 && <div style={{ fontSize:11, color:'var(--muted)', textDecoration:'line-through' }}>R$ {valTotal.toFixed(2).replace('.',',')}</div>}
                </div>
              </div>
              <div className="field" style={{ marginBottom:16 }}>
                <label>Observações (opcional)</label>
                <textarea value={observacao} onChange={e=>setObservacao(e.target.value)} placeholder="Condições especiais, validade, observações para o cliente..." rows={2} style={{ resize:'vertical' }}/>
              </div>

              {/* Preview box */}
              <div style={{ background:'linear-gradient(135deg,#071e2c,#0d3d52)', borderRadius:12, padding:'16px 18px', display:'flex', alignItems:'center', gap:14 }}>
                <Diamond size={32} />
                <div style={{ flex:1 }}>
                  <div style={{ color:'#fff', fontWeight:700, fontSize:14 }}>PDF Pronto para Gerar</div>
                  <div style={{ color:'rgba(255,255,255,0.5)', fontSize:12, marginTop:2 }}>Proposta com logo Vittalis, tabela de itens, formas de pagamento, benefícios e validade</div>
                </div>
                <button onClick={gerarPDF} className="btn btn-sm" style={{ background:'var(--tq)', color:'#fff', flexShrink:0 }}>
                  <Printer size={13}/> Gerar PDF
                </button>
              </div>
            </div>

            <div style={{ padding:'14px 24px', borderTop:'1px solid var(--border)', display:'flex', gap:10, justifyContent:'flex-end', flexShrink:0 }}>
              <button onClick={gerarPDF} className="btn btn-s btn-sm"><Download size={13}/> Baixar PDF</button>
              <button onClick={sendChat} disabled={sending||carrinho.length===0} className="btn btn-p">
                {sending?<span className="spin" style={{width:14,height:14}}/>:<><Send size={13}/> Enviar resumo no chat</>}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
