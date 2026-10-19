# Reviewer Test Plan: Time on the record

**App:** Time on the record (Zoom App)
**Contact:** danielbermudez6one9@gmail.com

## What the app does
Time on the record shows a running total of how long **cloud recording** has been active in the current meeting. The total is shared, so everyone in the meeting who opens the app sees the same number.

## Login and credentials
The app has **no separate login**. It has no usernames or passwords of its own. It runs inside the Zoom client and authorizes only through Zoom OAuth, so there are no test credentials to provide. Reviewers can use their own Zoom account.

## Requirements
- A Zoom account with **cloud recording enabled**: a licensed account, with Settings → Recording → Cloud recording turned on. The app reads cloud-recording status only; local recording is not detected.
- The Zoom desktop client, recent version, with Zoom Apps enabled.
- To test multi-participant sync (case 8): a second Zoom account or device joined to the same meeting.

## Install
1. Open the Production install link provided with this submission and sign in with the reviewer's Zoom account.
2. Review the requested permissions and click **Allow**.

**Expected:** the app is added to the account. Any authorization window closes by itself, or shows "Authorized. This window will close automatically…".

## Test cases

| # | Steps | Expected result |
|---|---|---|
| 1 | Open the **Apps** tab in the Zoom client **outside a meeting** and open Time on the record. | The panel says "This window isn't attached to a meeting" and explains to launch it from inside a meeting. |
| 2 | Start a meeting as host. Click **Apps** in the meeting toolbar and launch Time on the record. | The panel opens docked in the meeting: status **Not recording**, timer **00:00:00**, and the message "Synced with cloud recording for everyone in this meeting." |
| 3 | Click **Record → Record to the Cloud**. | Within a few seconds, the status changes to **Recording**, the status dot pulses, and the timer counts up each second. |
| 4 | While recording, type a label in **Log a marker…** and click **Log** (or press Enter). | The marker appears in the "Markers (this device)" list with the elapsed time. Markers can only be logged while recording, and are kept only on this device. |
| 5 | Click **Pause** in Zoom's recording controls. | The status shows **Recording paused** and the timer stops. |
| 6 | Click **Resume**. | The status shows **Recording** and the timer continues from the paused value. It does not restart from zero. |
| 7 | Click **Stop** recording. | The status shows **Not recording** and the timer keeps the total. A Zoom notification reads "Recording stopped: Total recorded time: hh:mm:ss". |
| 8 | *(Optional, needs a second participant.)* Have a second participant open the app in the same meeting, then start and stop recording again. | Both panels show the same total, within about 4 seconds of each other. |
| 9 | With recording stopped, click **Reset total (everyone)**. | The timer returns to **00:00:00** for every participant with the app open. |
| 10 | End the meeting. Start a **new** meeting and open the app. | The timer starts at **00:00:00**. Each meeting has its own total. |
| 11 | Remove the app: Zoom App Marketplace → **Manage → Added Apps** → Time on the record → **Remove**. | The app is removed. The app's deauthorization endpoint receives Zoom's notification and confirms data compliance. The app stores no user-linked data to delete. |

## Data handled during testing
- **Stored:** the meeting UUID and recording-time totals (in server memory).
- **Not stored:** OAuth tokens, user profiles, meeting content, recordings and marker text.

Details are in the Privacy Policy at `/privacy.html`.

## Support
- Documentation: `/documentation.html`
- Support: `/support.html`
- Email: danielbermudez6one9@gmail.com
