import { Component, ReactNode, Suspense } from "react";
import { QueryErrorResetBoundary } from "@tanstack/react-query";

interface AccountOverviewSuspenseBoundaryProps {
  children: ReactNode;
  fallback: ReactNode;
  errorFallback: (retry: () => void) => ReactNode;
}

export function AccountOverviewSuspenseBoundary({
  children,
  fallback,
  errorFallback
}: AccountOverviewSuspenseBoundaryProps) {
  return (
    <QueryErrorResetBoundary>
      {({ reset }) => (
        <AccountOverviewErrorBoundary onReset={reset} fallback={errorFallback}>
          <Suspense fallback={fallback}>{children}</Suspense>
        </AccountOverviewErrorBoundary>
      )}
    </QueryErrorResetBoundary>
  );
}

interface AccountOverviewErrorBoundaryProps {
  children: ReactNode;
  fallback: (retry: () => void) => ReactNode;
  onReset: () => void;
}

interface AccountOverviewErrorBoundaryState {
  error: unknown;
}

class AccountOverviewErrorBoundary extends Component<
  AccountOverviewErrorBoundaryProps,
  AccountOverviewErrorBoundaryState
> {
  state: AccountOverviewErrorBoundaryState = {
    error: null
  };

  static getDerivedStateFromError(error: unknown) {
    return { error };
  }

  private retry = () => {
    this.props.onReset();
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      return this.props.fallback(this.retry);
    }

    return this.props.children;
  }
}
