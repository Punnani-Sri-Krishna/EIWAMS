import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiService } from './api.service';

export interface ActiveCardSummary {
  cardId: number;
  maskedUid: string;
  status: string;
  issuedAtUtc: string | null;
  expiresAtUtc: string | null;
}

/** GET v1/me/profile (contract §6). */
export interface MyProfile {
  employeeId: number;
  employeeNumber: string;
  fullName: string;
  workEmail: string | null;
  designation: string | null;
  departmentName: string | null;
  managerName: string | null;
  managerEmail: string | null;
  locationName: string | null;
  employmentStatus: string;
  joinDate: string | null;
  mobileNumber: string | null;
  address: string | null;
  bloodGroup: string | null;
  emergencyContactName: string | null;
  emergencyContactNumber: string | null;
  hasPhoto: boolean;
  activeCard: ActiveCardSummary | null;
}

export interface ContactDetails {
  mobileNumber: string | null;
  address: string | null;
  bloodGroup: string | null;
  emergencyContactName: string | null;
  emergencyContactNumber: string | null;
}

export interface PhotoDto {
  contentType: 'image/jpeg' | 'image/png';
  photoBase64: string;
  sizeBytes: number;
  uploadedAtUtc: string;
}

export interface PhotoInfo {
  hasPhoto: true;
  contentType: string;
  sizeBytes: number;
  uploadedAtUtc: string;
}

export interface PhotoUpload {
  photoContentType: string;
  photoBase64: string;
}

/** Signed-in user's employee profile and photo, plus reviewer access to employee photos. */
@Injectable({ providedIn: 'root' })
export class MeService {
  private readonly api = inject(ApiService);

  profile(): Observable<MyProfile> {
    return this.api.get<MyProfile>('v1/me/profile');
  }

  updateProfile(body: ContactDetails): Observable<MyProfile> {
    return this.api.put<MyProfile>('v1/me/profile', body);
  }

  photo(): Observable<PhotoDto> {
    return this.api.get<PhotoDto>('v1/me/photo');
  }

  putPhoto(body: PhotoUpload): Observable<PhotoInfo> {
    return this.api.put<PhotoInfo>('v1/me/photo', body);
  }

  employeePhoto(employeeId: number): Observable<PhotoDto> {
    return this.api.get<PhotoDto>(`v1/employees/${employeeId}/photo`);
  }
}
