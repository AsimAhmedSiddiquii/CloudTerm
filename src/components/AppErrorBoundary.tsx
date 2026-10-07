import React from "react";

type AppErrorBoundaryProps = {
  children: React.ReactNode;
};

type AppErrorBoundaryState = {
  hasError: boolean;
};

export default class AppErrorBoundary extends React.Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("CloudTerm UI error", error, errorInfo);
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
          <button type="button" onClick={() => window.location.reload()}>
            Reload application
          </button>
        </section>
      </main>
    );
  }
}
