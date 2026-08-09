const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');

const detect = require('../src/detect.js');

/** Build a Gmail-shaped compose body around the given inner HTML. */
const compose = (inner) => {
  const dom = new JSDOM(`<!doctype html><body><div g_editable="true">${inner}</div></body>`, {
    url: 'https://mail.google.com/mail/u/0/',
  });
  return dom.window.document.querySelector('[g_editable="true"]');
};

const SIGNATURE =
  '<div><br></div>' +
  '<div>Sender notified by <a href="https://mailsuite.com/?utm_source=gmail&utm_medium=signature">Mailsuite</a></div>';

test('removes the signature and leaves the message alone', () => {
  const root = compose('<div>Hi Dhruv, following up on the runner fix.</div>' + SIGNATURE);

  assert.equal(detect.scrubRoot(root), 1);
  assert.match(root.textContent, /following up on the runner fix/);
  assert.doesNotMatch(root.textContent, /Sender notified by/);
});

test('clears the blank line Mailsuite leaves above the signature', () => {
  const root = compose('<div>Body</div>' + SIGNATURE);

  detect.scrubRoot(root);

  assert.equal(root.querySelectorAll('br').length, 0);
  assert.equal(root.children.length, 1);
});

test('the read-tracking beacon survives', () => {
  const root = compose(
    '<div>Body</div>' +
      '<div>Sender notified by <a href="https://mailsuite.com/x">Mailsuite</a>' +
      '<img src="https://mailtrack.io/trace/mail/abc123.png" width="1" height="1"></div>',
  );

  assert.equal(detect.scrubRoot(root), 1);
  assert.equal(root.querySelectorAll('img[src*="mailtrack.io"]').length, 1);
  assert.doesNotMatch(root.textContent, /Sender notified/);
});

test('a campaign signature carrying an unsubscribe link is left in place', () => {
  const inner =
    '<div>Campaign body</div>' +
    '<div>Sender notified by <a href="https://mailsuite.com/x">Mailsuite</a> · ' +
    '<a href="https://mailsuite.com/unsub/abc">Unsubscribe</a></div>';

  assert.equal(detect.scrubRoot(compose(inner), { keepUnsubscribe: true }), 0);
  assert.equal(detect.scrubRoot(compose(inner), { keepUnsubscribe: false }), 1);
});

test('a link the user wrote themselves is never touched', () => {
  const root = compose(
    '<div>I have been using <a href="https://mailsuite.com">Mailsuite</a> to track replies ' +
      'and it works well.</div>',
  );

  assert.equal(detect.scrubRoot(root), 0);
  assert.match(root.textContent, /it works well/);
  assert.equal(root.querySelectorAll('a').length, 1);
});

test('a message with no signature is left exactly as it was', () => {
  const root = compose('<div>Just a normal email.</div>');
  const before = root.innerHTML;

  assert.equal(detect.scrubRoot(root), 0);
  assert.equal(root.innerHTML, before);
});

test('localised signatures are recognised', () => {
  for (const phrase of ['Remitente notificado con', 'Absender benachrichtigt von', '送信者への通知']) {
    const root = compose(
      `<div>Body</div><div>${phrase} <a href="https://mailtrack.io/">Mailtrack</a></div>`,
    );
    assert.equal(detect.scrubRoot(root), 1, `failed for: ${phrase}`);
  }
});

test("an inline image beside the signature is not collateral", () => {
  const root = compose(
    '<div>See attached</div>' +
      '<div><img src="cid:screenshot.png" width="800" height="600">' +
      'Sender notified by <a href="https://mailsuite.com/x">Mailsuite</a></div>',
  );

  assert.equal(detect.scrubRoot(root), 0, 'a block holding a real image is not just a signature');
  assert.equal(root.querySelectorAll('img[src="cid:screenshot.png"]').length, 1);
});

test('climbs through nested wrappers to take the whole block', () => {
  const root = compose(
    '<div>Body</div>' +
      '<div class="outer"><div class="inner">' +
      'Sender notified by <a href="https://mailsuite.com/x">Mailsuite</a>' +
      '</div></div>',
  );

  assert.equal(detect.scrubRoot(root), 1);
  assert.equal(root.querySelectorAll('.outer').length, 0, 'the outer wrapper should go too');
  assert.match(root.textContent, /Body/);
});

test('the beacon stays where the signature was, not at the end of the body', () => {
  const root = compose(
    '<div>Body</div>' +
      '<div><br></div>' +
      '<div>Sender notified by <a href="https://mailsuite.com/x">Mailsuite</a>' +
      '<img src="https://mailtrack.io/trace/mail/abc.png" width="1" height="1"></div>' +
      '<div>Trailing quoted thread</div>',
  );

  assert.equal(detect.scrubRoot(root), 1);

  const kids = Array.from(root.children);
  const beacon = kids.findIndex((el) => el.tagName === 'IMG');
  const trailing = kids.findIndex((el) => /Trailing/.test(el.textContent));

  assert.notEqual(beacon, -1, 'beacon survived');
  assert.ok(beacon < trailing, 'beacon did not jump past the trailing content');
  assert.equal(root.querySelectorAll('br').length, 0, 'blank line still trimmed');
});

/*
 * Real markup, transcribed from gmail.end.bundle.js in Mailsuite 12.87.0. All
 * seven signature templates share the #mt-signature wrapper and the
 * data-signature-template attribute; the inner layout differs per version.
 */
const realSignature = (version) => `
<div id="mt-signature" contenteditable="false" g_editable="false">
  <table border="0" cellpadding="8" cellspacing="0" contenteditable="false" g_editable="false"
         data-signature-template="senderNotified" data-signature-version="${version}"
         style="user-select: none;">
    <tr style="display:flex;">
      <td style="padding:0 4px 0 0">
        <img src="https://s3.amazonaws.com/mailtrack-signature/logo-grey.png" alt="Mailsuite"
             class="mt-no-pointer-events" width="24" height="20" g_editable="false">
      </td>
      <td style="padding:0 10px 0 0">
        <span style="color:#333;font-size:12px">Sent with Mailtrack &nbsp;·&nbsp;
          <a href="https://mailsuite.com/en/pricing" target="_blank">Mailsuite</a></span>
      </td>
      <td class="mt-remove-signature-button-container" style="padding:4px 0 0 0"></td>
    </tr>
  </table>
</div>`;

test('removes the real signature whole, logo and all', () => {
  for (const version of [12, 13, 15, 16, 17, 18]) {
    const root = compose('<div>Hi, notes below.</div>' + realSignature(version));

    assert.equal(detect.scrubRoot(root), 1, `version ${version}`);
    assert.equal(root.querySelector('#mt-signature'), null, `version ${version}: wrapper left behind`);
    assert.equal(root.querySelectorAll('table').length, 0, `version ${version}: table left behind`);
    assert.equal(root.querySelectorAll('img').length, 0, `version ${version}: logo left behind`);
    assert.match(root.textContent, /Hi, notes below/);
  }
});

test("their logo goes, the user's own image next to it stays", () => {
  const root = compose(
    '<div>Screenshot attached</div>' +
      '<div><img src="cid:screenshot.png" width="800" height="600"></div>' +
      realSignature(17),
  );

  assert.equal(detect.scrubRoot(root), 1);
  assert.equal(root.querySelectorAll('img[src="cid:screenshot.png"]').length, 1);
  assert.equal(root.querySelectorAll('img[src*="mailtrack-signature"]').length, 0);
});

test('a beacon inside the real signature survives it', () => {
  const withBeacon = realSignature(17).replace(
    '</table>',
    '</table><img src="https://mailtrack.io/trace/mail/' + 'a'.repeat(40) + '.png" width="1" height="1">',
  );
  const root = compose('<div>Body</div>' + withBeacon);

  assert.equal(detect.scrubRoot(root), 1);
  assert.equal(root.querySelector('#mt-signature'), null);
  assert.equal(root.querySelectorAll('img[src*="/trace/mail/"]').length, 1);
});

test('catches the signature after Gmail has prefixed the id', () => {
  /* Gmail rewrites ids when it renders or quotes a message, which is why
     Mailsuite ships its own un-prefixing helper. */
  const root = compose(
    '<div>Body</div>' + realSignature(18).replace('id="mt-signature"', 'id="m_-8891234567890mt-signature"'),
  );

  assert.equal(detect.scrubRoot(root), 1);
  assert.equal(root.querySelector('[id*="mt-signature"]'), null);
});

test('markedBlocks returns only the outermost match', () => {
  const root = compose(realSignature(17).replace('alt="Mailsuite"', 'alt="Mailsuite" class="mt-signature-logo"'));
  const blocks = detect.markedBlocks(root);

  assert.equal(blocks.length, 1, 'the nested logo must not count as its own block');
  assert.equal(blocks[0].id, 'mt-signature');
});

test('promoAnchor only matches Mailsuite hosts', () => {
  const root = compose(
    '<a id="a" href="https://mailsuite.com/x">a</a>' +
      '<a id="b" href="https://mailtrack.io/x">b</a>' +
      '<a id="c" href="https://notmailsuite.com/x">c</a>' +
      '<a id="d" href="https://example.com/?ref=mailsuite.com">d</a>',
  );
  const at = (id) => detect.promoAnchor(root.querySelector(`#${id}`));

  assert.equal(at('a'), true);
  assert.equal(at('b'), true);
  assert.equal(at('c'), false, 'suffix match must not count as the host');
  assert.equal(at('d'), false, 'the host is what matters, not the query string');
});
