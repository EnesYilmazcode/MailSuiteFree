# MailSuiteFree

A small Chrome extension that removes the promotional signature
[Mailsuite](https://mailsuite.com) (formerly Mailtrack) appends to outgoing
Gmail messages, the "Sender notified by Mailsuite" line.

It edits the compose window in your own browser. Nothing is sent anywhere, no
account is touched, no request to Mailsuite is intercepted or modified.

## What it does not remove

**The read-tracking beacon.** That is the part you actually want. Before the
signature block is deleted, any tracking pixel inside it is moved out and kept,
so open tracking carries on working.

**Unsubscribe links.** If the block contains an unsubscribe or opt-out link it
is left alone. Bulk marketing mail is required to carry one under CAN-SPAM and
GDPR, and Mailsuite puts that link in the same signature area when you send a
Campaign. For ordinary one-to-one email this never triggers. There is a toggle
in the popup if you want to turn the protection off.

## Install

1. `chrome://extensions`
2. Turn on **Developer mode** (top right)
3. **Load unpacked**, pick this folder
4. Reload Gmail

The toolbar popup has an on/off switch and a count of how many signatures have
been removed, which is the quickest way to confirm it is working.

## How it finds the signature

Mailsuite labels its own signature, so there is nothing to guess. Every one of
the seven signature templates in `gmail.end.bundle.js` (release 12.87.0) renders
the same wrapper:

```html
<div id="mt-signature" contenteditable="false" g_editable="false">
  <table data-signature-template="senderNotified" data-signature-version="17">
```

So the primary rule is a plain selector:

```css
#mt-signature, [data-signature-template],
[class*="mt-signature"], [class*="mt-old-signature"]
```

Only the outermost match is taken, because `mt-signature-logo` sits inside
`#mt-signature` and matches the same selector.

**Fallback.** If nothing carries a marker, it looks for an `<a>` pointing at
`mailtrack.io` or `mailsuite.com` and climbs to the outermost wrapper that holds
*nothing but* signature, stopping the instant a parent contains text you wrote
or an image you inserted. A block counts as signature-only when removing the
promo link text and the known signature wording leaves it empty. That wording
comes from Mailsuite's own i18n table and covers all eleven shipped locales.

The fallback is deliberately quick to give up. Leaving a signature behind is a
far better failure than deleting a paragraph.

Either way it rescues the tracking beacon
(`https://mailtrack.io/trace/mail/<hash>.png`), drops the blank line above, then
deletes.

It runs on a debounced `MutationObserver`, since Mailsuite inserts the signature
while you are still composing, plus a scrub on the Send button in both capture
and bubble phase to cover a signature injected at send time.

## Status

Version 0.1.0. Detection is verified against the real markup rather than
inferred from it. 15 tests, including fixtures transcribed from all six live
signature versions.

Not yet verified: nobody has loaded this into Chrome and watched it work against
live Gmail. The compose-body and Send-button selectors are still inference.

## Before you rely on it

Mailsuite already ships a built-in opt-out: *"Don't add the Mailsuite signature
to my emails"*, in its signature settings, and it renders a Remove button inside
the signature itself. If either sticks for you, you do not need this extension.
Worth thirty seconds to check first.

## Licence

MIT
