// Envio de texto pelo WhatsApp da clínica (Z-API) — helper compartilhado.
export const zapiOk = () => !!(process.env.ZAPI_INSTANCE && process.env.ZAPI_TOKEN);

export async function zapiSendText(phone, message) {
  const { default: fetch } = await import('node-fetch');
  const headers = { 'Content-Type': 'application/json' };
  if (process.env.ZAPI_CLIENT_TOKEN) headers['Client-Token'] = process.env.ZAPI_CLIENT_TOKEN;
  let p = String(phone || '').replace(/\D/g, '');
  if (!p.startsWith('55')) p = `55${p}`;
  return fetch(`https://api.z-api.io/instances/${process.env.ZAPI_INSTANCE}/token/${process.env.ZAPI_TOKEN}/send-text`, {
    method: 'POST', headers,
    body: JSON.stringify({ phone: p, message }),
    signal: AbortSignal.timeout(15000),
  });
}
