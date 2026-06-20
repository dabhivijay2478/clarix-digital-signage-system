import type {
  AppWeekday,
  PlaylistItemDaySchedule,
  PlaylistItemSchedule,
  ScreenOperatingHours,
  ScreenOperatingHoursDay,
} from './types';

export const APP_WEEKDAYS: AppWeekday[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const JS_DAY_TO_APP_WEEKDAY: AppWeekday[] = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const JS_DAY_TO_FULL_WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function defaultPlaylistItemDayTimes(
  start = '09:00',
  end = '17:00',
  enabledDays: AppWeekday[] = APP_WEEKDAYS
): Record<AppWeekday, PlaylistItemDaySchedule> {
  return APP_WEEKDAYS.reduce((days, day) => {
    days[day] = {
      enabled: enabledDays.includes(day),
      start,
      end,
    };
    return days;
  }, {} as Record<AppWeekday, PlaylistItemDaySchedule>);
}

export function defaultPlaylistItemSchedule(): PlaylistItemSchedule {
  return {
    time_restricted: false,
    start_time: '09:00',
    end_time: '17:00',
    days: [...APP_WEEKDAYS],
    day_times: defaultPlaylistItemDayTimes(),
    date_restricted: false,
    start_date: '',
    end_date: '',
    transition: 'Fade',
  };
}

export function normalizePlaylistItemSchedule(
  schedule?: Partial<PlaylistItemSchedule> | null
): PlaylistItemSchedule {
  const fallback = defaultPlaylistItemSchedule();
  const days = Array.isArray(schedule?.days)
    ? schedule.days.filter((day): day is AppWeekday => APP_WEEKDAYS.includes(day as AppWeekday))
    : fallback.days;
  const dayTimes = defaultPlaylistItemDayTimes(
    schedule?.start_time ?? fallback.start_time,
    schedule?.end_time ?? fallback.end_time,
    days
  );

  if (schedule?.day_times) {
    for (const day of APP_WEEKDAYS) {
      const daySchedule = schedule.day_times[day];
      if (!daySchedule) continue;
      dayTimes[day] = {
        enabled: Boolean(daySchedule.enabled),
        start: daySchedule.start || dayTimes[day].start,
        end: daySchedule.end || dayTimes[day].end,
      };
    }
  }
  const enabledDays = APP_WEEKDAYS.filter((day) => dayTimes[day].enabled);

  return {
    ...fallback,
    ...schedule,
    days: enabledDays,
    day_times: dayTimes,
    transition: schedule?.transition ?? fallback.transition,
  };
}

export function parseTimeToMinutes(time?: string | null): number | null {
  if (!time || !/^\d{2}:\d{2}(:\d{2})?$/.test(time)) return null;
  const [hoursRaw, minutesRaw] = time.split(':');
  const hours = Number.parseInt(hoursRaw, 10);
  const minutes = Number.parseInt(minutesRaw, 10);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function isTimeWithinWindow(nowMinutes: number, startMinutes: number, endMinutes: number): boolean {
  if (startMinutes === endMinutes) return true;
  if (startMinutes < endMinutes) {
    return nowMinutes >= startMinutes && nowMinutes <= endMinutes;
  }
  return nowMinutes >= startMinutes || nowMinutes <= endMinutes;
}

export function isOvernightWindow(startTime: string, endTime: string): boolean {
  const start = parseTimeToMinutes(startTime);
  const end = parseTimeToMinutes(endTime);
  return start !== null && end !== null && start > end;
}

function getLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getPreviousDay(date: Date): Date {
  const previous = new Date(date);
  previous.setDate(date.getDate() - 1);
  return previous;
}

export function isPlaylistItemScheduleActive(
  schedule?: Partial<PlaylistItemSchedule> | null,
  date = new Date()
): boolean {
  if (!schedule) return true;
  const normalized = normalizePlaylistItemSchedule(schedule);

  if (normalized.date_restricted) {
    const today = getLocalDateKey(date);
    if (normalized.start_date && today < normalized.start_date) return false;
    if (normalized.end_date && today > normalized.end_date) return false;
  }

  if (!normalized.time_restricted) return true;

  if (normalized.days.length === 0) return false;

  const nowMinutes = date.getHours() * 60 + date.getMinutes();
  const today = JS_DAY_TO_APP_WEEKDAY[date.getDay()];
  const previousDay = JS_DAY_TO_APP_WEEKDAY[getPreviousDay(date).getDay()];
  const todaySchedule = normalized.day_times?.[today];
  const previousSchedule = normalized.day_times?.[previousDay];

  const isAllowedForDay = (daySchedule: PlaylistItemDaySchedule | undefined, mode: 'current' | 'previous') => {
    if (!daySchedule?.enabled) return false;
    const start = parseTimeToMinutes(daySchedule.start);
    const end = parseTimeToMinutes(daySchedule.end);
    if (start === null || end === null) return false;
    if (start === end) return mode === 'current';
    if (start < end) {
      return mode === 'current' && nowMinutes >= start && nowMinutes <= end;
    }
    return mode === 'current' ? nowMinutes >= start : nowMinutes <= end;
  };

  return isAllowedForDay(todaySchedule, 'current') || isAllowedForDay(previousSchedule, 'previous');
}

function compactDaySummary(days: AppWeekday[]): string {
  if (days.length === 0) return 'No weekdays';
  if (days.length === 7) return 'Every day';
  const joined = days.join(',');
  if (joined === 'Mon,Tue,Wed,Thu,Fri') return 'Mon-Fri';
  if (joined === 'Sat,Sun') return 'Sat-Sun';
  return days.join(', ');
}

export function formatPlaylistScheduleSummary(schedule?: Partial<PlaylistItemSchedule> | null): string {
  if (!schedule) return 'Always eligible';
  const normalized = normalizePlaylistItemSchedule(schedule);
  const parts: string[] = [];

  if (normalized.time_restricted) {
    const enabledDayTimes = APP_WEEKDAYS
      .filter((day) => normalized.day_times?.[day]?.enabled)
      .map((day) => normalized.day_times?.[day]);
    const first = enabledDayTimes[0];
    const hasSingleWindow = Boolean(first && enabledDayTimes.every((day) => day?.start === first.start && day?.end === first.end));

    if (first && hasSingleWindow) {
      const overnight = isOvernightWindow(first.start, first.end) ? ' overnight' : '';
      parts.push(`${compactDaySummary(normalized.days)} · ${first.start}-${first.end}${overnight}`);
    } else {
      parts.push(`${compactDaySummary(normalized.days)} · custom times`);
    }
  }

  if (normalized.date_restricted) {
    const start = normalized.start_date || 'Any start';
    const end = normalized.end_date || 'Any end';
    parts.push(`${start} to ${end}`);
  }

  return parts.length > 0 ? parts.join(' · ') : 'Always eligible';
}

export function validatePlaylistItemSchedule(schedule: PlaylistItemSchedule): string | null {
  if (schedule.time_restricted) {
    if (schedule.days.length === 0) return 'Select at least one weekday for this content item.';
    const normalized = normalizePlaylistItemSchedule(schedule);
    for (const day of APP_WEEKDAYS) {
      const daySchedule = normalized.day_times?.[day];
      if (!daySchedule?.enabled) continue;
      if (parseTimeToMinutes(daySchedule.start) === null || parseTimeToMinutes(daySchedule.end) === null) {
        return `Enter a valid start and end time for ${day}.`;
      }
    }
  }

  if (schedule.date_restricted && schedule.start_date && schedule.end_date && schedule.start_date > schedule.end_date) {
    return 'The content schedule start date must be before the end date.';
  }

  return null;
}

function isWithinOperatingDayWindow(
  dayHours: ScreenOperatingHoursDay | undefined,
  date: Date,
  compareMode: 'current' | 'previous'
): boolean {
  if (!dayHours) return false;
  const start = parseTimeToMinutes(dayHours.start || '00:00');
  const end = parseTimeToMinutes(dayHours.end || '23:59');
  if (start === null || end === null) return false;

  const nowMinutes = date.getHours() * 60 + date.getMinutes();
  if (start === end) return true;
  if (start < end) {
    return compareMode === 'current' && nowMinutes >= start && nowMinutes <= end;
  }
  return compareMode === 'current' ? nowMinutes >= start : nowMinutes <= end;
}

export function isScreenWithinOperatingHours(
  operatingHours?: ScreenOperatingHours | null,
  date = new Date()
): boolean {
  if (!operatingHours?.days) return true;
  const todayName = JS_DAY_TO_FULL_WEEKDAY[date.getDay()];
  const previousDay = getPreviousDay(date);
  const previousName = JS_DAY_TO_FULL_WEEKDAY[previousDay.getDay()];

  return (
    isWithinOperatingDayWindow(operatingHours.days[todayName], date, 'current') ||
    isWithinOperatingDayWindow(operatingHours.days[previousName], date, 'previous')
  );
}
