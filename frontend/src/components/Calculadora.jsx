import React, { useState, useEffect, useCallback } from 'react';
import { Calculator, X } from 'lucide-react';

/* Calculadora flutuante — disponível em qualquer tela do CRM.
   Botão fixo no canto; abre um teclado simples com histórico do cálculo. */
export default function Calculadora() {
  const [open, setOpen] = useState(false);
  const [expr, setExpr] = useState('');
  const [res, setRes] = useState('');

  const calcular = useCallback((e) => {
    try {
      // só permite números e operadores — sem eval de código arbitrário
      const limpo = String(e).replace(/[^0-9+\-*/.%() ]/g, '');
      if (!limpo.trim()) { setRes(''); return; }
      // % vira /100 quando isolado
      // eslint-disable-next-line no-new-func
      const val = Function('"use strict";return (' + limpo.replace(/%/g, '/100') + ')')();
      setRes(val === undefined || val === null || Number.isNaN(val) ? '' : String(+(+val).toFixed(6)));
    } catch { setRes(''); }
  }, []);

  useEffect(() => { calcular(expr); }, [expr, calcular]);

  const press = (k) => {
    if (k === '=') { if (res !== '') setExpr(res); return; }
    if (k === 'C') { setExpr(''); setRes(''); return; }
    if (k === '⌫') { setExpr(p => p.slice(0, -1)); return; }
    setExpr(p => p + k);
  };

  const teclas = ['C','⌫','%','/','7','8','9','*','4','5','6','-','1','2','3','+','0','.','=',''];

  return (
    <>
      <button onClick={() => setOpen(o => !o)} title="Calculadora"
        style={{ position:'fixed', right:18, bottom:18, zIndex:900, width:46, height:46, borderRadius:'50%',
          background:'var(--tq, #00B8C0)', color:'#fff', border:'none', cursor:'pointer',
          boxShadow:'0 4px 14px rgba(0,0,0,.25)', display:'flex', alignItems:'center', justifyContent:'center' }}>
        {open ? <X size={20} /> : <Calculator size={20} />}
      </button>

      {open && (
        <div style={{ position:'fixed', right:18, bottom:74, zIndex:900, width:240, borderRadius:14,
          background:'var(--card,#fff)', border:'1px solid var(--border,#e2e8f0)', boxShadow:'0 10px 30px rgba(0,0,0,.22)', padding:12 }}>
          <div style={{ background:'var(--bg2,#f1f5f9)', borderRadius:9, padding:'8px 10px', marginBottom:10, minHeight:48 }}>
            <div style={{ fontSize:13, color:'var(--muted,#64748b)', minHeight:16, wordBreak:'break-all' }}>{expr || '0'}</div>
            <div style={{ fontSize:22, fontWeight:800, textAlign:'right', color:'var(--text,#0f172a)' }}>{res !== '' ? res : ' '}</div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:6 }}>
            {teclas.filter(t => t !== '').map((k, i) => {
              const isOp = ['/','*','-','+','='].includes(k);
              const isAct = ['C','⌫','%'].includes(k);
              const wide = k === '0';
              return (
                <button key={i} onClick={() => press(k)}
                  style={{ gridColumn: wide ? 'span 1' : undefined, padding:'11px 0', borderRadius:9, cursor:'pointer',
                    border:'none', fontSize:15, fontWeight:700,
                    background: k === '=' ? 'var(--tq,#00B8C0)' : isOp ? 'var(--tq3,#e6f7f8)' : isAct ? '#fde2e2' : 'var(--bg2,#f1f5f9)',
                    color: k === '=' ? '#fff' : isOp ? 'var(--tq2,#0E8C96)' : isAct ? '#c0392b' : 'var(--text,#0f172a)' }}>
                  {k}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
