PUJO SECRET SOCIETY — FINAL LIVE DEPLOY PACKAGE

THIS PACKAGE DOES NOT CONTAIN THE OLD "Demo preview: code PUJO2026" PORTAL.
The landing page validates invitations through the Netlify function at
/.netlify/functions/validate-invite. The live game and host console use the
Netlify game API.

FILES AT THE DEPLOY ROOT
- index.html
- game.html
- host.html
- netlify.toml
- netlify/functions/validate-invite.mjs
- netlify/functions/game-api.mjs
- SQL reference files

DEPLOY TO YOUR EXISTING NETLIFY SITE
1. Download and extract this ZIP.
2. Open the existing Netlify site that owns pujonoirandoak.in.
3. Go to Deploys and use the manual deploy / Netlify Drop area.
4. Upload the extracted pujo-live-final folder (or drag the folder's contents
   into the deploy area). Do NOT upload the ZIP as a single file, and do NOT
   upload an older site folder.
5. Wait until the deploy is marked Published. Then open the deployment's
   own *.netlify.app URL first, followed by https://pujonoirandoak.in.
6. Hard-refresh (Ctrl+Shift+R) or use a private/incognito window.

REQUIRED NETLIFY ENVIRONMENT VARIABLES
- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY
- HOST_ACCESS_KEY

Set these in Netlify Project configuration > Environment variables, then
trigger a fresh production deploy. The service-role key must remain server-side
in Netlify and must never be placed in HTML or browser JavaScript.

VERIFY THE CORRECT BUILD
The deployed index.html contains this source marker:
"PUJO LIVE PORTAL BUILD 2026-09-28"
The guest portal should not display the old demo-preview paragraph or accept
PUJO2026 as a demo fallback. It should verify the issued active invitation
code through the Netlify function.

IF THE OLD PAGE STILL APPEARS
That means the new files are not the files being served by the domain, the
deploy was not published to the correct Netlify site, or a browser cache is
showing an older page. Compare the deployment URL and custom domain before
changing Supabase. This package cannot itself publish to your Netlify account;
the deploy must be performed while signed in to the Netlify site.

GAME NOTES
Keep the host console open during play. Automatic progression is driven by
the host browser timer. Test with two approved invitations before the event.
