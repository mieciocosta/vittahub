import React from 'react';

/* 🛟 REDE DE SEGURANÇA DAS TELAS

   Captura o erro de render de uma tela e mostra um aviso legível em vez de
   derrubar o app inteiro (a temida "tela branca").

   Três coisas que a versão anterior não fazia e custaram caro (cobrança do
   master, 01/09: "o CRM está com problema... aparece tela branca"):

   1) Não SAÍA do erro. Uma vez quebrada, a caixa ficava presa mesmo depois de
      trocar de tela — parecia que o sistema inteiro tinha morrido. Agora ela
      se reseta sozinha quando a rota muda (`resetKey`).
   2) Não mostrava ONDE quebrou. Só a mensagem, sem a pilha. Agora tem o
      detalhe aberto e um botão de copiar, pra mandar pra mim no WhatsApp.
   3) Não protegia a moldura. O menu, o placar e a troca de usuário ficavam
      FORA da rede — e um erro lá branqueava tudo. Agora cada peça tem a sua
      (modo `discreto`, que só some da tela sem derrubar o resto). */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null, copiado: false };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    console.error('ErrorBoundary capturou:', error, info);
    this.setState({ info });
    // Guarda o último erro pra quem for investigar depois no console
    try { window.__vhUltimoErro = { msg: String(error?.message || error), pilha: error?.stack, quando: new Date().toISOString() }; } catch { /* ok */ }
  }
  componentDidUpdate(anterior) {
    // Trocou de tela: a rede se limpa e a próxima tela tem a chance de abrir
    if (this.state.error && anterior.resetKey !== this.props.resetKey) {
      this.setState({ error: null, info: null, copiado: false });
    }
  }
  texto() {
    const e = this.state.error;
    return [`Tela: ${this.props.nome || this.props.resetKey || '—'}`,
      `Erro: ${String(e?.message || e)}`,
      (e?.stack || '').split('\n').slice(0, 6).join('\n'),
      (this.state.info?.componentStack || '').split('\n').slice(0, 6).join('\n')].join('\n');
  }
  render() {
    if (!this.state.error) return this.props.children;

    /* Modo discreto: peça da moldura (menu, placar). Some sem derrubar a tela
       inteira — o atendimento continua funcionando. */
    if (this.props.discreto) {
      return (
        <div title={this.texto()}
          style={{ padding: '6px 10px', fontSize: 10.5, color: '#dc2626', background: '#fef2f2',
            border: '1px solid #fecaca', borderRadius: 8, margin: 6 }}>
          ⚠️ {this.props.nome || 'Um pedaço da tela'} não carregou. O resto do sistema segue normal.
        </div>
      );
    }

    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
        <div style={{ fontSize: 44, marginBottom: 12 }}>😕</div>
        <h2 style={{ fontSize: 19, marginBottom: 8, color: 'var(--txt)' }}>Algo deu errado nesta tela</h2>
        <p style={{ fontSize: 13.5, marginBottom: 18 }}>
          O resto do sistema continua funcionando — dá pra trocar de tela pelo menu.
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button onClick={() => window.location.reload()} className="btn btn-p">Recarregar página</button>
          <button className="btn btn-sm"
            style={{ background: 'var(--bg2)', color: 'var(--txt2)', border: '1.5px solid var(--border)' }}
            onClick={() => {
              try { navigator.clipboard.writeText(this.texto()); this.setState({ copiado: true }); } catch { /* ok */ }
            }}>
            {this.state.copiado ? '✅ Copiado' : '📋 Copiar o erro'}
          </button>
        </div>
        <pre style={{ marginTop: 18, fontSize: 11, color: 'var(--light)', whiteSpace: 'pre-wrap', textAlign: 'left',
          maxWidth: 640, margin: '18px auto 0', background: 'var(--bg2)', padding: 12, borderRadius: 10 }}>
          {this.texto()}
        </pre>
      </div>
    );
  }
}
