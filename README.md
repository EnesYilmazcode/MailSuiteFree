# MailSuiteFree

**The problem:** on a free plan, [Mailsuite](https://mailsuite.com) (formerly
Mailtrack) staples an advert to the bottom of every email you send.

**The fix:** a second Chrome extension that deletes that one `<div>` out of the
compose window before the mail goes out. Read tracking is untouched and keeps
working.

---

## What it removes

This, and only this:

```text
┌──────────────────────────────────────────────────────────┐
│  Hi Bob, here's the doc.                                 │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │ [logo]  Sent with Mailtrack  ·  Unsubscribe  [x]   │  │
│  └────────────────────────────────────────────────────┘  │
│           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^      │
│           this block. nothing else in the message.       │
└──────────────────────────────────────────────────────────┘
```

## How Mailsuite works, and why deleting this is safe

Their extension is a thin client. The tracking happens on **their server**, not
in your browser, and the watermark plays no part in it.

![How it works](docs/how-it-works.svg)

The watermark appears nowhere in that loop. It is an advert sitting in the
message body. Removing it changes nothing about steps 1 through 5.

This extension does not modify, patch or replace Mailsuite. Both run side by
side, and everything of theirs carries on: read receipts, notifications, the
dashboard, campaigns, link tracking. You lose the advert and nothing else.

## Install

Chrome asks for a **folder**, not a file. There is nothing to upload.

1. Open `chrome://extensions`
2. Turn on **Developer mode**, top right
3. Click **Load unpacked**
4. Select the folder holding `manifest.json`, which is the top level of this
   repo. Not `src/`.
5. Reload Gmail

A card reading **Mailsuite Signature Stripper 0.1.0** means it took.

Extensions are per Chrome profile. If you use Gmail in more than one profile,
load it in each.

### Checking it works

Compose an email. The block should vanish on its own, usually within a fraction
of a second of Mailsuite adding it. Click the toolbar icon: the counter going up
is the proof it fired.

If nothing happens, the extension card on `chrome://extensions` grows a red
**Errors** button. That is the first place to look.

## How detection works

Mailsuite labels its own signature, so there is nothing to guess. All seven
signature templates in `gmail.end.bundle.js` (release 12.87.0) render the same
wrapper:

```html
<div id="mt-signature" contenteditable="false" g_editable="false">
  <table data-signature-template="senderNotified" data-signature-version="17">
```

So the primary rule is a plain selector:

```css
#mt-signature, [data-signature-template],
[class*="mt-signature"], [class*="mt-old-signature"]
```

Only the outermost match is taken, since `mt-signature-logo` sits inside
`#mt-signature` and matches the same selector.

**Fallback.** For markup carrying no marker, it looks for a link to
`mailtrack.io` or `mailsuite.com` and climbs to the outermost wrapper holding
*nothing but* signature, stopping the moment a parent contains text you wrote or
an image you inserted. The known signature wording comes from Mailsuite's own
i18n table, all eleven shipped locales.

The fallback gives up easily on purpose. Leaving a signature behind is a much
better failure than eating a paragraph.

```text
   found a promo link
        |
        +-- parent holds your text?     -> leave it alone
        +-- parent holds your image?    -> leave it alone
        +-- parent is signature only?   -> climb, then delete
```

## What it deliberately leaves alone

**The tracking pixel.** That is the part you are paying attention to. If a
beacon ever turns up inside the block, it is lifted out before the block goes.
In practice Mailsuite injects it separately, so this is defensive code for a
case that probably never happens.

**Unsubscribe links.** A block carrying an opt-out link is skipped. Bulk
marketing mail has to carry one under CAN-SPAM and GDPR, and Mailsuite puts that
link in the signature area when you send a Campaign. Irrelevant for ordinary
one-to-one email. There is a toggle in the popup.

## Status

Detection is verified against the real markup rather than inferred from it.
15 tests, with fixtures transcribed from all six live signature versions.

Not yet verified: nobody has loaded this into Chrome and watched it work against
live Gmail. The compose-body and Send-button selectors are still inference. See
the open issues.

## Development

```bash
npm install
npm test
```

```text
manifest.json      what Chrome reads
src/detect.js      the rules. pure, no chrome.* , runs under jsdom
src/strip.js       Gmail glue. observer, send hooks, settings
src/popup.*        the toolbar toggle
test/              fixtures, including real transcribed markup
```

The split exists so the part that decides what gets deleted out of your email
can be tested without a browser.

## Try their own Remove button first

Mailsuite renders a Remove control inside the signature. Whether it sticks
depends on which signature variant your account was assigned, which is decided
server side. From `kA()`, the click handler, in `gmail.end.bundle.js`:

```text
  variant 17 or 18   ──►  dialog, then on confirm:
                          POST /settings/update/signature
                               { signatureEnabled: false }
                          persists on your account. permanent.

  variant 11 to 16   ──►  strips it from this one email only,
                          and shows the upgrade modal unless your
                          account carries the disableSignature
                          permission
```

So **if you are on variant 17 or 18, click Remove once and you are done.** You
do not need this extension at all. Check
`document.querySelector('[data-signature-version]')` in the Gmail console to see
which you have.

If you are on 11 to 16, their button is per-email and may nag, which is what
this extension is for.

### Why this extension does not just click their button for you

Considered and rejected, see [#3](../../issues/3):

- It only truly persists on two of the eight variants, and the variant is not
  ours to choose.
- On the others it can trigger the upgrade modal on every send.
- The persisting path is a **server call that changes an account setting**.
  A local extension quietly flipping a setting on your Mailsuite account is a
  much bigger action than deleting a node from a draft, and a much ruder
  surprise if you did not expect it.

Deleting the `<div>` locally does the same visible job, works on every variant,
touches nothing on their servers, and stops the moment you switch the extension
off.

## Licence

MIT. This repo contains no Mailsuite code. Their bundle was read to learn which
element to target, the same way you would read any page's markup, and nothing
was copied from it.
