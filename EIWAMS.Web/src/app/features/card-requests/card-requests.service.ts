import { Injectable, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Observable, switchMap } from 'rxjs';

import { PagedResult, QueryParams } from '../../core/models/api.models';
import { ApiService } from '../../core/services/api.service';
import { askReason } from '../approvals/kit/ui.components';
import {
  CARD_ACTION_META,
  CARD_COMMENTS_MAX,
  CardRequest,
  CardRequestAction,
  CardRequestDetail,
  CardRequestStage,
  CreateCardRequestBody,
  buildCardDecisionBody,
} from './card-requests.models';

/** v2 card request workflow (contract §6 "Card requests (v2)"). */
@Injectable({ providedIn: 'root' })
export class CardRequestsService {
  private readonly api = inject(ApiService);
  private readonly dialog = inject(MatDialog);

  search(query: QueryParams): Observable<PagedResult<CardRequest>> {
    return this.api.getPaged<CardRequest>('v1/card-requests', query);
  }

  queue(stage: CardRequestStage, query: QueryParams): Observable<PagedResult<CardRequest>> {
    return this.api.getPaged<CardRequest>('v1/card-requests/queue', { ...query, stage });
  }

  get(id: number): Observable<CardRequestDetail> {
    return this.api.get<CardRequestDetail>(`v1/card-requests/${id}`);
  }

  create(body: CreateCardRequestBody): Observable<CardRequestDetail> {
    return this.api.post<CardRequestDetail>('v1/card-requests', body);
  }

  decide(id: number, action: CardRequestAction, comments: string | null, version: string | null): Observable<CardRequestDetail> {
    return this.api.post<CardRequestDetail>(`v1/card-requests/${id}/decision`, buildCardDecisionBody(action, comments, version));
  }

  /** Opens the comments dialog (required for Reject) and posts the decision with the row/detail version. */
  decideWithPrompt(
    target: Pick<CardRequest, 'cardRequestId' | 'requestNumber' | 'employeeName' | 'requestType' | 'version'>,
    action: CardRequestAction,
  ): Observable<CardRequestDetail> {
    const meta = CARD_ACTION_META[action];
    const required = meta.commentsRequired;
    const subject = `${target.employeeName ?? ''} · ${target.requestType} card`;
    return askReason(this.dialog, {
      title: `${meta.label} ${target.requestNumber}`,
      message: meta.confirmMessage ? `${subject}. ${meta.confirmMessage}` : subject,
      label: required ? 'Comments (required)' : 'Comments (optional)',
      required,
      maxLength: CARD_COMMENTS_MAX,
      confirmText: meta.label,
      danger: meta.style === 'danger' || action === 'Cancel',
    }).pipe(switchMap((r) => this.decide(target.cardRequestId, action, r.text, target.version)));
  }
}
