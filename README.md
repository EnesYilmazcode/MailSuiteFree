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

Detection anchors on the promotional link rather than on Mailsuite's markup,
which makes it survive their releases:

1. Find an `<a>` inside the Gmail compose body pointing at `mailtrack.io` or
   `mailsuite.com`.
2. Walk up from that link to the outermost wrapper that still contains *nothing
   but* signature, stopping the instant a parent holds text you wrote. A block
   is "nothing but signature" when removing the promo link text and the known
   signature wording leaves it empty.
3. Rescue any tracking beacon inside, drop the blank lines above, delete.

The signature wording is taken from Mailsuite's own `popup.bundle.js` i18n table
(`senderNotifiedSignatureText` and its `12` / `13` / `15` / `17` / `18`
variants), covering all eleven locales the extension ships.

It runs on a debounced `MutationObserver`, since Mailsuite inserts the signature
while you are still composing, plus a scrub on the Send button in both capture
and bubble phase to cover a signature injected at send time.

## Status

Version 0.1.0, works from inference rather than observation. The selectors were
derived from Mailsuite's popup bundle and from how Gmail structures a compose
body, not from a captured sample of the real injected signature. Tightening that
up is the next step, see below.

## Before you rely on it

Mailsuite already ships a built-in opt-out: *"Don't add the Mailsuite signature
to my emails"*, in its signature settings. If that toggle sticks for you, you do
not need this extension. It is worth thirty seconds to check first.

## Contributing a real sample

To make detection exact rather than inferred, capture the actual markup:

1. Compose an email to yourself with Mailsuite enabled.
2. Before sending, right-click the signature line in the compose box, Inspect.
3. Copy the outer HTML of the element wrapping the whole signature.

Open an issue with that snippet, with your address redacted.

## Licence

MIT
