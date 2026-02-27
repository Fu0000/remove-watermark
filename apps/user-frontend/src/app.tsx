import { Component, createElement, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/auth.store";
import { setTokenAccessor, setSessionExpiredHandler } from "@/services/http";
import "./app.scss";

function AuthBridge() {
  const accessToken = useAuthStore((state) => state.accessToken);
  const clearSession = useAuthStore((state) => state.clearSession);

  useEffect(() => {
    setTokenAccessor(() => accessToken);
    setSessionExpiredHandler(() => clearSession());
    return undefined;
  }, [accessToken, clearSession]);

  return null;
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5_000,
      gcTime: 60_000,
      retry: 1
    }
  }
});

export default class App extends Component {
  render() {
    // @ts-expect-error Taro app entry injects children at runtime.
    const children = this.props.children;
    return createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(AuthBridge),
      children
    );
  }
}
