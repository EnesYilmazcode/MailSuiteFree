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
