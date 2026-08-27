# Versão 2.4.0 — 27/08/2026

Fechamento do dia (tudo já no `main`):

- **Carteira de Leads** (só master): filtro por mês, por dia e por dia da semana,
  período livre, PDF e Excel. Fechamento lido também **nas mensagens** do cliente.
- **Menu enxuto**: cada seção com um tipo de coisa só; Relatórios passa a ter
  somente relatório.
- **Transferiu, sumiu**: a conversa some de vez pra quem passou adiante — vale
  também pra supervisora e pra quem tem `ve_tudo`.
- **Carteira da Fidelidade fechada**: os clientes da Poliana não aparecem pras
  demais em nenhuma tela (conversas, Clientes, Funil, Follow-up, Recuperação e busca).
- **Carimbo de versão**: `GET /api/versao` (sem login) e o rodapé do menu mostram
  qual código está no ar.

## Como conferir se subiu
1. Abrir `<backend>/api/versao` — precisa responder e o `minutos_no_ar` tem que ser baixo.
2. No rodapé do menu (master): "Tela publicada" com a hora de hoje.
