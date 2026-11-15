import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { PagedResult, QueryParams } from '../../core/models/api.models';
import { ApiService } from '../../core/services/api.service';
import { Card, CardRequest, CardRequestDecision, CreateCardRequestBody, IssueCardRequest } from './cards.models';

@Injectable({ providedIn: 'root' })
export class CardsService {
  private readonly api = inject(ApiService);

  search(query: QueryParams): Observable<PagedResult<Card>> {
    return this.api.getPaged<Card>('v1/cards', query);
  }

  issue(body: IssueCardRequest): Observable<Card> {
    return this.api.post<Card>('v1/cards', body);
  }

  activate(card: Card): Observable<Card> {
    return this.api.post<Card>(`v1/cards/${card.cardId}/activate`, { version: card.version });
  }

  block(card: Card, reason: string): Observable<Card> {
    return this.api.post<Card>(`v1/cards/${card.cardId}/block`, { reason, version: card.version });
  }

  reportLost(card: Card, reason: string): Observable<Card> {
    return this.api.post<Card>(`v1/cards/${card.cardId}/report-lost`, { reason });
  }

  replace(card: Card, newCardUid: string, reason: string): Observable<Card> {
    return this.api.post<Card>(`v1/cards/${card.cardId}/replace`, { newCardUid, reason, version: card.version });
  }

  deactivate(card: Card, reason: string): Observable<Card> {
    return this.api.post<Card>(`v1/cards/${card.cardId}/deactivate`, { reason, version: card.version });
  }

  searchRequests(query: QueryParams): Observable<PagedResult<CardRequest>> {
    return this.api.getPaged<CardRequest>('v1/card-requests', query);
  }

  createRequest(body: CreateCardRequestBody): Observable<CardRequest> {
    return this.api.post<CardRequest>('v1/card-requests', body);
  }

  decide(id: number, decision: CardRequestDecision, comments: string | null): Observable<CardRequest> {
    return this.api.post<CardRequest>(`v1/card-requests/${id}/decision`, { decision, comments: comments || null });
  }
}
