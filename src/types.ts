export type EventColor =
  | 'indigo'
  | 'emerald'
  | 'amber'
  | 'rose'
  | 'sky'
  | 'violet';

export type CalEvent = {
  id: string;
  title: string;
  /** Unix ms */
  start: number;
  /** Unix ms */
  end: number;
  allDay?: boolean;
  color: EventColor;
  notes?: string;
  /** ms-since-epoch of last update — for conflict resolution */
  updatedAt: number;
};

export type ViewMode = 'month' | 'week' | 'day';

export type Theme = 'system' | 'dark' | 'light';
