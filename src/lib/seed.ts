import {
  addDays,
  addMinutes,
  setHours,
  setMinutes,
  setSeconds,
  setMilliseconds,
  startOfDay,
  startOfWeek,
} from 'date-fns';
import type { CalEvent, EventColor } from '../types';
import { uid } from './uid';
import { WEEK_STARTS_ON } from './date';

/**
 * Builds a realistic week of demo events around `anchor`.
 *
 * Properties:
 * - Deterministic order, varied colors and lengths.
 * - Includes morning standups (recurring-feel), focus blocks, lunches,
 *   one all-day birthday, one multi-day conference span.
 * - All events flagged `seeded: true` so the user can wipe them with a
 *   single "Clear demo data" action without nuking their own data.
 */
export function buildSeedEvents(anchor: number = Date.now()): CalEvent[] {
  const weekStart = startOfWeek(new Date(anchor), {
    weekStartsOn: WEEK_STARTS_ON,
  });

  /** Returns the ms timestamp for day-of-week `dayOffset` at h:m local time. */
  function at(dayOffset: number, hour: number, minute = 0): number {
    const base = addDays(weekStart, dayOffset);
    return setMilliseconds(
      setSeconds(setMinutes(setHours(base, hour), minute), 0),
      0,
    ).getTime();
  }

  function ev(
    title: string,
    dayOffset: number,
    startHour: number,
    startMinute: number,
    durationMin: number,
    color: EventColor,
    extras: Partial<Pick<CalEvent, 'location' | 'notes' | 'allDay'>> = {},
  ): CalEvent {
    const start = at(dayOffset, startHour, startMinute);
    const end = addMinutes(new Date(start), durationMin).getTime();
    return {
      id: uid(),
      title,
      start,
      end,
      color,
      seeded: true,
      updatedAt: Date.now(),
      ...extras,
    };
  }

  function allDay(
    title: string,
    dayOffset: number,
    color: EventColor,
    extras: Partial<Pick<CalEvent, 'location' | 'notes'>> = {},
  ): CalEvent {
    const dayStart = startOfDay(addDays(weekStart, dayOffset)).getTime();
    const dayEnd = dayStart + 24 * 60 * 60 * 1000 - 1;
    return {
      id: uid(),
      title,
      start: dayStart,
      end: dayEnd,
      color,
      allDay: true,
      seeded: true,
      updatedAt: Date.now(),
      ...extras,
    };
  }

  function multiDay(
    title: string,
    startDayOffset: number,
    endDayOffset: number,
    color: EventColor,
    extras: Partial<Pick<CalEvent, 'location' | 'notes'>> = {},
  ): CalEvent {
    const dayStart = startOfDay(addDays(weekStart, startDayOffset)).getTime();
    const dayEnd =
      startOfDay(addDays(weekStart, endDayOffset)).getTime() +
      24 * 60 * 60 * 1000 -
      1;
    return {
      id: uid(),
      title,
      start: dayStart,
      end: dayEnd,
      color,
      allDay: true,
      seeded: true,
      updatedAt: Date.now(),
      ...extras,
    };
  }

  // 0 = Sun, 1 = Mon, ... 6 = Sat
  return [
    // Monday
    ev('Standup', 1, 9, 0, 15, 'indigo', { location: 'Zoom' }),
    ev('Design review · Calendar polish', 1, 10, 30, 60, 'violet'),
    ev('Lunch w/ Mira', 1, 12, 30, 60, 'amber', { location: 'Cafe Local' }),
    ev('Focus · ship SAM-59', 1, 14, 0, 150, 'emerald'),
    ev('1:1 with Theo', 1, 17, 0, 30, 'sky'),

    // Tuesday
    ev('Standup', 2, 9, 0, 15, 'indigo', { location: 'Zoom' }),
    ev('Quarterly planning', 2, 11, 0, 90, 'rose'),
    ev('Coffee · Sam', 2, 15, 30, 30, 'amber'),

    // Wednesday
    ev('Standup', 3, 9, 0, 15, 'indigo', { location: 'Zoom' }),
    ev('Customer call · Acme Co', 3, 13, 0, 45, 'sky'),
    ev('Pair · NLP parser', 3, 14, 0, 90, 'emerald'),
    allDay("Aanya's birthday 🎂", 3, 'rose'),

    // Thursday
    ev('Standup', 4, 9, 0, 15, 'indigo'),
    ev('Demo · CEO review', 4, 16, 0, 30, 'violet'),

    // Friday — conference day (multi-day)
    multiDay('NextConf 2026 ✈️', 5, 6, 'sky', { location: 'San Francisco' }),

    // Saturday
    ev('Yoga', 6, 8, 0, 60, 'emerald'),
    ev('Movie night', 6, 19, 30, 120, 'amber'),

    // Sunday (next)
    ev('Long run', 0, 7, 30, 90, 'emerald'),
  ];
}
