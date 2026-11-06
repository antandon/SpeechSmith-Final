import React from 'react';
import { AlertTriangle } from 'lucide-react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

// Catches render errors from a bad/unexpected API response shape so one
// malformed field shows a small fallback instead of blanking the whole app.
class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Unhandled error in component tree:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="flex items-center gap-2 p-6 text-center justify-center text-gray-500 border rounded-lg bg-gray-50">
            <AlertTriangle className="h-4 w-4 text-yellow-500 shrink-0" />
            <span>Something went wrong showing this section. Try refreshing the page.</span>
          </div>
        )
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
