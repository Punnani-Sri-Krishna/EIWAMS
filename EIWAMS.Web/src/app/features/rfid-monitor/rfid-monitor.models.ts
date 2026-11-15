export interface AccessLog {
  accessLogId: number;
  externalEventId: string;
  readerId: string;
  readerName: string | null;
  maskedCardUid: string | null;
  cardId: number | null;
  employeeId: number | null;
  employeeName: string | null;
  locationId: number | null;
  locationName: string | null;
  eventType: string;
  decision: string | null;
  denialReason: string | null;
  eventAtUtc: string;
  receivedAtUtc: string;
  processingStatus: string;
}

export interface RfidIngestBody {
  readerId: string;
  externalEventId: string;
  cardUid: string;
  eventType: 'Entry' | 'Exit';
  eventAtUtc: string;
}

export interface RfidIngestResult {
  accessLogId: number;
  processingStatus: string;
  decision: string | null;
  denialReason: string | null;
  violationId: number | null;
  isDuplicate: boolean;
}

export const RFID_POLL_INTERVAL_MS = 15000;

/** Max clock skew the API accepts for future-dated events. */
export const RFID_MAX_FUTURE_MS = 5 * 60 * 1000;

export function isFutureBeyondSkew(eventAt: Date, now: Date = new Date()): boolean {
  return eventAt.getTime() - now.getTime() > RFID_MAX_FUTURE_MS;
}
