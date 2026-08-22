/* CPF — validação de verdade (dígito verificador), não só contagem.

   O LOGIN do VittaHub é o CPF. Antes o cadastro só conferia "tem 11 dígitos",
   então um número digitado errado criava uma conta em que ninguém entrava — e
   isso só aparecia no primeiro dia da pessoa, com ela parada na recepção.
   Espelha a mesma regra do VittaMed (src/lib/cpf.ts). */

export const apenasDigitos = (v) => String(v ?? '').replace(/\D/g, '');

export function cpfValido(v) {
  const d = apenasDigitos(v);
  if (d.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(d)) return false;      // 111.111.111-11 não é CPF
  const digito = (ate) => {
    let soma = 0;
    for (let i = 0; i < ate; i++) soma += Number(d[i]) * (ate + 1 - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return digito(9) === Number(d[9]) && digito(10) === Number(d[10]);
}

export const formatarCpf = (v) => {
  const d = apenasDigitos(v);
  return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : String(v ?? '');
};

// Mensagem que diz O QUE está errado — "CPF inválido" não ajuda quem digitou
// um número a mais e não percebeu.
export function erroCpf(v) {
  const d = apenasDigitos(v);
  if (!d) return 'Informe o CPF — é com ele que a pessoa entra no sistema.';
  if (d.length !== 11) {
    return d.length > 11
      ? `Esse CPF tem ${d.length} dígitos; CPF tem 11. Confira se sobrou algum número.`
      : `Esse CPF tem ${d.length} dígito(s); faltam ${11 - d.length} para completar 11.`;
  }
  if (!cpfValido(d)) return 'CPF não confere (o dígito verificador não bate). Confira no documento.';
  return null;
}
