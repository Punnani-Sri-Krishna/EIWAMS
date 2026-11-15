export interface BlacklistEntry {
  blacklistId: number;
  subjectType: string;
  subjectId: number;
  subjectName: string | null;
  reason: string;
  reviewDate: string | null;
  isActive: boolean;
  createdByName: string | null;
  createdAtUtc: string;
  liftedByName: string | null;
  liftedAtUtc: string | null;
  liftReason: string | null;
}

export interface CreateBlacklistBody {
  subjectType: string;
  subjectId: number;
  reason: string;
  reviewDate: string | null;
}

export const BLACKLIST_SUBJECT_TYPES = ['Employee', 'Visitor', 'Card'] as const;
