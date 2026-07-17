import type {
  AppWeekday,
  PlaylistItemDaySchedule,
  PlaylistItemSchedule,
  ScreenOperatingHours,
  ScreenOperatingHoursDay,
} from './types';

export const APP_WEEKDAYS: AppWeekday[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const APP_TIME_ZONE = 'Asia/Calcutta';

const JS_DAY_TO_APP_WEEKDAY: AppWeekday[] = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const JS_DAY_TO_FULL_WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function getValidTimeZone(timeZone?: string | null): string {
  if (timeZone) {
    try {
      new Intl.DateTimeFormat('en-GB', { timeZone }).format(new Date());
      return timeZone;
    } catch {
      // Fall through to the packaged app default for older or invalid data.
    }
  }
  return APP_TIME_ZONE;
}

export function getControllerTimeZone(): string {
  if (typeof Intl === 'undefined') return APP_TIME_ZONE;
  return getValidTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
}

function getZonedDateInfo(date: Date, timeZone?: string | null): {
  dateKey: string;
  today: AppWeekday;
  previousDay: AppWeekday;
  todayFull: string;
  previousFull: string;
  nowMinutes: number;
} {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: getValidTimeZone(timeZone),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value])
  );
  const year = Number.parseInt(parts.year, 10);
  const month = Number.parseInt(parts.month, 10);
  const day = Number.parseInt(parts.day, 10);
  const hours = Number.parseInt(parts.hour, 10);
  const minutes = Number.parseInt(parts.minute, 10);
  const zonedMiddayUtc = Date.UTC(year, month - 1, day, 12);
  const previousMiddayUtc = zonedMiddayUtc - 86400000;
  const todayIndex = new Date(zonedMiddayUtc).getUTCDay();
  const previousIndex = new Date(previousMiddayUtc).getUTCDay();

  return {
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
    today: JS_DAY_TO_APP_WEEKDAY[todayIndex],
    previousDay: JS_DAY_TO_APP_WEEKDAY[previousIndex],
    todayFull: JS_DAY_TO_FULL_WEEKDAY[todayIndex],
    previousFull: JS_DAY_TO_FULL_WEEKDAY[previousIndex],
    nowMinutes: hours * 60 + minutes,
  };
}

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
    timezone: APP_TIME_ZONE,
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
    timezone: getValidTimeZone(schedule?.timezone ?? fallback.timezone),
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

export function isPlaylistItemScheduleActive(
  schedule?: Partial<PlaylistItemSchedule> | null,
  date = new Date()
): boolean {
  if (!schedule) return true;
  const normalized = normalizePlaylistItemSchedule(schedule);
  const zonedDate = getZonedDateInfo(date, normalized.timezone);

  if (normalized.date_restricted) {
    if (normalized.start_date && zonedDate.dateKey < normalized.start_date) return false;
    if (normalized.end_date && zonedDate.dateKey > normalized.end_date) return false;
  }

  if (!normalized.time_restricted) return true;

  if (normalized.days.length === 0) return false;

  const todaySchedule = normalized.day_times?.[zonedDate.today];
  const previousSchedule = normalized.day_times?.[zonedDate.previousDay];

  const isAllowedForDay = (daySchedule: PlaylistItemDaySchedule | undefined, mode: 'current' | 'previous') => {
    if (!daySchedule?.enabled) return false;
    const start = parseTimeToMinutes(daySchedule.start);
    const end = parseTimeToMinutes(daySchedule.end);
    if (start === null || end === null) return false;
    if (start === end) return mode === 'current';
    if (start < end) {
      return mode === 'current' && zonedDate.nowMinutes >= start && zonedDate.nowMinutes <= end;
    }
    return mode === 'current' ? zonedDate.nowMinutes >= start : zonedDate.nowMinutes <= end;
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

export function formatScheduleTime(time?: string | null): string {
  const minutes = parseTimeToMinutes(time);
  if (minutes === null) return time || '-';
  const hours24 = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const suffix = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 || 12;
  return `${hours12}:${String(mins).padStart(2, '0')} ${suffix}`;
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
      parts.push(`${compactDaySummary(normalized.days)} · ${formatScheduleTime(first.start)}-${formatScheduleTime(first.end)}${overnight}`);
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
  nowMinutes: number,
  compareMode: 'current' | 'previous'
): boolean {
  if (!dayHours) return false;
  const start = parseTimeToMinutes(dayHours.start || '00:00');
  const end = parseTimeToMinutes(dayHours.end || '23:59');
  if (start === null || end === null) return false;

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
  const zonedDate = getZonedDateInfo(date, operatingHours.timezone);

  return (
    isWithinOperatingDayWindow(operatingHours.days[zonedDate.todayFull], zonedDate.nowMinutes, 'current') ||
    isWithinOperatingDayWindow(operatingHours.days[zonedDate.previousFull], zonedDate.nowMinutes, 'previous')
  );
}
