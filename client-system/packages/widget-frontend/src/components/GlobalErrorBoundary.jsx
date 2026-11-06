import { useChatStore } from '@stores/chatStore';
import { Component } from 'react';
import { generateUUID } from '@/utils/uuid';
import ErrorWidget from './ErrorWidget';

/**
 * GlobalErrorBoundary - Catches runtime errors in the component tree
 *
 * Features:
 * - Environment-aware rendering (Dev vs Prod)
 * - Prevents White Screen of Death (WSOD)
 * - Uses ErrorWidget for consistent UI
 */
class GlobalErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      referenceId: this._generateUUID(), // Pre-generate for potential configErrors
    };
  }

  _generateUUID() {
    return generateUUID();
  }

  static getDerivedStateFromError(error) {
    // Return the update to state, including hasError and the error object
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // Log error details
    this.setState({ errorInfo });
    this._reportError(error, errorInfo);

    // Notify the store about the runtime error so the widget button can react
    setTimeout(() => {
      useChatStore.getState().setRuntimeError(error);
    }, 0);
  }

  _reportError(error, errorInfo = null) {
    const isDev = import.meta.env.DEV;
    if (isDev) return;

    const { backendUrl, clientId } = this.props;
    if (!backendUrl) return;

    // Deduplicate: skip if same error already reported in this session
    const fingerprint = `widget_err:${error.name}:${error.message}`;
    try {
      if (sessionStorage.getItem(fingerprint)) return;
      sessionStorage.setItem(fingerprint, '1');
    } catch {
      /* noop */
    }

    const baseUrl = backendUrl.replace(/\/$/, '');
    const reportUrl = `${baseUrl}/api/report-error`;

    fetch(reportUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Client-Id': clientId || ''
      },
      body: JSON.stringify({
        clientId: clientId || 'unknown',
        referenceId: this.state.referenceId,
        error: {
          message: error.message,
          name: error.name,
          stack: error.stack,
          componentStack: errorInfo?.componentStack,
        },
        url: window.location.href,
        timestamp: new Date().toISOString(),
      }),
    }).catch(() => {
      try {
        sessionStorage.removeItem(fingerprint);
      } catch {
        /* noop */
      }
    });
  }

  handleClose = () => {
    // Optional: Attempt to recover or just close the widget if wrapped around inner content
    // For a global wrapper, we might not be able to "close", but we can reset state
    // this.setState({ hasError: false, error: null, errorInfo: null });

    // If passed an onClose prop (e.g., from ChatWidget), call it
    if (this.props.onClose) {
      this.props.onClose();
    }
  };

  render() {
    const isDev = import.meta.env.DEV;

    // Check if either a React runtime error or an external config error exists
    const displayError = this.state.error || this.props.configError;
    const { referenceId } = this.state;

    if (this.state.hasError || this.props.configError) {
      // Determine if we should show detailed errors.
      // - Dev: Always show detailed errors.
      // - Prod: Show details ONLY for config errors, keep runtime errors generic.
      const showDetailed = isDev || Boolean(this.props.configError);

      const errorPayload = showDetailed
        ? {
          // Detailed: Show full details
          message: displayError?.message || 'Terjadi kesalahan runtime.',
          type: this.props.configError ? 'Configuration Error' : 'Runtime Error',
          context: {
            // Optional component stack (if available)
            ...(this.state.errorInfo?.componentStack
              ? { componentStack: `${this.state.errorInfo.componentStack.slice(0, 300)}...` }
              : {}),
            // Only add name if it exists and is not just "Error"
            ...(displayError?.name && displayError.name !== 'Error'
              ? { name: displayError.name }
              : {}),
            // Include boot arguments
            ...(this.props.configError?.context || {}),
            // Optional extra debug context passed via props
            ...this.props.debugContext,
            // Always include referenceId in prod even for config errors
            ...(!isDev ? { referenceId } : {}),
          },
        }
        : {
          // Production Runtime: Show generic message, NO stack trace
          message: 'Maaf, widget mengalami gangguan teknis.',
          type: 'System Error',
          context: {
            referenceId: referenceId, // UUID from state
            note: 'Silakan hubungi dukungan jika masalah berlanjut.',
          },
        };

      // Render ErrorWidget with the construct payload
      return (
        <ErrorWidget
          error={errorPayload}
          onClose={this.handleClose}
          isMobile={this.props.isMobile}
        />
      );
    }

    return this.props.children;
  }
}

export default GlobalErrorBoundary;
