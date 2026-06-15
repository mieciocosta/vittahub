import React from 'react';

// Captura erros de render de uma tela e mostra um aviso recuperável em vez de
// derrubar o app inteiro (tela branca). O Sidebar/menu continuam funcionando.
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    console.error('ErrorBoundary capturou:', error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 48, textAlign: 'center', color: 'var(--muted)' }}>
          <div style={{ fontSize: 44, marginBottom: 12 }}>😕</div>
          <h2 style={{ fontSize: 19, marginBottom: 8, color: 'var(--txt)' }}>Algo deu errado nesta tela</h2>
          <p style={{ fontSize: 13.5, marginBottom: 18 }}>Recarregue a página. Se o erro continuar, avise a equipe técnica.</p>
          <button onClick={() => window.location.reload()} className="btn btn-p">Recarregar página</button>
          <pre style={{ marginTop: 18, fontSize: 11, color: 'var(--light)', whiteSpace: 'pre-wrap', textAlign: 'left', maxWidth: 620, margin: '18px auto 0' }}>
            {String(this.state.error?.message || this.state.error)}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}
