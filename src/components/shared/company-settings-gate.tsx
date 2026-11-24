"use client";

import { KeyRound, Loader2, Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  clearCompanySettingsPass,
  registerCompanySettingsRenewer,
  setCompanySettingsPass,
} from "@/lib/company-settings-pass";
import { isSignOffCancelled } from "@/lib/sign-off";
import { ApiError } from "@/interfaces/api";
import { openCompanySettings } from "@/services/sign-off.service";

type GateState = "opening" | "open" | "closed";

/**
 * 「点击「公司设置」时，必须先输入六位数签核密码，验证成功才能进入」 (JB239, 客户
 * 11-23 事项 11 第 1 点).
 *
 * Nothing of 公司设置 is drawn - or fetched - before the PIN: on arriving, the
 * shared PIN dialog asks for it (somebody without a PIN sets one first, as
 * everywhere else), the server hands back a pass, and only then the page
 * below. The server refuses every 公司设置 call without the pass, so this is
 * the page saying what the server enforces, not the lock itself.
 *
 * Leaving the page drops the pass: coming back asks again. If the pass runs
 * out while the page is open (30 minutes), the next save asks for the PIN
 * once more and goes through - what was typed stays.
 */
export function CompanySettingsGate({ children }: { children: ReactNode }) {
  const t = useTranslations("jb239.gate");
  const [state, setState] = useState<GateState>("opening");
  const [failure, setFailure] = useState("");
  const inFlight = useRef<Promise<boolean> | null>(null);

  const unlock = useCallback((): Promise<boolean> => {
    // React's development double mount, or two refused calls at once: one
    // PIN dialog, one request.
    if (inFlight.current) return inFlight.current;
    const job = openCompanySettings()
      .then((pass) => {
        setCompanySettingsPass(pass);
        setFailure("");
        setState("open");
        return true;
      })
      .catch((error: unknown) => {
        clearCompanySettingsPass();
        setFailure(
          isSignOffCancelled(error) ? "" : error instanceof ApiError ? error.message : "",
        );
        setState("closed");
        return false;
      })
      .finally(() => {
        inFlight.current = null;
      });
    inFlight.current = job;
    return job;
  }, []);

  useEffect(() => {
    const unregister = registerCompanySettingsRenewer(unlock);
    void unlock();
    return () => {
      unregister();
      clearCompanySettingsPass();
    };
  }, [unlock]);

  if (state === "open") return <>{children}</>;

  return (
    <div className="mx-auto max-w-xl py-10" data-slot="company-settings-gate" data-state={state}>
      <div className="surface-panel rounded-xl p-6 text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-full bg-primary/10 text-primary">
          <Lock className="size-6" />
        </span>
        <h1 className="mt-3 text-lg font-semibold">{t("title")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("help")}</p>
        {failure && <p className="mt-3 text-sm text-destructive">{failure}</p>}
        <Button
          className="mt-5"
          disabled={state === "opening"}
          onClick={() => {
            setState("opening");
            void unlock();
          }}
        >
          {state === "opening" ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
          {state === "opening" ? t("opening") : t("enter")}
        </Button>
      </div>
    </div>
  );
}
