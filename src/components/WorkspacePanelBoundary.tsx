import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { name: string; children: (retried: boolean) => ReactNode };
type State = { error: Error | null; retried: boolean };

// Keep a panel failure below App, which owns the imported data and ion draft.
export class WorkspacePanelBoundary extends Component<Props, State> {
  state: State = { error: null, retried: false };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`${this.props.name} panel failed`, error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children(this.state.retried);
    return <section className="workspace-section" role="alert">
      <h2>{this.props.name} could not be displayed</h2>
      <p>Your imported data and ion list are still available. You can save your project above or retry this panel without reloading the page.</p>
      <button type="button" className="secondary-button" onClick={() => this.setState({ error: null, retried: true })}>Retry {this.props.name}</button>
      <details><summary>Error details</summary><pre>{this.state.error.message}</pre></details>
    </section>;
  }
}
