/* ─── 🧹 useApi ANTIGO — DESATIVADO ──────────────────────────────────────────
   Aposentado (pedido do master: retirar o que não é usado, deixando comentado).

   Por que saiu: existiam DOIS `useApi` no projeto. O que a aplicação inteira
   usa é o de `context/AuthContext.jsx`; este aqui não era importado em lugar
   nenhum e ainda dependia de um `apiFetch` que o AuthContext não exporta mais —
   ou seja, se alguém importasse por engano, quebrava na hora.
   Dois helpers com o mesmo nome é convite pro erro: quem fosse mexer podia
   editar o arquivo errado e não entender por que nada mudava.                 */

// import { useAuth } from '../context/AuthContext.jsx';
// import { apiFetch } from '../context/AuthContext.jsx';
//
// export function useApi() {
//   const { token } = useAuth();
//   return {
//     get: (path) => apiFetch(path, { method: 'GET' }, token),
//     post: (path, body) => apiFetch(path, { method: 'POST', body: JSON.stringify(body) }, token),
//     put: (path, body) => apiFetch(path, { method: 'PUT', body: JSON.stringify(body) }, token),
//     patch: (path, body) => apiFetch(path, { method: 'PATCH', body: body !== undefined ? JSON.stringify(body) : undefined }, token),
//     del: (path) => apiFetch(path, { method: 'DELETE' }, token),
//     upload: (path, formData) => fetch(`/api${path}`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: formData }).then(r => r.json()),
//   };
// }
