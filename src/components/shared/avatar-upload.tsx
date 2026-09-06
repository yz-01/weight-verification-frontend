"use client";

import { useMutation } from "@tanstack/react-query";
import { Loader2, Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/interfaces/api";
import { updateProfile } from "@/services/auth.service";

/**
 * Where a person changes their own picture.
 *
 * The customer asked "the person's photo on a material delivery cannot be
 * changed? where do you change it?" and the answer was nowhere. The field has
 * existed on `User` for a long time, `MeSerializer` returns it,
 * `UpdateProfileSerializer` accepts it, and the delivery detail screen renders
 * it - the only missing piece in the whole chain was a file input (F-227).
 *
 * One component rather than three, because three groups of people need it and
 * two of them cannot reach `/profile`: field staff are locked to the field
 * portal and drivers to the driver portal, and it is precisely field staff
 * whose face appears on a delivery record.
 */

/** Largest picture this will send. Named in the refusal, not just enforced. */
const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const MAX_AVATAR_MB = MAX_AVATAR_BYTES / (1024 * 1024);
const ACCEPTED = "image/png,image/jpeg,image/webp";

/** First letters of the first two words, for a person with no picture yet. */
export function avatarInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function AvatarUpload({ className }: { className?: string }) {
  const t = useTranslations("profile.avatar");
  const { user, refresh } = useAuth();
  // The preview URL is made when the file is chosen and held beside it,
  // rather than derived in an effect. Building it in an effect meant calling
  // setState from inside one, which cascades a render and which the React
  // compiler rule rejects outright.
  const [chosen, setChosen] = useState<{ file: File; preview: string } | null>(
    null,
  );
  const [error, setError] = useState("");

  // Cleanup only. When `chosen` changes, React runs this cleanup with the
  // previous value before setting up the next one, so the old blob URL is
  // released exactly once.
  useEffect(() => {
    if (chosen === null) return;
    const url = chosen.preview;
    return () => URL.revokeObjectURL(url);
  }, [chosen]);

  const save = useMutation({
    mutationFn: () => {
      if (chosen === null) throw new Error("no_file");
      return updateProfile({ avatar: chosen.file });
    },
    onSuccess: async () => {
      setChosen(null);
      setError("");
      // Every other screen reads the picture from the session, which comes
      // from `get_me`. Without re-reading it the old picture stays on screen
      // and the upload looks like it failed.
      await refresh();
    },
    onError: (reason) =>
      setError(reason instanceof ApiError ? reason.message : t("failed")),
  });

  function choose(next: File | null) {
    setError("");
    if (next === null) {
      setChosen(null);
      return;
    }
    if (next.size > MAX_AVATAR_BYTES) {
      // The measured size, not "the file is too large": a phone camera
      // picture is often 8 MB and the person needs to know by how much.
      setError(
        t("tooBig", {
          limit: MAX_AVATAR_MB,
          actual: (next.size / (1024 * 1024)).toFixed(1),
        }),
      );
      setChosen(null);
      return;
    }
    setChosen({ file: next, preview: URL.createObjectURL(next) });
  }

  if (user === null) return null;
  const shown = chosen?.preview ?? user.avatar;

  return (
    <div className={`flex items-start gap-4 ${className ?? ""}`}>
      <Avatar className="size-16 shrink-0">
        {shown ? <AvatarImage src={shown} alt="" /> : null}
        <AvatarFallback className="bg-primary/10 text-base font-semibold text-primary">
          {avatarInitials(user.full_name)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1 space-y-2">
        <p className="text-sm font-medium">{t("title")}</p>
        <p className="text-xs text-muted-foreground">
          {t("hint", { limit: MAX_AVATAR_MB })}
        </p>
        <Input
          type="file"
          accept={ACCEPTED}
          className="h-11"
          aria-label={t("title")}
          onChange={(event) => choose(event.target.files?.[0] ?? null)}
        />
        {chosen !== null ? (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              disabled={save.isPending}
              onClick={() => save.mutate()}
            >
              {save.isPending ? (
                <Loader2 className="animate-spin" />
              ) : (
                <Upload />
              )}
              {t("save")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => choose(null)}
            >
              {t("discard")}
            </Button>
          </div>
        ) : null}
        {error ? (
          <p
            role="alert"
            className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
