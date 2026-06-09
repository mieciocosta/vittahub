import React, { useState, useEffect, useCallback } from 'react';
import { Smartphone, Wifi, WifiOff, RefreshCw, CheckCircle, AlertCircle, Loader } from 'lucide-react';
import { useApi, useAuth } from '../context/AuthContext.jsx';

const WA_GREEN = '#25D366';

export default function WhatsApp() {
  const api = useApi();
  const { isMaster } = useAuth();
  const [status, setStatus] = useState('loading'); // loading | connected | disconnected | qrcode | error | not_configured
  const [qrcode, setQrcode] = useState(null);
  const [message, setMessage] = useState('');
  const [polling, setPolling] = useState(false);
  const [creating, setCreating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [pollInterval, setPollInterval] = useState(null);

  const checkStatus = useCallback(async () => {
    try {
      const data = await api.get('/inbox/whatsapp/status');
      if (data.connected) {
        setStatus('connected');
        setQrcode(null);
        stopPolling();
      } else if (data.status === 'not_configured') {
        setStatus('not_configured');
        setMessage(data.message);
      } else {
        setStatus('disconnected');
      }
    } catch (e) {
      setStatus('error');
      setMessage(e.message);
    }
  }, [api]);

  const stopPolling = useCallback(() => {
    setPollInterval(prev => { if (prev) clearInterval(prev); return null; });
    setPolling(false);
  }, []);

  const startPolling = useCallback(() => {
    if (polling) return;
    setPolling(true);
    const iv = setInterval(async () => {
      try {
        const data = await api.get('/inbox/whatsapp/status');
        if (data.connected) {
          setStatus('connected');
          setQrcode(null);
          clearInterval(iv);
          setPolling(false);
        }
      } catch {}
    }, 4000);
    setPollInterval(iv);
  }, [api, polling]);

  useEffect(() => {
    checkStatus();
    return () => stopPolling();
  }, []);

  const getQR = async () => {
    setRefreshing(true);
    setStatus('loading');
    try {
      // Try create instance first (idempotent)
      try { await api.post('/inbox/whatsapp/create-instance', {}); } catch {}
      // Get QR
      const data = await api.get('/inbox/whatsapp/qrcode');
      if (data.connected || data.status === 'open') {
        setStatus('connected');
      } else if (data.qrcode) {
        setQrcode(data.qrcode);
        setStatus('qrcode');
        startPolling(); // auto-detect when user scans
      } else {
        setStatus('error');
        setMessage(JSON.stringify(data));
      }
    } catch (e) {
      setStatus('error');
      setMessage(e.message);
    }
    setRefreshing(false);
  };

  const disconnect = async () => {
    if (!confirm('Desconectar o WhatsApp?')) return;
    try {
      await api.post('/inbox/whatsapp/disconnect', {});
      setStatus('disconnected');
      setQrcode(null);
      stopPolling();
    } catch (e) { alert(e.message); }
  };

  if (!isMaster) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
        <Smartphone size={40} style={{ opacity: .3, marginBottom: 12 }} />
        <p>Acesso restrito ao Master.</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '28px', maxWidth: 720, margin: '0 auto' }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 30, fontWeight: 700 }}>WhatsApp</h1>
        <p style={{ color: 'var(--muted)', fontSize: 13.5, marginTop: 3 }}>
          Conecte o número da Vittalis Saúde para receber mensagens no Inbox
        </p>
      </div>

      {/* Status card */}
      <div className="card" style={{ padding: '24px', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: status === 'connected' ? '#dcfce7' : '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Smartphone size={26} color={status === 'connected' ? WA_GREEN : 'var(--muted)'} />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 17, display: 'flex', alignItems: 'center', gap: 8 }}>
              WhatsApp Vittalis Saúde
              {status === 'connected' && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#dcfce7', color: '#166534', borderRadius: 20, padding: '2px 10px', fontSize: 12, fontWeight: 700 }}><CheckCircle size={11}/>Conectado</span>}
              {status === 'disconnected' && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#fef2f2', color: '#991b1b', borderRadius: 20, padding: '2px 10px', fontSize: 12, fontWeight: 700 }}><WifiOff size={11}/>Desconectado</span>}
              {status === 'qrcode' && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#fffbeb', color: '#92400e', borderRadius: 20, padding: '2px 10px', fontSize: 12, fontWeight: 700 }}>⏳ Aguardando leitura</span>}
              {(status === 'loading') && <span className="spin" style={{ width: 14, height: 14 }} />}
            </div>
            <div style={{ color: 'var(--muted)', fontSize: 13, marginTop: 3 }}>
              {status === 'connected' && 'Mensagens sendo recebidas no Inbox automaticamente'}
              {status === 'disconnected' && 'Clique em "Conectar WhatsApp" para gerar o QR Code'}
              {status === 'qrcode' && 'Escaneie o QR Code no WhatsApp do celular da clínica'}
              {status === 'not_configured' && 'Evolution API não configurada nas variáveis de ambiente'}
              {status === 'loading' && 'Verificando conexão...'}
              {status === 'error' && `Erro: ${message}`}
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 10 }}>
          {(status === 'disconnected' || status === 'error') && (
            <button onClick={getQR} disabled={refreshing} className="btn btn-p" style={{ background: WA_GREEN, boxShadow: '0 4px 14px rgba(37,211,102,.3)' }}>
              {refreshing ? <span className="spin" style={{ width: 15, height: 15, borderColor: 'rgba(255,255,255,.3)', borderTopColor: '#fff' }} /> : <Smartphone size={15} />}
              Conectar WhatsApp
            </button>
          )}
          {status === 'qrcode' && (
            <button onClick={getQR} disabled={refreshing} className="btn btn-s">
              <RefreshCw size={14} /> Novo QR Code
            </button>
          )}
          {status === 'connected' && (
            <>
              <button onClick={checkStatus} className="btn btn-s btn-sm"><RefreshCw size={13} /> Verificar status</button>
              <button onClick={disconnect} className="btn btn-d btn-sm">Desconectar</button>
            </>
          )}
          {status === 'not_configured' && (
            <a href="https://railway.app" target="_blank" rel="noreferrer" className="btn btn-s">
              Configurar no Railway →
            </a>
          )}
        </div>
      </div>

      {/* QR Code display */}
      {status === 'qrcode' && qrcode && (
        <div className="card anim" style={{ padding: '32px', textAlign: 'center', marginBottom: 20 }}>
          <div style={{ marginBottom: 20 }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 6 }}>Escaneie o QR Code</h2>
            <p style={{ color: 'var(--muted)', fontSize: 14 }}>Abra o WhatsApp no celular da clínica e escaneie</p>
          </div>

          {/* QR Code image */}
          <div style={{ display: 'inline-block', padding: 16, background: '#fff', borderRadius: 16, border: '3px solid #25D366', boxShadow: '0 8px 32px rgba(37,211,102,.2)', marginBottom: 20 }}>
            <img src={qrcode} alt="QR Code WhatsApp" style={{ width: 220, height: 220, display: 'block' }}
              onError={e => {
                // If base64 string without prefix, add it
                if (qrcode && !qrcode.startsWith('data:')) {
                  e.target.src = `data:image/png;base64,${qrcode}`;
                }
              }}
            />
          </div>

          {/* Instructions */}
          <div style={{ background: 'var(--bg)', borderRadius: 12, padding: '16px 20px', textAlign: 'left', maxWidth: 400, margin: '0 auto' }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, color: 'var(--txt2)' }}>Como escanear:</div>
            {[
              ['Android', 'Menu (3 pontos) → Aparelhos conectados → Conectar aparelho'],
              ['iPhone', 'Configurações → Aparelhos conectados → Conectar aparelho'],
            ].map(([device, step]) => (
              <div key={device} style={{ display: 'flex', gap: 8, marginBottom: 7, fontSize: 13, color: 'var(--muted)' }}>
                <span style={{ fontWeight: 700, color: 'var(--txt2)', minWidth: 60 }}>{device}:</span>
                <span>{step}</span>
              </div>
            ))}
          </div>

          {polling && (
            <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--muted)', fontSize: 13 }}>
              <span className="spin" style={{ width: 14, height: 14 }} />
              Aguardando leitura... (verificando a cada 4 segundos)
            </div>
          )}
        </div>
      )}

      {/* Connected info */}
      {status === 'connected' && (
        <div className="card anim" style={{ padding: '20px 24px', background: 'linear-gradient(135deg, #f0fdf4, #dcfce7)', border: '1.5px solid #86efac' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <CheckCircle size={22} color="#16a34a" />
            <div>
              <div style={{ fontWeight: 700, color: '#15803d', fontSize: 15 }}>WhatsApp conectado e funcionando!</div>
              <div style={{ color: '#166534', fontSize: 13, marginTop: 2 }}>
                Toda mensagem recebida aparece automaticamente no Inbox do VittaHub.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Setup guide - only when not configured */}
      {status === 'not_configured' && (
        <div className="card" style={{ padding: '24px' }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>Como configurar a Evolution API</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              ['1', 'No Railway, acesse o serviço evolution-api'],
              ['2', 'Vá em Variables → Raw Editor'],
              ['3', 'Adicione: AUTHENTICATION_API_KEY=sua_chave'],
              ['4', 'Adicione: SERVER_URL=https://sua-evolution.up.railway.app'],
              ['5', 'No vittahub-backend, adicione EVOLUTION_API_URL e EVOLUTION_API_KEY'],
              ['6', 'Volte aqui e clique em "Conectar WhatsApp"'],
            ].map(([n, text]) => (
              <div key={n} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--tq)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, flexShrink: 0 }}>{n}</div>
                <span style={{ fontSize: 13.5, color: 'var(--txt2)', lineHeight: 1.6, paddingTop: 3 }}>{text}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
