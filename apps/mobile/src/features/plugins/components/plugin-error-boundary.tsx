import { Component, type ReactNode } from 'react';

interface PluginErrorBoundaryProps {
  /** Changing the key clears a caught error, e.g. when the plugin reloads. */
  readonly resetKey: unknown;
  readonly onError: (error: unknown) => void;
  readonly fallback: (retry: () => void) => ReactNode;
  readonly children?: ReactNode;
}

interface PluginErrorBoundaryState {
  readonly failed: boolean;
}

/** Keeps a failing plugin component from unmounting the host screen around it. */
export class PluginErrorBoundary extends Component<PluginErrorBoundaryProps, PluginErrorBoundaryState> {
  state: PluginErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): PluginErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: unknown): void {
    this.props.onError(error);
  }

  componentDidUpdate(previous: PluginErrorBoundaryProps): void {
    if (previous.resetKey !== this.props.resetKey && this.state.failed) this.setState({ failed: false });
  }

  render(): ReactNode {
    return this.state.failed ? this.props.fallback(() => this.setState({ failed: false })) : this.props.children;
  }
}
