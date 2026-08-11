"use client";

import { Check, Eraser, PenLine } from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";

export function FieldSignaturePad({
  label,
  clearLabel,
  value,
  onChange,
}: {
  label: string;
  clearLabel: string;
  value?: File;
  onChange: (file?: File) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [hasInk, setHasInk] = useState(Boolean(value));

  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const start = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = event.currentTarget;
    const context = canvas.getContext("2d");
    if (!context) return;
    const { x, y } = point(event);
    drawing.current = true;
    canvas.setPointerCapture(event.pointerId);
    context.beginPath();
    context.moveTo(x, y);
    context.strokeStyle = "#111827";
    context.lineWidth = 4;
    context.lineCap = "round";
    context.lineJoin = "round";
  };

  const move = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const context = event.currentTarget.getContext("2d");
    if (!context) return;
    const { x, y } = point(event);
    context.lineTo(x, y);
    context.stroke();
    setHasInk(true);
  };

  const finish = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    drawing.current = false;
    event.currentTarget.releasePointerCapture(event.pointerId);
    event.currentTarget.toBlob((blob) => {
      if (!blob) return;
      onChange(
        new File([blob], `signature-${Date.now()}.png`, {
          type: "image/png",
          lastModified: Date.now(),
        }),
      );
    }, "image/png");
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (canvas && context) context.clearRect(0, 0, canvas.width, canvas.height);
    setHasInk(false);
    onChange(undefined);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-sm font-medium">
          <PenLine className="size-4" />
          {label}
        </span>
        {value ? <Check className="size-5 text-success" aria-label={`${label} ready`} /> : null}
      </div>
      <canvas
        ref={canvasRef}
        width={720}
        height={260}
        className="aspect-[18/6.5] w-full touch-none rounded-lg border-2 border-dashed bg-white shadow-inner"
        aria-label={label}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={finish}
        onPointerCancel={finish}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full"
        disabled={!hasInk && !value}
        onClick={clear}
      >
        <Eraser />
        {clearLabel}
      </Button>
    </div>
  );
}
