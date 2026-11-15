import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-unauthorized',
  imports: [RouterLink, MatButtonModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="error-page">
      <mat-icon class="big">lock</mat-icon>
      <h1>Access denied</h1>
      <p>You do not have permission to view this page. Contact your administrator if you believe this is a mistake.</p>
      <a mat-flat-button routerLink="/dashboard">Back to dashboard</a>
    </div>
  `,
  styles: `
    .error-page { min-height: 70vh; display: grid; place-content: center; justify-items: center; text-align: center; gap: 8px; padding: 24px; }
    .big { font-size: 64px; width: 64px; height: 64px; color: #0E6E83; }
    h1 { margin: 0; color: #0B3C5D; }
    p { max-width: 420px; color: #5b6b7a; }
  `,
})
export class UnauthorizedComponent {}
