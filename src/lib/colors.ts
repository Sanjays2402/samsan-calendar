import type { EventColor } from '../types';

export const EVENT_COLORS: { id: EventColor; label: string }[] = [
  { id: 'indigo', label: 'Indigo' },
  { id: 'emerald', label: 'Emerald' },
  { id: 'amber', label: 'Amber' },
  { id: 'rose', label: 'Rose' },
  { id: 'sky', label: 'Sky' },
  { id: 'violet', label: 'Violet' },
];

export function colorVar(c: EventColor): string {
  return `var(--evt-${c})`;
}

export function colorSoftVar(c: EventColor): string {
  return `var(--evt-${c}-soft)`;
}
