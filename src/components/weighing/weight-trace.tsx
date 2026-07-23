"use client";

import { format } from "date-fns";
import { AlertTriangle, Maximize2, ZoomIn } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Button } from "@/components/ui/button";
import type { WeighAnomaly, WeightReading } from "@/interfaces/weighing";

/**
 * The weighing, replayed.
 *
 * This is the screen that makes the product's claim legible. A settlement
 * dispute is not settled by a number in a table; it is settled by seeing that
 * the load sat still for two seconds, or that eight hundred kilograms left the
 * deck after it did.
 *
 * Design decisions worth stating.
 *
 * One series, so no legend: the title names it, and a legend box for a single
 * line is furniture. Anomalies are marked in the status palette and always
 * carry an icon and a label, never colour alone.
 *
 * Thresholds are drawn from the parameters frozen onto the session, not from
 * whatever is configured today. A chart that showed current thresholds against
 * a year-old weighing would quietly misrepresent why it was judged the way it
 * was.
 *
 * The x axis is elapsed seconds rather than clock time. A weighing lasts
 * fifteen seconds and the question is always "how long after it settled", which
 * a wall clock answers badly.
 */

interface TracePoint {
  elapsed: number;
  weight: number;
  stable: boolean;
  net: boolean;
  deviceTs: number;
}

export function WeightTrace({
  readings,
  anomalies,
  params,
  stableWeightKg,
  measurementFromTs,
  measurementToTs,
}: {
  readings: WeightReading[];
  anomalies: WeighAnomaly[];
  params: Record<string, number>;
  stableWeightKg: string | null;
  measurementFromTs: number | null;
  measurementToTs: number | null;
}) {
  const t = useTranslations();
  const formatter = useFormatter();

  const { points, startTs } = useMemo(() => {
    if (readings.length === 0) return { points: [] as TracePoint[], startTs: 0 };
    const first = readings[0].device_ts;
    return {
      startTs: first,
      points: readings.map((reading) => ({
        elapsed: (reading.device_ts - first) / 1000,
        weight: Number(reading.weight_kg),
        stable: reading.is_stable,
        net: reading.is_net,
        deviceTs: reading.device_ts,
      })),
    };
  }, [readings]);

  // The engine's own window, in elapsed seconds. It ends before the vehicle
  // drives off, which is the whole reason the zoomed view is legible: the
  // departure ramp falls tens of tonnes and would flatten the plateau again.
  const windowFrom =
    measurementFromTs === null || startTs === 0
      ? null
      : (measurementFromTs - startTs) / 1000;
  const windowTo =
    measurementToTs === null || startTs === 0
      ? null
      : (measurementToTs - startTs) / 1000;

  /**
   * Which stretch of the weighing to draw.
   *
   * The approach and the anomaly differ in scale by about thirty times: a
   * lorry arrives over twenty-eight tonnes, and the weight that then leaves
   * the deck is under one. Plotted together on one axis the cheat is three
   * percent of the height and effectively invisible, which is the chart
   * failing at the one question the reader came with.
   *
   * So an anomalous weighing opens on the settled period, where the y axis
   * fits the plateau and the change is unmistakable. A clean one opens on the
   * whole pass, where the smooth approach is the thing worth seeing. Either
   * way the toggle is right there and says which is showing.
   */
  const hasMarkedAnomaly = anomalies.some(
    (anomaly) =>
      anomaly.device_ts !== null &&
      windowFrom !== null &&
      windowTo !== null &&
      (anomaly.device_ts - startTs) / 1000 >= windowFrom &&
      (anomaly.device_ts - startTs) / 1000 <= windowTo,
  );
  const [zoomed, setZoomed] = useState(hasMarkedAnomaly);

  const markers = useMemo(() => {
    if (startTs === 0) return [];
    return anomalies
      .filter((anomaly) => anomaly.device_ts !== null)
      .map((anomaly) => {
        const elapsed = ((anomaly.device_ts as number) - startTs) / 1000;
        // Snap to the nearest captured reading, so a marker always sits on the
        // line rather than floating beside it.
        const nearest = points.reduce(
          (best, point) =>
            Math.abs(point.elapsed - elapsed) < Math.abs(best.elapsed - elapsed)
              ? point
              : best,
          points[0],
        );
        return { anomaly, elapsed, weight: nearest?.weight ?? 0 };
      });
  }, [anomalies, points, startTs]);

  if (points.length === 0) {
    return (
      <div className="flex h-72 items-center justify-center rounded-lg border border-dashed">
        <p className="text-sm text-muted-foreground">{t("weighing.trace.empty")}</p>
      </div>
    );
  }

  const settled = stableWeightKg === null ? null : Number(stableWeightKg);
  const trigger = params.onboard_trigger_kg;
  const tolerance = params.stable_tolerance_kg;
  const canZoom = windowFrom !== null && windowTo !== null;
  const visible =
    zoomed && windowFrom !== null && windowTo !== null
      ? points.filter(
          (point) => point.elapsed >= windowFrom && point.elapsed <= windowTo,
        )
      : points;

  // Fitted to what is drawn, with a little air. Never below zero: a weighbridge
  // does not read negative, and letting the auto-domain pad past it throws away
  // a quarter of the plot height on numbers that cannot occur.
  const weights = visible.map((point) => point.weight);
  const low = Math.min(...weights);
  const high = Math.max(...weights);
  const pad = Math.max((high - low) * 0.15, tolerance * 2, 1);
  const domain: [number, number] = [Math.max(0, low - pad), high + pad];

  return (
    <div className="space-y-3">
      {canZoom && (
        <div className="flex items-center justify-end gap-1.5">
          <Button
            type="button"
            variant={zoomed ? "outline" : "secondary"}
            size="sm"
            className="h-7 rounded-full px-3 text-xs"
            onClick={() => setZoomed(false)}
          >
            <Maximize2 className="h-3 w-3" />
            {t("weighing.trace.viewFull")}
          </Button>
          <Button
            type="button"
            variant={zoomed ? "secondary" : "outline"}
            size="sm"
            className="h-7 rounded-full px-3 text-xs"
            onClick={() => setZoomed(true)}
          >
            <ZoomIn className="h-3 w-3" />
            {t("weighing.trace.viewSettled")}
          </Button>
        </div>
      )}

      <div className="h-80 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={visible}
            margin={{ top: 8, right: 16, bottom: 8, left: 8 }}
          >
            {/* The band the load had to stay inside to count as settled. Drawn
                behind everything, at low opacity: it is context for the line,
                not a mark competing with it. */}
            {settled !== null && (
              <ReferenceArea
                y1={settled - tolerance}
                y2={settled + tolerance}
                fill="var(--chart-1)"
                fillOpacity={0.08}
                stroke="none"
              />
            )}

            {/* From the moment it settled onward — the window in which weight
                appearing or disappearing has no innocent explanation. */}
            {windowFrom !== null && windowTo !== null && (
              <ReferenceArea
                x1={windowFrom}
                x2={windowTo}
                fill="var(--chart-1)"
                fillOpacity={0.04}
                stroke="none"
              />
            )}

            <CartesianGrid
              stroke="var(--border)"
              strokeDasharray="2 4"
              vertical={false}
            />

            <XAxis
              dataKey="elapsed"
              type="number"
              domain={["dataMin", "dataMax"]}
              tickFormatter={(value: number) => `${value.toFixed(0)}s`}
              stroke="var(--border)"
              tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: "var(--border)" }}
            />
            <YAxis
              domain={domain}
              allowDataOverflow
              tickFormatter={(value: number) => formatter.number(value)}
              stroke="var(--border)"
              tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={64}
            />

            {trigger !== undefined && !zoomed && (
              <ReferenceLine
                y={trigger}
                stroke="var(--muted-foreground)"
                strokeDasharray="4 4"
                strokeOpacity={0.5}
                label={{
                  value: t("weighing.trace.onboardTrigger"),
                  // Right-aligned and above the line. At the left edge the
                  // label sits exactly where the approach curve leaves the
                  // origin, and the two collide.
                  position: "insideTopRight",
                  fill: "var(--muted-foreground)",
                  fontSize: 10,
                }}
              />
            )}

            {settled !== null && (
              <ReferenceLine
                y={settled}
                stroke="var(--chart-1)"
                strokeDasharray="6 3"
                strokeOpacity={0.65}
              />
            )}

            <Tooltip
              cursor={{ stroke: "var(--muted-foreground)", strokeWidth: 1 }}
              content={<TraceTooltip />}
            />

            <Line
              type="monotone"
              dataKey="weight"
              stroke="var(--chart-1)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0 }}
              isAnimationActive={false}
            />

            {markers
              .filter(({ elapsed }) =>
                zoomed && windowFrom !== null && windowTo !== null
                  ? elapsed >= windowFrom && elapsed <= windowTo
                  : true,
              )
              .map(({ anomaly, elapsed, weight }) => (
              <ReferenceDot
                key={anomaly.id}
                x={elapsed}
                y={weight}
                r={5}
                fill="var(--destructive)"
                // A surface ring, so a marker landing on the line is still a
                // distinct mark rather than a thickening of it.
                stroke="var(--card)"
                strokeWidth={2}
              />
              ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Identity is never colour alone: each marked point is listed with its
          icon and its name, and this doubles as the table view. */}
      {markers.length > 0 && (
        <ul className="space-y-1.5">
          {markers.map(({ anomaly, elapsed }) => (
            <li
              key={anomaly.id}
              className="flex items-start gap-2 rounded-md border border-destructive/20 bg-destructive/8 px-3 py-2"
            >
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
              <div className="min-w-0 text-sm">
                <span className="font-medium text-destructive">
                  {t(`weighing.anomaly.${anomaly.code}`)}
                </span>
                <span className="tabular ml-2 text-xs text-muted-foreground">
                  {elapsed.toFixed(1)}s
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface TooltipPayload {
  payload: TracePoint;
}

function TraceTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
}) {
  const t = useTranslations();
  const formatter = useFormatter();

  if (!active || !payload?.length) return null;
  const point = payload[0].payload;

  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="tabular font-semibold text-foreground">
        {formatter.number(point.weight)} kg
      </p>
      <p className="tabular text-muted-foreground">
        {point.elapsed.toFixed(1)}s ·{" "}
        {format(new Date(point.deviceTs), "HH:mm:ss.SSS")}
      </p>
      <p className="mt-1 text-muted-foreground">
        {/* The instrument's own claim, shown as its claim. The platform's
            independent judgement is what the settled band on the chart shows,
            and the two disagreeing is itself one of the anomalies. */}
        {point.stable
          ? t("weighing.trace.instrumentSettled")
          : t("weighing.trace.instrumentMoving")}
        {point.net && ` · ${t("weighing.trace.net")}`}
      </p>
    </div>
  );
}
