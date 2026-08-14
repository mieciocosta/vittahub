import express from 'express';
import { auth } from '../middleware/auth.js';

/* ─── Ponte com o VITTASYS ────────────────────────────────────────────────────
   O Vittasys é o sistema onde a clínica registra o paciente e o esquema vacinal
   aplicado. Puxar de lá evita o pior desperdício do painel de Fidelidade: a
   equipe redigitar nascimento e doses que já existem noutro sistema — e errar.

   Mesma arquitetura da ponte do VittaMed: quem chama o Vittasys é ESTE
   servidor, com o token compartilhado. O navegador nunca vê a credencial.
   Só leitura: aplicar dose continua sendo no sistema de origem, para não criar
   duas verdades sobre a mesma criança.

   Enquanto VITTASYS_API_URL e INTEGRACAO_TOKEN não estiverem no ambiente, todo
   endpoint responde `configurado: false` com um aviso em português — em vez de
   falhar em silêncio e parecer defeito. */

const r = express.Router();

const configurado = () =>
  !!(process.env.VITTASYS_API_URL && process.env.INTEGRACAO_TOKEN && process.env.INTEGRACAO_TOKEN.length >= 16);

const AVISO = 'A ligação com o Vittasys ainda não foi ligada. Não é um defeito: falta o Dr. Miécio cadastrar o endereço da API do Vittasys e a chave de integração no Railway.';

const naoConfigurado = (extra = {}) => ({
  ok: false, configurado: false, aviso: AVISO,
  falta: [
    !process.env.VITTASYS_API_URL ? 'VITTASYS_API_URL (endereço da API do Vittasys)' : null,
    (!process.env.INTEGRACAO_TOKEN || process.env.INTEGRACAO_TOKEN.length < 16)
      ? 'INTEGRACAO_TOKEN (chave compartilhada, 16+ caracteres, igual nos dois sistemas)' : null,
  ].filter(Boolean),
  ...extra,
});

// Chamada ao Vittasys com timeout — um sistema lento não pode travar o CRM
async function chamar(caminho) {
  const { default: fetch } = await import('node-fetch');
  const base = String(process.env.VITTASYS_API_URL).replace(/\/+$/, '');
  const vr = await fetch(`${base}${caminho}`, {
    headers: { 'x-integracao-token': process.env.INTEGRACAO_TOKEN },
    signal: AbortSignal.timeout(15000),
  });
  if (!vr.ok) {
    const txt = await vr.text().catch(() => '');
    throw new Error(`Vittasys respondeu ${vr.status}${txt ? `: ${txt.slice(0, 120)}` : ''}`);
  }
  return vr.json();
}

// GET /api/extras/vittasys/paciente?telefone=…  |  ?cpf=…  |  ?nome=…
// Devolve o que o CRM precisa: nascimento, responsável e doses já aplicadas.
r.get('/paciente', auth, async (req, res) => {
  if (!configurado()) return res.json(naoConfigurado({ paciente: null }));
  const tel = String(req.query.telefone || '').replace(/\D/g, '');
  const cpf = String(req.query.cpf || '').replace(/\D/g, '');
  const nome = String(req.query.nome || '').trim();
  if (!tel && !cpf && !nome) return res.status(400).json({ error: 'Informe telefone, CPF ou nome.' });
  const qs = new URLSearchParams();
  if (tel) qs.set('telefone', tel);
  if (cpf) qs.set('cpf', cpf);
  if (nome) qs.set('nome', nome);
  try {
    const d = await chamar(`/api/integracao/paciente?${qs}`);
    // Normaliza: o CRM não deve depender do formato exato de campo do Vittasys
    const p = d?.paciente || d || {};
    res.json({
      ok: true, configurado: true,
      paciente: {
        nome: p.nome || p.paciente || null,
        nascimento: (p.nascimento || p.data_nascimento || '').toString().slice(0, 10) || null,
        cpf: p.cpf || null,
        responsavel: p.responsavel || p.mae || p.responsavel_nome || null,
        telefone: p.telefone || p.celular || null,
        doses: Array.isArray(p.doses || d?.doses) ? (p.doses || d.doses).map(x => ({
          vacina: x.vacina || x.nome || null,
          data: (x.data || x.data_aplicacao || '').toString().slice(0, 10) || null,
          lote: x.lote || null,
        })) : [],
      },
    });
  } catch (err) {
    res.json({ ok: false, configurado: true, erro: `Não consegui falar com o Vittasys. ${err.message}`, paciente: null });
  }
});

// Teste da ponte — o master confere se está de pé sem precisar de um paciente
r.get('/status', auth, async (req, res) => {
  if (req.user?.role !== 'master') return res.status(403).json({ error: 'Só o master testa a ponte.' });
  if (!configurado()) return res.json(naoConfigurado());
  try {
    await chamar('/api/integracao/status');
    res.json({ ok: true, configurado: true, mensagem: 'Ponte com o Vittasys respondendo.' });
  } catch (err) {
    res.json({ ok: false, configurado: true, erro: err.message });
  }
});

export default r;
