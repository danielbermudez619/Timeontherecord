# Security follow-ups (internal, not part of the Zoom submission)

These items were removed from the policy documents on 2026-10-17 because they weren't in place yet. Once each one is done, add it back to the listed document(s), rebuild the PDFs, and re-upload them.

## 1. Turn on two-factor login (MFA)
- **Do:** enable MFA on the Zoom account that owns the app, and on the GitHub account (`danielbermudez619`). Do the same for the Render account.
- **Then add back:** in `dependency-management.md` §2, change the Access row to say each account (Zoom, GitHub, Render) requires a unique strong password and MFA. In `incident-response.md` §4.3, add "re-check MFA" to the compromised-account step.

## 2. Turn on Dependabot alerts
- **Do:** GitHub → Timeontherecord repo → Settings → Code security → enable **Dependabot alerts**.
- **Then add back:**
  - `vulnerability-management.md` §2, a new row: "GitHub Dependabot alerts on the source repository | Continuous; alerts reviewed within 2 business days".
  - `dependency-management.md` §2, Source code row: "Dependabot alerts are enabled."

## 3. Production hosting (mostly done)
Production now runs on Render (`timeontherecord.onrender.com`), and the policy documents describe it. Still open:
- **Render build command:** if it is `npm install`, change it to `npm ci` in Render → Settings → Build Command. Then add "Production installs use `npm ci`" back to `dependency-management.md` §1.3.
- **Render plan:** on the free plan the service sleeps after about 15 minutes idle. The first request can then take about a minute, and in-memory timer totals reset. A paid instance avoids this during Zoom's review.

## 4. Re-run DAST against production
- **Do:** run the OWASP ZAP scan against https://timeontherecord.onrender.com/ (see `ssdlc.md` §4), and replace `evidence/dast-zap-report.*`.

## 5. Optional: complete DAST coverage
- **Do:** update ZAP's Selenium add-on so its DOM-XSS rule can drive Chrome, then re-run the scan.
