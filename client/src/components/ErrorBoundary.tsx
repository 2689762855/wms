import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ textAlign: 'center', padding: 40, color: '#ff4d4f' }}>
          <p>页面加载出错</p>
          <p style={{ fontSize: 12, color: '#999' }}>{this.state.error?.message}</p>
          <button onClick={() => { this.setState({ hasError: false, error: null }); window.location.reload(); }}
            style={{ marginTop: 12, padding: '6px 16px', border: '1px solid #d9d9d9', borderRadius: 6, background: '#fff' }}>
            重新加载
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
