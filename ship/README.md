# Shipping Project Ascent

The ordered steps from here to a Play internal-testing track, with the ones only
you can do marked **[you]**. Everything else is in the repo already.

Two facts are settled and one of them is permanent:

| | |
|---|---|
| Store name | **Project Ascent** (renameable later) |
| Package id | **`com.rcjlabs.projectascent`** — **immutable once published** |
| Origin | **`https://ascent.rcjlabs.com`** |

The package id is reverse-DNS of `rcjlabs.com`. A subdomain rather than the apex
so `rcjlabs.com` stays free for anything else; if you'd rather use the apex, it is
one word in `public/CNAME` and one line in `ship/twa-manifest.json`.

## Read this before step 1

**The origin change strands every existing install's data.** IndexedDB is scoped
to an origin, so a log written at `rcjlabs.github.io/Project-Ascent/` is invisible
at `ascent.rcjlabs.com` — not deleted, just unreachable from the new address. Once
the custom domain is set, GitHub redirects the old URL to the new one, so the old
install stops working rather than sitting there as a fallback.

If you have anything on the old origin worth keeping: **Settings → Export backup**
there first, then open the file on the new origin. M111 made that a file tap.

Pre-launch this is probably only your own device. It will never be cheaper to do
than now.

## 1. Point the domain — **[you]**

At your DNS provider, a `CNAME` record:

```
ascent.rcjlabs.com.   CNAME   rcjlabs.github.io.
```

Then **repo Settings → Pages → Custom domain** → `ascent.rcjlabs.com`, and tick
**Enforce HTTPS** once the certificate is issued (it takes a few minutes; the box
is disabled until then).

`public/CNAME` is already committed and lands in `dist/`, which is what the deploy
workflow uploads — so the setting and the file agree.

## 2. Merge the base change

`vite.config.ts` now serves from `/`, because a Pages **custom domain** serves at
the domain root while a bare project site serves at `/<repo>/`.

**Do not merge the base change to `main` before step 1 is live.** The deploy
workflow publishes on every push to `main`, and a site built for `/` served at
`/Project-Ascent/` is every asset 404ing. `src/ui/launch.test.ts` holds the base
and `public/CNAME` to each other so they cannot drift apart, but it cannot know
whether DNS has propagated.

## 3. Check the live site

- `https://ascent.rcjlabs.com/` loads, installs, and works offline after one visit.
- `https://ascent.rcjlabs.com/manifest.webmanifest` serves `"start_url": "/"`.
- `https://ascent.rcjlabs.com/.well-known/assetlinks.json` serves `[]` — empty for
  now, and that is correct: it asserts nothing until there is an app to assert.

## 4. Build the TWA

`ship/twa-manifest.json` is filled in — package id, host, colours, the three
launcher shortcuts from M111, both icons. Only the signing key is missing.

```sh
npx @bubblewrap/cli init --manifest https://ascent.rcjlabs.com/manifest.webmanifest
# then replace the generated twa-manifest.json with ship/twa-manifest.json
npx @bubblewrap/cli build
```

Bubblewrap will offer to create a keystore. **Keep it, and back it up** — it is the
upload key, and losing it means asking Google to reset it.

## 5. Upload, and only then write assetlinks — **[you]**

Create the app on Play Console with **exactly** `com.rcjlabs.projectascent`, upload
the `.aab` to **internal testing**, and opt into **Play App Signing** (it is the
default and it is what you want).

Now go to **Play Console → Setup → App integrity** and copy the **SHA-256 certificate
fingerprint** — and read this carefully, because it is the step that most often goes
wrong:

> There are two fingerprints on that page. assetlinks must carry the one under
> **"App signing key certificate"**, not **"Upload key certificate"**. Play re-signs
> your upload with the app signing key, so the upload key's fingerprint is not what
> reaches the device. Listing both is allowed and harmless if you want local test
> builds to verify too.

Then fill in `public/.well-known/assetlinks.json`:

```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "com.rcjlabs.projectascent",
      "sha256_cert_fingerprints": ["PASTE:THE:APP:SIGNING:SHA256:HERE"]
    }
  }
]
```

Push to `main`, wait for the deploy, then confirm with:

```
https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://ascent.rcjlabs.com&relation=delegate_permission/common.handle_all_urls
```

`launch.test.ts` will hold that file to this package id and require a fingerprint
on any statement you add — it passes on the empty list, and stops passing on a
half-filled one.

**Until verification succeeds the app shows a Chrome URL bar over the top.** That is
the symptom to look for, and it is almost always this file.

## 6. Store listing — **[you]**

`npm run shots` produces the screenshot set: two sizes, both themes, eight pages, 32
files. It drives the app's own "Load a sample climber" button, so the shots show a
year of plausible training rather than an empty app.

Still needed from you: short description (80 chars), full description, feature graphic
(1024×500), content rating questionnaire, privacy policy URL.

The privacy policy is unusually easy here and worth saying plainly in it: the app has
no account, no server, no analytics and no network calls. Nothing leaves the device.
