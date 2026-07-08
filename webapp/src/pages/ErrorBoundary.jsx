import React from 'react';

// Evita que un error de render de una página deje la app en blanco (y, sobre
// todo, que tape el candado de prueba vencida, que se renderiza aparte).
export default class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error('[SPA] error de render:', error, info); }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 40, textAlign: 'center', color: '#5a6b7c' }}>
          <p>No se pudo mostrar esta sección.</p>
          <button className="btn" onClick={() => window.location.reload()}>Recargar</button>
        </div>
      );
    }
    return this.props.children;
  }
}
