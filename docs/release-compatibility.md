# Release compatibility with older NastyTavern versions

## Publishing a release

The Home update checker in **NastyTavern 0.1.13** already compares the `version`
field of `manifest.json` with the installed version. It always fetches the same
public URLs on the `main` branch:

- `https://raw.githubusercontent.com/AnNastyLoneGirl/NastyTavern-UI/main/manifest.json`
- `https://raw.githubusercontent.com/AnNastyLoneGirl/NastyTavern-UI/main/CHANGELOG.md`

To support already-installed clients:

1. Commit and push the **entire updated extension directory** onto `main`.
   The published `manifest.json` must contain the new, higher semantic version
   (e.g. `0.1.14`, not only a higher revision).
2. Keep the release heading in `CHANGELOG.md` in the exact form
   `## v0.1.14`, with optional `###` subsections for maintenance revisions.
   The v0.1.13 changelog reader does not recognize a heading such as
   `## 0.1.14 — revision 114`.
3. After pushing, open the raw `manifest.json` URL above in a fresh browser
   session and check that the published version has changed. Run
   `node tests/legacy-update-compat.mjs` before every 0.1.14 maintenance push.

## Users still on v0.1.13

- Git-installed extensions should detect 0.1.14 as soon as the remote manifest
  is refreshed. If their build has **Check again**, use it; otherwise reload
  SillyTavern or reopen it after the session cache expires (15 minutes).
- CDN/proxy caching or a network failure can still delay or block the Home
  notification. No change to the 0.1.14 code can alter the older update checker
  already running in someone's browser.
- **Extensions → Manage Extensions → Update** uses SillyTavern's native Git
  update flow and is the recommended fallback for Git installations.
- A ZIP/manual installation does not have the Git repository metadata required
  for native one-click updates. It must be replaced manually or reinstalled
  from the GitHub extension URL using the SillyTavern extension installer.

The manifest/changelog URLs must remain available, as old clients have them
hardcoded. Do not claim that old browsers will *always* see a new release
immediately: network and caching remain outside the extension's control.
