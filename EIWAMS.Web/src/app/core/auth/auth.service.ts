import { Injectable, inject } from '@angular/core';
import { AccountInfo, PublicClientApplication } from '@azure/msal-browser';
import { firstValueFrom } from 'rxjs';

import { SessionService } from '../services/session.service';
import { AuthConfig, AuthConfigService } from './auth-config.service';

export const DEV_USER_KEY = 'eiwams.devUserId';

/** Signs users in either with the development header (`X-User-Id`) or Microsoft Entra ID (MSAL). */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly configService = inject(AuthConfigService);
  private readonly session = inject(SessionService);
  private msal: PublicClientApplication | null = null;
  private msalReady: Promise<PublicClientApplication | null> | null = null;

  get mode() {
    return this.configService.mode;
  }

  get devUserId(): string | null {
    return sessionStorage.getItem(DEV_USER_KEY);
  }

  /** Loads auth config and (for Entra ID) initializes MSAL and processes any redirect response. */
  async init(): Promise<void> {
    const config = await firstValueFrom(this.configService.load());
    if (config.mode === 'EntraId') {
      await this.ensureMsal(config);
    }
  }

  isSignedIn(): boolean {
    return this.mode === 'DevHeader' ? !!this.devUserId : !!this.account();
  }

  signInAsDevUser(userId: number | string): void {
    sessionStorage.setItem(DEV_USER_KEY, String(userId));
    this.session.clear();
  }

  async signInWithMicrosoft(): Promise<void> {
    const config = this.configService.config();
    const msal = config ? await this.ensureMsal(config) : null;
    await msal?.loginRedirect({ scopes: config?.apiScope ? [config.apiScope] : [] });
  }

  /** Returns an access token for the API scope, falling back to an interactive redirect. */
  async getAccessToken(): Promise<string | null> {
    const config = this.configService.config();
    if (!config || config.mode !== 'EntraId' || !config.apiScope) {
      return null;
    }
    const msal = await this.ensureMsal(config);
    const account = this.account();
    if (!msal || !account) {
      return null;
    }
    const request = { scopes: [config.apiScope], account };
    try {
      return (await msal.acquireTokenSilent(request)).accessToken;
    } catch {
      await msal.acquireTokenRedirect(request);
      return null;
    }
  }

  clearLocal(): void {
    sessionStorage.removeItem(DEV_USER_KEY);
    this.session.clear();
  }

  async signOut(): Promise<void> {
    this.clearLocal();
    if (this.mode === 'EntraId' && this.msal) {
      await this.msal.logoutRedirect({ account: this.account() ?? undefined, postLogoutRedirectUri: location.origin + '/login' });
    }
  }

  private account(): AccountInfo | null {
    if (!this.msal) {
      return null;
    }
    return this.msal.getActiveAccount() ?? this.msal.getAllAccounts()[0] ?? null;
  }

  private ensureMsal(config: AuthConfig): Promise<PublicClientApplication | null> {
    if (!config.spaClientId) {
      return Promise.resolve(null);
    }
    this.msalReady ??= (async () => {
      const app = new PublicClientApplication({
        auth: {
          clientId: config.spaClientId!,
          authority: config.authority ?? `https://login.microsoftonline.com/${config.tenantId ?? 'common'}`,
          redirectUri: location.origin,
        },
        cache: { cacheLocation: 'sessionStorage' },
      });
      await app.initialize();
      const result = await app.handleRedirectPromise();
      if (result?.account) {
        app.setActiveAccount(result.account);
      }
      this.msal = app;
      return app;
    })();
    return this.msalReady;
  }
}
