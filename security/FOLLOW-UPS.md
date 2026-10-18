# Security follow-ups (internal, not part of the Zoom submission)

These items were removed from the policy documents on 2026-10-17 because they weren't in place yet. Once each one is done, add it back to the listed document(s), rebuild the PDFs, and re-upload them.

## 1. Turn on two-factor login (MFA)
- **Do:** enable MFA on the Zoom account that owns the app, and on the GitHub account (`danielbermudez619`). Do the same for the hosting account once there is one (item 3).
- **Then add back:** in `dependency-management.md` §2, change the Access row to say each account requires a unique strong password and MFA. In `incident-response.md` §4.3, add "re-check MFA" to the compromised-account step.

## 2. Turn on Dependabot alerts
- **Do:** GitHub → Timeontherecord repo → Settings → Code security → enable **Dependabot alerts**.
- **Then add back:**
  - `vulnerability-management.md` §2, a new row: "GitHub Dependabot alerts on the source repository | Continuous; alerts reviewed within 2 business days".
  - `dependency-management.md` §2, Source code row: "Dependabot alerts are enabled."

## 3. Move production to a cloud host
- **Why:** the app runs on this PC through a Cloudflare quick tunnel (`*.trycloudflare.com`). That address changes every time the tunnel restarts, which breaks the Zoom app's configured URLs, and the app goes offline whenever the PC is off.
- **Do:** deploy to a managed host (e.g. Render, Railway, Fly.io) with:
  - HTTPS and a managed TLS certificate;
  - secrets in the host's encrypted environment variables;
  - MFA on the account;
  - deploys from `main` using `npm ci`.

  Then update the app's URLs in the Zoom Marketplace.
- **Then add back:**
  - `dependency-management.md` §2: a Hosting row naming the host; Transport via the host's TLS; secrets in the host's encrypted environment-variable store; OS patching handled by the host; logs kept in the host's log viewer (with its retention period); rotation by updating the host's environment variables and redeploying; and "Production installs use `npm ci`" in §1.3.
  - `ssdlc.md` §2.5: production runs on that host and is deployed from `main` with `npm ci`; secrets live in the host's secret store.
  - `incident-response.md`:
    - hosting account compromise as an incident example and SEV-1 example;
    - hosting provider alerts as a detection source;
    - "update the host's environment variables, and redeploy" in §4.3;
    - a hosting support contact in §7.

## 4. Re-run DAST against production
- **Do:** after item 3, run the OWASP ZAP scan against the production HTTPS URL (see `ssdlc.md` §4), and replace `evidence/dast-zap-report.*`.

## 5. Optional: complete DAST coverage
- **Do:** update ZAP's Selenium add-on so its DOM-XSS rule can drive Chrome, then re-run the scan.
