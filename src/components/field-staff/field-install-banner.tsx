"use client";

import { Loader2, Share } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import {
  isStandaloneApp,
  markFieldInstallHelp,
  setFieldBootstrapToken,
} from "@/lib/auth-token";
import {
  detectInstallEnvironment,
  fieldReadyPath,
  showInstallBanner,
} from "@/lib/field-install";
import { createFieldPwaBootstrap } from "@/services/field-access.service";

/**
 * The field app opened in an iPhone browser tab rather than from the Home
 * Screen.
 *
 * Adding *this* page to the Home Screen makes an app that opens on the PIN
 * with nothing to sign in with: the app cannot see Safari's storage, and this
 * page's address carries no hand-off. The button makes a fresh hand-off and
 * opens the ready page, whose own address carries it - that is the page to
 * add from.
 *
 * Its words say why it matters (JB153, 客户 11-10 第二批事项 2: in Safari
 * 「什么通知都没有」): an iPhone sends notifications, sounds and the icon's
 * number only to the app opened from its Home Screen icon, never to a tab.
 *
 * Gone once the app is on the Home Screen (JB151): the server knows from the
 * app's own sign-in, which a browser tab cannot see.
 */
export function FieldInstallBanner() {
  const t = useTranslations("fieldAccess");
  const { user } = useAuth();
  const hasHomeScreenApp = user?.has_home_screen_app === true;
  const [visible, setVisible] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() =>
      setVisible(
        showInstallBanner({
          environment: detectInstallEnvironment(),
          standalone: isStandaloneApp(),
          hasHomeScreenApp,
        }),
      ),
    );
    return () => window.cancelAnimationFrame(frame);
  }, [hasHomeScreenApp]);

  if (!visible) return null;

  const open = async () => {
    setPending(true);
    try {
      const fresh = await createFieldPwaBootstrap();
      setFieldBootstrapToken(fresh.token);
      markFieldInstallHelp();
      window.location.assign(fieldReadyPath(fresh.token, "/field-staff"));
    } catch {
      // The request already said what went wrong.
      setPending(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pt-3">
      <div className="flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/10 px-3 py-2.5 text-sm">
        <Share className="size-5 shrink-0 text-primary" />
        <p className="min-w-0 flex-1 leading-5">{t("installBannerBody")}</p>
        <Button size="sm" disabled={pending} onClick={() => void open()}>
          {pending ? <Loader2 className="animate-spin" /> : null}
          {t("installBannerAction")}
        </Button>
      </div>
    </div>
  );
}
