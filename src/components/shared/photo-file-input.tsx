"use client";

/**
 * A "choose a photo" box for an evidence photo (J45, Lucas 2026-10-22: no
 * phone camera app and no gallery anywhere on the phone).
 *
 * In the office it is the plain file input it always was - a photo already on
 * the computer is uploaded as before. On a phone it is the app's own square
 * camera (`FieldCamera`) instead: a photo taken now, framed as it is kept, at
 * upload size. Several photos are added one shot at a time; the tile's ✕
 * clears them.
 */

import { FieldCamera } from "@/components/shared/field-camera";
import { Input } from "@/components/ui/input";
import { useIsMobile } from "@/hooks/use-mobile";

export function PhotoFileInput({
  label,
  files,
  onChange,
  multiple = false,
  facingMode,
  className,
  inputClassName,
}: {
  label: string;
  files: File[];
  onChange: (files: File[]) => void;
  multiple?: boolean;
  /** The camera to open on the phone (a selfie: "user"). */
  facingMode?: "user" | "environment";
  /** The camera tile's class, on the phone. */
  className?: string;
  /** The file input's class, in the office. */
  inputClassName?: string;
}) {
  const mobile = useIsMobile();
  if (mobile) {
    return (
      <FieldCamera
        label={label}
        facingMode={facingMode}
        fileCount={files.length}
        file={multiple ? undefined : files[0]}
        className={className}
        onCapture={(photo) => onChange(multiple ? [...files, photo] : [photo])}
        onClear={() => onChange([])}
      />
    );
  }
  return (
    <Input
      type="file"
      accept="image/*"
      multiple={multiple}
      className={inputClassName}
      aria-label={label}
      onChange={(event) => onChange(Array.from(event.target.files ?? []))}
    />
  );
}
