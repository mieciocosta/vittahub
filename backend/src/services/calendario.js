import { query } from '../db/pool.js';

/* 💉 CALENDÁRIO VACINAL — fonte única do esquema (rede privada), espelhando o
   que está cadastrado no Vittasys. Usado pelo calendário de oportunidades
   (Lembretes) e pela carteira vacinal do paciente (chat e Fidelidade).
   A gestão edita os marcos em Lembretes → Calendário vacinal.            */
/* ALTERNATIVAS: "A ou B" na mesma posição quer dizer "uma OU outra" — a equipe
   escolhe na hora de marcar. Nasceu do pedido do master: o esquema trazia
   "Pneumo 15" fixo, mas a maioria das famílias fecha a Pneumocócica 20, e a
   atendente não tinha como registrar o que realmente foi aplicado.
   O primeiro nome da lista é o padrão que aparece na tela. */
const CALENDARIO_PADRAO = [
  { mes: 0,  nome: 'Nascimento', vacinas: 'BCG, Hepatite B' },
  { mes: 2,  nome: '2 meses',   vacinas: 'Hexavalente ou Hexacelular, Rotavírus, Pneumocócica 20 ou Pneumo 15 ou Pneumo 13, Meningo B' },
  { mes: 3,  nome: '3 meses',   vacinas: 'Meningo ACWY' },
  { mes: 4,  nome: '4 meses',   vacinas: 'Hexavalente (2ª) ou Pentacelular (2ª), Rotavírus (2ª), Pneumocócica 20 (2ª) ou Pneumo 15 (2ª) ou Pneumo 13 (2ª), Meningo B (2ª)' },
  { mes: 5,  nome: '5 meses',   vacinas: 'Meningo ACWY (2ª)' },
  { mes: 6,  nome: '6 meses',   vacinas: 'Hexavalente (3ª) ou Pentacelular (3ª), Rotavírus (3ª), Gripe' },
  { mes: 7,  nome: '7 meses',   vacinas: 'Meningo ACWY (3ª), Gripe (2ª dose)' },
  { mes: 9,  nome: '9 meses',   vacinas: 'Febre Amarela' },
  { mes: 12, nome: '12 meses',  vacinas: 'Tríplice Viral, Pneumocócica 20 (reforço) ou Pneumo 15 (reforço) ou Pneumo 13 (reforço), Meningo ACWY (reforço), Meningo B (reforço), Hepatite A' },
  { mes: 15, nome: '15 meses',  vacinas: 'DTPa (reforço), Varicela, Hepatite A (2ª), Poliomielite (reforço)' },
  { mes: 18, nome: '18 meses',  vacinas: 'Tríplice Viral (2ª) ou Varicela (2ª)' },
  { mes: 48, nome: '4 anos',    vacinas: 'DTPa (2º reforço), Poliomielite (2º reforço), Meningo ACWY (reforço)' },
  { mes: 60, nome: '5 anos',    vacinas: 'Atualização da caderneta e reforços' },
];

export { CALENDARIO_PADRAO };

// Cache curto do calendário configurado (evita ir ao banco a cada criança)
let calCache = { valor: null, em: 0 };
export function invalidarCacheCalendario(marcos) { calCache = { valor: marcos || null, em: marcos ? Date.now() : 0 }; }
export async function getCalendario() {
  if (calCache.valor && Date.now() - calCache.em < 60000) return calCache.valor;
  let lista = CALENDARIO_PADRAO;
  try {
    const { rows: [c] } = await query("SELECT valor FROM configuracoes WHERE chave = 'calendario_vacinal'");
    const salvo = c?.valor?.marcos;
    if (Array.isArray(salvo) && salvo.length) lista = salvo;
  } catch { /* mantém o padrão */ }
  calCache = { valor: lista, em: Date.now() };
  return lista;
}
