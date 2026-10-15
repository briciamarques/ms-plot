# Private cloud projects and presets

Both apps use the existing Supabase project `olylsohalgphhxbthyzp`. Only its publishable key is shipped. Row Level Security restricts every item to its authenticated owner. No service-role key is used.

## Auth setup required before release

Supabase → Authentication → URL Configuration:
- Site URL: `https://ms-plot.vercel.app/`
- Redirect URLs: `https://ms-plot.vercel.app/`, `https://ms-generator.vercel.app/`, `http://127.0.0.1:8765/`

Use one email/password account across both sites. Confirm the signup email. Default Supabase email delivery may be restricted to project-team addresses; configure SMTP before inviting other users. Do not disable confirmation to bypass email configuration.

## Use

Open **My cloud projects & presets** at the top. Sign in, name the current project and choose **Save project to cloud**. Open existing projects from the cloud list. Saving an opened project updates it only if its revision has not changed elsewhere. **Save as new copy** preserves a separate version.

Save presets as a named set. Loading a set asks for confirmation and keeps previous stores under `msCloudPresetRecovery:<site>:<timestamp>` in localStorage. MS Generator can import all browser-saved projects; identical imports are skipped using a content fingerprint. Nothing imports automatically. MS Plot's current project can be saved directly; exported project files can first be opened using the existing file control.

The cloud contains structured projects, spectra and settings, not original vendor RAW files. Limit: 19 MB per item in the UI, 20 MB JSON in the database. Explicit saving is required; this is not continuous autosave. Local editing and file backup continue to work without login. The Thermo reader still runs locally with ProteoWizard.

## Dependency provenance

`vendor/supabase-2.117.3.js` (under `public/` for MS Plot) is the pinned Supabase JS UMD distribution from `https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/dist/umd/supabase.js`. It is vendored so sign-in does not depend on a third-party CDN request at runtime.

SHA-256: d6a5c4414a5d4ce646d9c1de223aa7067d3ff664c15394ffeb7fcffc763354a3

## Validation

Production build and existing project tests; DOM integration tests with mocked cloud transport cover save/open, revision conflicts, presets and failure states. Transactional database tests verified cross-user isolation, revision increments and denied anonymous access, then rolled back all fixtures. Real signup/email confirmation requires the owner to finish auth setup and sign in. No user credentials are generated or collected by the development agent.

Visual browser verification was unavailable in the build environment because the Chromium download failed. Live signup still requires owner verification.
