# Cloudflare Tunnel

The tunnel publishes `https://eiwams.example.com` without opening inbound firewall ports. Cloudflare
terminates TLS and forwards the traffic to IIS on `http://localhost:80`. IIS serves the SPA and proxies
`/api` to the Functions host.

## One-time setup

```powershell
winget install --id Cloudflare.cloudflared
cloudflared tunnel login                         # choose the zone that hosts eiwams.example.com
cloudflared tunnel create eiwams                  # prints <TUNNEL-UUID> and writes <TUNNEL-UUID>.json
cloudflared tunnel route dns eiwams eiwams.example.com
```

1. Copy [`config.yml`](config.yml) to `C:\ProgramData\cloudflared\config.yml`.
2. Replace `<TUNNEL-UUID>` and the hostname.
3. Move the credentials JSON into `C:\ProgramData\cloudflared\`.
4. Validate the config and install the service:

```powershell
cloudflared tunnel --config C:\ProgramData\cloudflared\config.yml ingress validate
cloudflared tunnel --config C:\ProgramData\cloudflared\config.yml ingress rule https://eiwams.example.com/api/auth/config
cloudflared service install
Get-Service cloudflared
```

## Notes

* The IIS site binding host name must match `httpHostHeader` (or leave the binding host name blank).
* Add `https://eiwams.example.com` to the **EIWAMS-Web** SPA registration's redirect URIs (its client ID replaces the `00000000-0000-0000-0000-000000000000` placeholder once registered). See [`docs\ENTRA-SETUP.md`](../../docs/ENTRA-SETUP.md).
* Same origin: the SPA calls `/api` on the tunnel host, so production needs no CORS settings.
* Keep the credentials JSON private. Never commit it.
* Optional: put Cloudflare Access in front of the hostname as an extra gate. Entra ID still performs
  application authentication.
