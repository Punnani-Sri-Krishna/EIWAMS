/** One step of a horizontal workflow progress stepper. */
export type StageState = 'done' | 'current' | 'pending' | 'rejected' | 'cancelled' | 'returned' | 'skipped';

export interface StageStep {
  key: string;
  label: string;
  state: StageState;
  /** Optional caption (who / when) shown under the label. */
  caption?: string | null;
  at?: string | null;
}

/** One entry of a history timeline. */
export interface TimelineEntry {
  id: string | number;
  title: string;
  tone: 'success' | 'warning' | 'danger' | 'info' | 'neutral';
  icon: string;
  actor?: string | null;
  at?: string | null;
  detail?: string | null;
  comments?: string | null;
}
