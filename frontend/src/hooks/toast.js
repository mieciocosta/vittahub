// Toast simples e global — mostra um aviso flutuante no rodapé por alguns segundos.
// (Antes 'Toast' era usado no chat sem nunca ter sido definido; isto resolve.)
export const Toast = {
  show(msg, type = 'info') {
    try {
      if (!msg) return;
      const bg = type === 'error' ? '#dc2626' : type === 'success' ? '#16a34a' : type === 'info' ? '#0E8C96' : '#1B4965';
      const el = document.createElement('div');
      el.textContent = String(msg);
      el.style.cssText = [
        'position:fixed', 'left:50%', 'bottom:26px', 'transform:translateX(-50%) translateY(8px)',
        'z-index:99999', `background:${bg}`, 'color:#fff', 'padding:11px 18px', 'border-radius:11px',
        'font-size:13.5px', 'font-weight:600', 'line-height:1.4', 'max-width:92vw', 'text-align:center',
        'box-shadow:0 8px 26px rgba(0,0,0,.28)', 'opacity:0', 'transition:opacity .2s ease, transform .2s ease',
        'font-family:DM Sans, system-ui, sans-serif',
      ].join(';');
      document.body.appendChild(el);
      requestAnimationFrame(() => { el.style.opacity = '1'; el.style.transform = 'translateX(-50%) translateY(0)'; });
      setTimeout(() => {
        el.style.opacity = '0'; el.style.transform = 'translateX(-50%) translateY(8px)';
        setTimeout(() => el.remove(), 250);
      }, type === 'error' ? 4500 : 3000);
    } catch { /* nunca deixa o aviso quebrar a ação */ }
  },
};

export default Toast;
