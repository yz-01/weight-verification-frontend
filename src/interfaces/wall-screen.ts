/**
 * 总部大屏 (JB291, 客户 11-27e): the wall's own answer
 * (`contractor-dashboard/get_wall_screen`, or `wall-screen/<token>/` for a
 * screen nobody signs in on). Only safe fields - no amount, price, supplier,
 * approval queue, anomaly or person (五). `null` = that part's module is not
 * open for the company (JB250) or head office did not allow it: the wall
 * leaves it out, never an empty box.
 */

export interface WallPoint {
  date: string;
  /** A percentage as text, "40.00". */
  value: string;
}

export interface WallProgress {
  planned: string;
  actual: string;
  start: string | null;
  end: string | null;
  curve: { planned: WallPoint[]; actual: WallPoint[] };
}

export interface WallPhoto {
  id: string;
  image: string;
  captured_at: string;
  project_id: string;
  project: string;
  title: string;
}

export interface WallClearance {
  trips: number;
  weight_kg: string;
  month_trips: number;
  month_weight_kg: string;
}

export interface WallEsg {
  garbage: WallClearance | null;
  scrap: WallClearance | null;
  recycling: WallClearance | null;
  safety: {
    reported: number;
    closed: number;
    month_reported: number;
    month_closed: number;
  } | null;
  transparency: {
    photos: number;
    month_photos: number;
    consultant_approvals: number | null;
    month_consultant_approvals: number | null;
    progress_confirmations: number | null;
    month_progress_confirmations: number | null;
  };
}

export interface WallProject {
  id: string;
  name: string;
  place: string;
  latitude: string | null;
  longitude: string | null;
  people_on_site: number;
  equipment_on_site: number | null;
  equipment_working: number | null;
  progress: WallProgress | null;
  photos: WallPhoto[] | null;
  esg: WallEsg | null;
}

export interface WallScreenData {
  generated_at: string;
  date: string;
  company: { name: string; logo_url: string | null };
  modules: {
    progress: boolean;
    photos: boolean;
    people: boolean;
    equipment: boolean;
    esg: boolean;
  };
  overview: {
    projects: number;
    located: number;
    people_on_site: number | null;
    equipment_on_site: number | null;
    equipment_working: number | null;
    progress: Array<{ id: string; name: string; planned: string; actual: string }>;
    esg: WallEsg | null;
    photos: WallPhoto[] | null;
  };
  projects: WallProject[];
}

export interface WallWeather {
  temperature: number;
  weather_code: number;
  place: string;
}

/** One row of 大屏展示设定. */
export interface WallSettingRow {
  project: string;
  code: string;
  name: string;
  shown: boolean;
  photos: boolean;
  esg: boolean;
}

export interface WallLinkInfo {
  id: string;
  created_at: string;
  created_by: string;
  last_opened_at: string | null;
}

export interface WallSettings {
  projects: WallSettingRow[];
  link: WallLinkInfo | null;
  /** Only in the answer that made the link: shown once. */
  token?: string;
}
