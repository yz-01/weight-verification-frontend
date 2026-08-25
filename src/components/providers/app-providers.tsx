"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { useState } from "react";

import { AuthProvider } from "@/components/providers/auth-provider";
import { BrandingSync } from "@/components/providers/branding-sync";
import { LocaleSync } from "@/components/providers/locale-sync";
import { NavigationRecovery } from "@/components/providers/navigation-recovery";
import { OfflineSyncProvider } from "@/components/providers/offline-sync-provider";
import { ServiceWorkerRegistration } from "@/components/providers/service-worker-registration";
import { TranslationBridge } from "@/components/providers/translation-bridge";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ApiError } from "@/interfaces/api";

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Table pages carry their filters in the URL, so navigating back to a
        // list should feel instant while the fresh page loads behind it.
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        // Run even when the browser knows it is offline. The default
        // ("online") pauses the function itself, which silently disabled the
        // whole offline layer: an offline-aware reader was never invoked, so
        // it could not serve its IndexedDB snapshot, and a queued action's
        // mutation sat paused instead of entering the offline queue.
        networkMode: "always",
        retry: (failureCount, error) => {
          // Retrying an authorisation or validation failure just repeats it.
          // Only transient faults are worth a second attempt.
          if (error instanceof ApiError) {
            if (error.isNetwork) return failureCount < 2;
            if (error.status >= 400 && error.status < 500) return false;
          }
          return failureCount < 1;
        },
      },
      mutations: {
        retry: false,
        // Same reason as queries: the offline-aware submit helpers decide
        // for themselves what "offline" means, and they can only decide if
        // they actually run.
        networkMode: "always",
      },
    },
  });
}

export function AppProviders({
  children,
  deploymentId,
}: {
  children: React.ReactNode;
  deploymentId: string;
}) {
  // Created in state so each browser session gets one client, and so a server
  // render never shares a cache between two users' requests.
  const [queryClient] = useState(createQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      <TranslationBridge />
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
      >
        <AuthProvider>
          <BrandingSync />
          <LocaleSync />
          <NavigationRecovery deploymentId={deploymentId} />
          <ServiceWorkerRegistration />
          <OfflineSyncProvider>
            <TooltipProvider delayDuration={300}>{children}</TooltipProvider>
          </OfflineSyncProvider>
          <Toaster position="top-right" richColors closeButton />
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
