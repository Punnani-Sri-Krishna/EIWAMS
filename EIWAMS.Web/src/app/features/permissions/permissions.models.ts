export interface AccessPermission {
  permissionId: number;
  employeeId: number;
  employeeName: string | null;
  employeeNumber: string | null;
  locationId: number;
  locationName: string | null;
  accessRequestId: number | null;
  requestNumber: string | null;
  validFromUtc: string;
  validToUtc: string;
  status: string;
  provisionedByName: string | null;
  provisionedAtUtc: string | null;
  revokedAtUtc: string | null;
  revokeReason: string | null;
  controllerSyncStatus: string | null;
}
