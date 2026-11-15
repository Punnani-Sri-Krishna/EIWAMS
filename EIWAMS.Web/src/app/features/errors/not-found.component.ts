import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-not-found',
  imports: [RouterLink, MatButtonModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="error-page">
      <mat-icon class="big">travel_explore</mat-icon>
      <h1>Page not found</h1>
      <p>The page you are looking for does not exist or has been moved.</p>
      <a mat-flat-button routerLink="/dashboard">Go to dashboard</a>
    </div>
  `,
  styles: `
    .error-page { min-height: 70vh; display: grid; place-content: center; justify-items: center; text-align: center; gap: 8px; padding: 24px; }
    .big { font-size: 64px; width: 64px; height: 64px; color: #0E6E83; }
    h1 { margin: 0; color: #0B3C5D; }
    p { max-width: 420px; color: #5b6b7a; }
  `,
})
export class NotFoundComponent {}
