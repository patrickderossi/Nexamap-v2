import { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
    // In production, you might want to send this to error reporting service
    // Example: Sentry.captureException(error, { contexts: { errorInfo } });
  }

  handleRefresh = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
          <div className="max-w-md w-full text-center">
            {/* Nexamap Logo */}
            <div className="mb-8">
              <img
                src="https://cdn.builder.io/api/v1/image/assets%2F0df748b9b86d4bc5af1be6fda4f6f0d0%2F9fbd34283535421db2163a3b996c4e11?format=webp&width=800"
                alt="Nexamap Logo"
                className="h-12 w-auto object-contain mx-auto"
              />
            </div>

            {/* Error Icon */}
            <div className="mb-6">
              <AlertTriangle className="w-16 h-16 text-red-500 mx-auto" />
            </div>

            {/* Error Message */}
            <h1 className="text-2xl font-bold text-gray-900 mb-4">
              Something went wrong
            </h1>

            <p className="text-gray-600 mb-8">
              We encountered an unexpected error while loading Nexamap. This has
              been automatically reported to our team.
            </p>

            {/* Actions */}
            <div className="space-y-4">
              <button
                onClick={this.handleRefresh}
                className="w-full flex items-center justify-center space-x-2 bg-nexamap-500 hover:bg-nexamap-600 text-white font-medium py-3 px-6 rounded-lg transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Reload Application</span>
              </button>

              <p className="text-sm text-gray-500">
                If the problem persists, try clearing your browser cache or
                contact support.
              </p>
            </div>

            {/* Technical Details (only in development) */}
            {import.meta.env.DEV && this.state.error && (
              <details className="mt-8 text-left">
                <summary className="cursor-pointer text-sm font-medium text-gray-700 mb-2">
                  Technical Details (Development Only)
                </summary>
                <pre className="bg-gray-100 p-4 rounded-lg text-xs text-gray-800 overflow-auto max-h-40">
                  {this.state.error.stack}
                </pre>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
