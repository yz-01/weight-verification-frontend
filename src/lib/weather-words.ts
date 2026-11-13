/**
 * The word for a weather reading, shared by the two places that say it: the
 * head-office banner (J32) and a new daily report's 日报天气 (JB186, 客户
 * 11-13: 「日报名称改为日报天气，右上角报告上面能否页面的天气局气象报告」) -
 * so the report says the word the page says.
 *
 * The readings are Open-Meteo's (`contractor_ops/weather.py`); the codes are
 * the WMO weather codes it sends. The words themselves are in the messages,
 * under `headquarters.reference.weather`.
 */
export type WeatherWord =
  | "clear"
  | "partly"
  | "cloudy"
  | "fog"
  | "drizzle"
  | "rain"
  | "snow"
  | "storm";

/** WMO weather code → the word shown. An unknown code reads as 阴. */
export function weatherWordKey(code: number): WeatherWord {
  if (code === 0) return "clear";
  if (code <= 2) return "partly";
  if (code === 3) return "cloudy";
  if (code === 45 || code === 48) return "fog";
  if (code >= 51 && code <= 57) return "drizzle";
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return "rain";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
  if (code >= 95) return "storm";
  return "cloudy";
}

/** A weather reading as the server sends it (`get_weather`). */
export interface WeatherReading {
  temperature: number;
  weather_code: number;
  place: string;
}

/**
 * Whether a report being written starts with the weather: a new one whose
 * first day is today. The reading is the weather *now* - not the weather of
 * a day already past that is being written up late, and not something to
 * write over a saved report's own line.
 */
export function reportTakesWeather({
  editing,
  firstDay,
  today,
}: {
  editing: boolean;
  firstDay: string;
  today: string;
}): boolean {
  return !editing && Boolean(firstDay) && firstDay === today;
}
