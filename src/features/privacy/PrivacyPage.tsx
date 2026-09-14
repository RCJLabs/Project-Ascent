import { Link } from 'wouter';
import { Check, Share2, ShieldCheck, Upload } from 'lucide-react';
import { BackLink } from '@/ui/BackLink';
import { Card } from '@/ui/Card';
import { PageHeader } from '@/ui/PageHeader';

/**
 * What the app does with what you tell it (PLAN.md M171).
 *
 * ## Why this is a page and not a paragraph in a guide
 *
 * The app guide has said *"nothing leaves the device"* since M0 and that is
 * true, but it says it in passing, inside a manual you read once. A privacy
 * statement is a different kind of document: it is the one a climber goes
 * looking for before they trust an app with a year of training, and it is the
 * one a store listing has to link to. So it has its own route, its own place
 * in search, and a URL that can be pointed at from outside the app.
 *
 * ## Every claim here is checkable, and `privacy.test.ts` checks it
 *
 * A privacy page that overclaims is worse than none, so the strong sentences
 * on this page are not promises — they are facts about the source, and the
 * test beside this file reads the source to hold them:
 *
 * - **No network calls.** `src/` contains no `fetch`, no `XMLHttpRequest`, no
 *   `sendBeacon`, no `WebSocket`, no `EventSource`. The catalogue "fetched,
 *   not imported" (M78) is a dynamic `import()` of a bundled chunk, which is
 *   the app loading its own code.
 * - **No third party.** The built bundle names no external host, the
 *   stylesheet loads no remote font, and `index.html` carries no tag pointing
 *   anywhere but this origin.
 * - **No analytics or telemetry** of any kind, under any name.
 *
 * ## And the honest limits, which is the half most pages leave out
 *
 * The web version is served over the internet, so whoever hosts it sees the
 * requests for the app's own files the way every website does. An installed
 * copy still asks for updates. The share sheet hands an image to whichever
 * app you pick, and what that app does with it is its business. A backup file
 * put into cloud storage is a copy of everything, outside this app's reach.
 * None of that is the app sending your log anywhere, and all of it is worth
 * saying out loud.
 */
export function PrivacyPage() {
  return (
    <>
      <BackLink />
      <PageHeader
        title="Privacy"
        subtitle="What this app does with what you tell it, and what it cannot do."
      />

      <Card>
        <p className="text-sm leading-relaxed flex items-start gap-2">
          <ShieldCheck size={18} className="text-positive shrink-0 mt-0.5" aria-hidden />
          <span>
            <strong>Nothing you log leaves this device.</strong> There is no account, no server, no
            sync and no analytics. Your sessions, grades, photos, notes, injuries and everything
            derived from them are stored by this browser, on this device, and are never sent
            anywhere.
          </span>
        </p>
      </Card>

      <Card title="How you can tell">
        <p className="text-sm text-ink-soft leading-relaxed mb-3">
          That is a strong claim, so it is held by the code rather than by this page. A test reads
          the source on every build and fails if any of it stops being true.
        </p>
        <ul className="grid grid-cols-1 gap-2">
          {[
            'The app makes no network requests at all — no fetch, no XMLHttpRequest, no beacon, no websocket.',
            'It loads nothing from anyone else: no fonts, no scripts, no tracking pixels, no CDN.',
            'There is no analytics library, no crash reporter and no telemetry under any name.',
            'It works in aeroplane mode, permanently, because there is nothing for it to reach.',
          ].map((line) => (
            <li key={line} className="flex items-start gap-2 text-sm leading-relaxed">
              <Check size={15} className="text-positive shrink-0 mt-0.5" aria-hidden />
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Where your training actually lives">
        <p className="text-sm leading-relaxed mb-2">
          In this browser&rsquo;s own storage, under this site&rsquo;s address, on this device.
          Photos are kept there as files rather than uploaded. Nothing is in a cloud, because there
          is no cloud to put it in.
        </p>
        <p className="text-sm text-ink-soft leading-relaxed">
          That is also the cost. There is no sync between your phone and your laptop, no way to
          recover the log if you clear this site&rsquo;s data or lose the device, and no password
          reset because there is no password.{' '}
          <Link href="/settings" className="text-accent underline underline-offset-2">
            Export a backup
          </Link>{' '}
          and keep it somewhere you trust.
        </p>
      </Card>

      <Card title="The things that do leave, when you ask them to">
        <ul className="grid grid-cols-1 gap-3">
          <li className="flex items-start gap-2 text-sm leading-relaxed">
            <Upload size={15} className="text-ink-soft shrink-0 mt-0.5" aria-hidden />
            <span>
              <strong>A backup file.</strong> You choose where it goes. It contains everything,
              photos included — so a copy in cloud storage is a copy of your whole log outside this
              app, subject to whatever that service does.
            </span>
          </li>
          <li className="flex items-start gap-2 text-sm leading-relaxed">
            <Share2 size={15} className="text-ink-soft shrink-0 mt-0.5" aria-hidden />
            <span>
              <strong>A share card.</strong> Sharing a session or a year hands one image to your
              device&rsquo;s share sheet, and where it goes from there is between you and the app
              you pick.
            </span>
          </li>
        </ul>
        <p className="text-xs text-ink-soft leading-relaxed mt-3">
          Both happen only on a tap, and neither is the app deciding to send anything.
        </p>
      </Card>

      <Card title="What hosting can see">
        <p className="text-sm leading-relaxed mb-2">
          Said plainly, because &ldquo;offline-first&rdquo; is not the same as invisible. The web
          version is served over the internet, so whoever hosts it sees what every website sees —
          that a browser at some address asked for the app&rsquo;s files, and when. An installed
          copy still checks for updates the same way.
        </p>
        <p className="text-sm text-ink-soft leading-relaxed">
          What it never sees is the contents: no session, no grade, no photo, no note is ever part
          of that request, because the app has no code that would put it there.
        </p>
      </Card>

      <Card title="What is never asked for">
        <p className="text-sm text-ink-soft leading-relaxed mb-2">
          No email address, no name, no sign-in. No location, no contacts, no microphone, no health
          or fitness data from your device, and no camera unless you pick a photo yourself.
        </p>
        <p className="text-sm text-ink-soft leading-relaxed">
          The app asks the browser for two things and nothing else: permission to keep its storage
          from being evicted, and permission to hold the screen awake while a rest timer is
          counting.
        </p>
      </Card>

      <Card title="Deleting it">
        <p className="text-sm leading-relaxed mb-2">
          <Link href="/settings" className="text-accent underline underline-offset-2">
            Settings
          </Link>{' '}
          has a delete that empties everything the app has stored, behind a typed confirmation.
          Clearing this site&rsquo;s data in your browser does the same thing, and so does
          uninstalling on some platforms.
        </p>
        <p className="text-sm text-ink-soft leading-relaxed">
          There is no copy anywhere else to ask about, no request to make of anyone, and nothing to
          wait for. When it is gone it is gone — which is why the backup is worth making first.
        </p>
      </Card>

      <Card title="If this ever changes">
        <p className="text-sm text-ink-soft leading-relaxed">
          Any feature that sent your training anywhere would be a change to the checks described
          above, and this page would have to change with it. Until then, the honest summary is the
          first line: it is on your device, and that is the whole of it.
        </p>
      </Card>
    </>
  );
}
