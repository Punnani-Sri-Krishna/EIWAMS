export interface Incident {
  incidentId: number;
  incidentNumber: string;
  violationId: number | null;
  incidentType: string;
  title: string;
  description: string | null;
  severity: string;
  status: string;
  locationId: number | null;
  locationName: string | null;
  assignedToUserId: number | null;
  assignedToName: string | null;
  resolution: string | null;
  openedByName: string | null;
  openedAtUtc: string;
  closedAtUtc: string | null;
  version: string | null;
}

export interface IncidentNote {
  noteId: number;
  note: string;
  createdByName: string | null;
  createdAtUtc: string;
}

export interface IncidentDetail extends Incident {
  notes: IncidentNote[];
}

export interface CreateIncidentBody {
  title: string;
  description: string | null;
  incidentType: string;
  severity: string;
  violationId: number | null;
  locationId: number | null;
  assignedToUserId: number | null;
}

/** PATCH body: omitted/null fields are left unchanged by the API. */
export interface UpdateIncidentBody {
  status?: string | null;
  assignedToUserId?: number | null;
  resolution?: string | null;
  note?: string | null;
  version: string | null;
}
