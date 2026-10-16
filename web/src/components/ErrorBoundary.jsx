import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { erro: false }; }
  static getDerivedStateFromError() { return { erro: true }; }
  componentDidCatch(error, info) { console.error('Falha no painel:', error, info); }
  render() {
    if (!this.state.erro) return this.props.children;
    return <section className="fatal-error"><span>!</span><h2>Este módulo encontrou um problema</h2><p>Seus dados não foram apagados. Atualize o módulo ou volte ao início.</p><div><button onClick={() => this.setState({ erro:false })}>Tentar novamente</button><button className="primary" onClick={() => { location.hash = 'dashboard'; location.reload(); }}>Ir para visão geral</button></div></section>;
  }
}
