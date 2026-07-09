import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Calculator } from 'lucide-react';

/* Calculadora — botão na barra do chat (ao lado do anexar). Abre um teclado
   simples num popover acima do botão. Avaliação restrita a números/operadores. */
export default function Calculadora() {
  const [open, setOpen] = useState(false);
  const [expr, setExpr] = useState('');
  const [res, setRes] = useState('');
  const ref = useRef(null);

  const calcular = useCallback((e) => {
    try {
      const limpo = String(e).replace(/[^0-9+\-*/.%() ]/g, '');
      if (!limpo.trim()) { setRes(''); return; }
      // eslint-disable-next-line no-new-func
      const val = Function('"use strict";return (' + limpo.replace(/%/g, '/100') + ')')();
      setRes(val === undefined || val === null || Number.isNaN(val) ? '' : String(+(+val).toFixed(6)));
    } catch { setRes(''); }
  }, []);
  useEffect(() => { calcular(expr); }, [expr, calcular]);

  // Fecha ao clicar fora
  useEffect(() => {
    if (!open) return;
    const fn = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, [open]);

  const press = (k) => {
    if (k === '=') { if (res !== '') setExpr(res); return; }
    if (k === 'C') { setExpr(''); setRes(''); return; }
    if (k === '⌫') { setExpr(p => p.slice(0, -1)); return; }
    setExpr(p => p + k);
  };
  const teclas = ['C','⌫','%','/','7','8','9','*','4','5','6','-','1','2','3','+','0','.','='];

  return (
    <div ref={ref} style={{ position:'relative', display:'inline-flex' }}>
      <button onClick={() => setOpen(o => !o)} title="Calculadora"
        className="btn btn-ico tb-ico-color" style={{ '--ic':'#16a34a', background: open ? '#16a34a' : 'rgba(22,163,74,.13)', color: open ? '#fff' : '#16a34a' }}>
        <Calculator size={17} />
      </button>
      {open && (
        <div style={{ position:'absolute', bottom:42, left:0, zIndex:950, width:236, borderRadius:14,
          background:'var(--card,#fff)', border:'1px solid var(--border,#e2e8f0)', boxShadow:'0 10px 30px rgba(0,0,0,.22)', padding:12 }}>
          <div style={{ background:'var(--bg2,#f1f5f9)', borderRadius:9, padding:'8px 10px', marginBottom:10, minHeight:46 }}>
            <div style={{ fontSize:13, color:'var(--muted,#64748b)', minHeight:16, wordBreak:'break-all' }}>{expr || '0'}</div>
            <div style={{ fontSize:21, fontWeight:800, textAlign:'right', color:'var(--text,#0f172a)' }}>{res !== '' ? res : ' '}</div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:6 }}>
            {teclas.map((k, i) => {
              const isOp = ['/','*','-','+','='].includes(k);
              const isAct = ['C','⌫','%'].includes(k);
              return (
                <button key={i} onClick={() => press(k)}
                  style={{ padding:'10px 0', borderRadius:9, cursor:'pointer', border:'none', fontSize:15, fontWeight:700,
                    background: k === '=' ? 'var(--tq,#00B8C0)' : isOp ? 'var(--tq3,#e6f7f8)' : isAct ? '#fde2e2' : 'var(--bg2,#f1f5f9)',
                    color: k === '=' ? '#fff' : isOp ? 'var(--tq2,#0E8C96)' : isAct ? '#c0392b' : 'var(--text,#0f172a)' }}>
                  {k}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
