import React from "react";

type AppErrorBoundaryProps = {
  children: React.ReactNode;
};

type AppErrorBoundaryState = {
  hasError: boolean;
  errorMessage: string;
};

export default class AppErrorBoundary extends React.Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = { hasError: false, errorMessage: "" };

  static getDerivedStateFromError(): Partial<AppErrorBoundaryState> {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("CloudTerm UI error", error, errorInfo);
    this.setState({ errorMessage: error.message || String(error) });
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <main className="error-boundary" role="alert">
        <section className="error-boundary-card">
          <div className="error-boundary-mark" aria-hidden="true">
            !
          </div>
          <p className="eyebrow">CloudTerm</p>
          <h1>Something went wrong</h1>
          <p className="error-boundary-copy">
            The workspace could not be rendered. Your saved connections and vault data are
            still stored locally.
          </p>
          {this.state.errorMessage && (
            <pre className="error-boundary-details">{this.state.errorMessage}</pre>
          )}
          <button type="button" onClick={() => window.location.reload()}>
            Reload application
          </button>
        </section>
      </main>
    );
  }
}
