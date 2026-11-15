# IIS hosting for EIWAMS.Web

IIS serves the Angular build as static files and reverse-proxies `/api/*` to the Azure Functions
host on `http://127.0.0.1:7274`. The browser sees a single origin, so production needs no CORS settings.

```
Browser --HTTPS--> Cloudflare Tunnel --> IIS :80 --+-- /        -> dist\EIWAMS.Web\browser (SPA, fallback to index.html)
                                                   +-- /api/*   -> http://127.0.0.1:7274/api/*  (ARR proxy)
```

## Prerequisites

| Component | Notes |
|---|---|
| IIS Web Server role | Static Content, Default Document, Static Compression |
| URL Rewrite 2.1 | https://www.iis.net/downloads/microsoft/url-rewrite |
| Application Request Routing 3.0 | https://www.iis.net/downloads/microsoft/application-request-routing (install **after** URL Rewrite) |

No ASP.NET Core Hosting Bundle is needed: IIS only serves static files and proxies.

## Setup

```powershell
# from EIWAMS\ in an elevated PowerShell
.\deploy\Build-All.ps1                      # produces deploy\out\web
.\deploy\iis\Setup-IIS.ps1 -SitePath C:\inetpub\EIWAMS -Port 80 -HostName eiwams.example.com
```

`Setup-IIS.ps1` is idempotent. It:

1. Enables the ARR proxy (`system.webServer/proxy enabled=true`) at server level.
2. Creates app pool **EIWAMS** (*No Managed Code*, Integrated pipeline, ApplicationPoolIdentity, AlwaysRunning).
3. Copies the build output into `-SitePath` and grants the pool identity read access.
4. Creates or updates site **EIWAMS** bound to `-Port` / `-HostName`.
5. Ensures `web.config` from this folder is present in the site root (`-ApiUpstream` changes the proxy target).

## web.config

[`web.config`](web.config) is the same file that ships in `EIWAMS.Web\public\web.config`:

| Rule | Match | Action |
|---|---|---|
| Proxy API to local Azure Functions | `^api/(.*)$` | Rewrite to `http://127.0.0.1:7274/api/{R:1}`, query string kept |
| Angular client-side routes | any path that is not a file or folder | Rewrite to `/` (`index.html`) |

`index.html` is served with caching disabled. Hashed bundles are cached for one year.

## Updating the site

Rerun `Build-All.ps1`, then `Setup-IIS.ps1`, or copy `deploy\out\web\*` over the site root. Static files
need no app-pool recycle.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `/api/...` returns 404 from IIS | ARR proxy is disabled or URL Rewrite is missing. Rerun `Setup-IIS.ps1`. |
| `/api/...` returns 502.3 | The Functions host isn't running on 7274. Check the `EIWAMS-API` service. |
| A deep link such as `/access-requests/12` returns 404 | `web.config` is missing from the site root. |
| 500.19 on site load | URL Rewrite isn't installed, so IIS doesn't recognize the `<rewrite>` section. |
