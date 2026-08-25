import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { clearAllOnboardingState } from './state';
import { Button } from '../components/ui/Button';

type ErrorBoundaryState = {
  hasError: boolean;
};

export class ErrorBoundary extends React.Component<React.PropsWithChildren, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false
  };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Error no controlado en el portal de onboarding.', error, info);
  }

  handleReset = () => {
    clearAllOnboardingState();
    window.location.assign(window.location.pathname);
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <main className="min-h-screen bg-surface px-4 py-16">
        <section className="mx-auto max-w-xl rounded-xl border border-borderLight bg-white p-6 text-center shadow-soft">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-errorSoft">
            <AlertTriangle className="h-6 w-6 text-red-700" />
          </div>
          <h1 className="mt-4 text-xl font-semibold text-dark">No se pudo cargar el portal</h1>
          <p className="mt-2 text-sm text-grayText">
            Ocurrió un error inesperado en esta sesión. Reinicie el expediente local e intente nuevamente.
          </p>
          <div className="mt-5">
            <Button type="button" onClick={this.handleReset}>
              Reiniciar expediente
            </Button>
          </div>
        </section>
      </main>
    );
  }
}
