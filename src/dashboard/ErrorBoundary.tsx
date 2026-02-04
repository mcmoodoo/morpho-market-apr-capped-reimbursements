import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError && this.state.error) {
      return (
        <div style={{ padding: "1.5rem", fontFamily: "system-ui", maxWidth: "600px", margin: "0 auto" }}>
          <h2 style={{ color: "#c00" }}>Dashboard error</h2>
          <pre style={{ background: "#f5f5f5", padding: "1rem", overflow: "auto", fontSize: "13px" }}>
            {this.state.error.message}
          </pre>
          <p style={{ color: "#666", marginTop: "1rem" }}>
            Open the browser console (F12) for details. Ensure the API is running: <code>bun run api</code>
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}
