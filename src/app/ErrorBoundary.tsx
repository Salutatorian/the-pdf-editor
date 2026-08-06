import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Frame, FramePanel } from '@/components/frame';

export type ErrorBoundaryProps = {
  children: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
};

type ErrorBoundaryState = {
  error: Error | null;
};

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('pdf_editor error boundary:', error, info.componentStack);
  }

  private handleReset = (): void => {
    this.setState({ error: null });
    this.props.onReset?.();
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    const title = this.props.fallbackTitle ?? 'Something went wrong';

    return (
      <div
        role="alert"
        className="flex h-full items-center justify-center bg-background p-6 text-foreground"
      >
        <Frame className="w-full max-w-md">
          <FramePanel className="space-y-4 p-5">
            <div>
              <h1 className="text-base font-semibold tracking-tight">{title}</h1>
              <p className="mt-2 text-sm break-words text-muted-foreground">
                {error.message || 'An unexpected error occurred.'}
              </p>
            </div>
            <Button size="sm" onClick={this.handleReset}>
              Reset
            </Button>
          </FramePanel>
        </Frame>
      </div>
    );
  }
}
