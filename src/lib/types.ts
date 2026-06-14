// ── Screen ──────────────────────────────────────────────────────────────────

export interface Screen {
  id: string;
  name: string;
  location: string;
  ip_address: string | null;
  mac_address: string | null;
  resolution: ScreenResolution;
  is_online: boolean;
  brightness: number;
  power_on: boolean;
  orientation: Orientation;
  group_id: string | null;
  operating_hours?: any;
  playlist_id: string | null;
  created_at: string;
}

export interface ScreenResolution {
  width: number;
  height: number;
}

export type Orientation =
  | "Landscape"
  | "Portrait"
  | "LandscapeFlipped"
  | "PortraitFlipped";

// ── Content ─────────────────────────────────────────────────────────────────

export interface ContentItem {
  id: string;
  name: string;
  content_type: ContentType;
  file_path: string | null;
  url: string | null;
  duration_secs: number;
  tags: string[];
  created_at: string;
}

export type ContentType = "Video" | "Image" | "WebApp" | "Ad" | "Slideshow";

// ── Playlist ────────────────────────────────────────────────────────────────

export interface Playlist {
  id: string;
  name: string;
  items: PlaylistItem[];
  loop_enabled: boolean;
  transition: TransitionEffect;
  created_at: string;
}

export interface PlaylistItem {
  content_id: string;
  order: number;
  override_duration: number | null;
  display_schedule?: any;
}

export type TransitionEffect = "None" | "Fade" | "Slide" | "Zoom";

// ── Schedule ────────────────────────────────────────────────────────────────

export interface ScheduleSlot {
  id: string;
  name: string;
  screen_ids: string[];
  playlist_id: string;
  start_time: string;
  duration_mins: number;
  days_of_week: AppWeekday[];
  priority: number;
  is_active: boolean;
  created_at: string;
}

export type AppWeekday =
  | "Mon"
  | "Tue"
  | "Wed"
  | "Thu"
  | "Fri"
  | "Sat"
  | "Sun";

// ── Analytics ───────────────────────────────────────────────────────────────

export interface AnalyticsEvent {
  id: string;
  screen_id: string;
  content_id: string;
  event_type: AnalyticsEventType;
  timestamp: string;
  dwell_secs: number | null;
}

export type AnalyticsEventType = "Impression" | "Play" | "Complete" | "Skip";

export interface AnalyticsSummary {
  impressions: number;
  plays: number;
  completions: number;
  skips: number;
  avg_dwell_secs: number;
  uptime_pct: number;
}

export interface AnalyticsTimelineEntry {
  date: string;
  event_type: string;
  count: number;
}

// ── LAN Discovery ───────────────────────────────────────────────────────────

export interface PeerScreen {
  id: string;
  name: string;
  ip: string;
  port: number;
  is_controller: boolean;
}
