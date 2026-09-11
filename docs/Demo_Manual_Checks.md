# Demo manual checks (phone)

What the SQL test could not cover. Do these on clariq-demo.netlify.app, on a
phone, signed in as Demo Staff (clariqnz+staff@gmail.com) unless stated.
Tick, date and initial each line; keep the sheet in docs/.

1. Sign-in email arrives from "Clariq" within a minute, link opens the app signed in.
2. Add to Home Screen; the icon opens full screen with no browser bar.
3. Scan a container: tap Scan a container, point at any printed test label or a
   QR of https://clariq-demo.netlify.app/c/CLQ-000005 shown on another screen.
   The card for that container appears with only its allowed actions.
4. Action list matches role: as Demo Staff (Warehouse) an IN_STOCK container
   offers Fill; sign in as Demo Customer and the same container shows no actions.
5. Audit walk as Demo Staff: Do an audit walk, pick Waikato Dairy Services,
   Hamilton Plant, start. Scan or type a container at that site, Add a new
   location (any room), take a photo, condition OK, save. Sighted count
   increments. This was broken before 10 Sep 2026 for this role.
6. Photo attach: the sighting above shows its photo on the container timeline.
7. Ask Clariq: ask "what must a hazardous substances inventory contain in New
   Zealand". Answer carries numbered citations and the disclaimer. Then ask
   "am I compliant" and confirm it refuses.
8. No signal: put the phone in flight mode, open a container card that was
   already viewed, attempt an action. Expect "Can't reach Clariq" and no
   crash; turn the network back on and the action succeeds on retry.
9. Demo banner visible at the top of every screen; open clariq-hub.netlify.app
   and confirm there is no banner.
10. Reload after the reset: after Greg runs reset_demo(), the fleet is back to
    144 containers and the location added in step 5 is gone.

Checked by: ____________  Date: ____________
