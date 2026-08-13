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
      },
    },
  });
}

export function AppProviders({ children }: { children: React.ReactNode }) {
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
          <NavigationRecovery />
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
