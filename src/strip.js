/*
 * Gmail glue. The rules for what counts as a signature live in src/detect.js,
 * which is loaded first by the manifest.
 *
 * Nothing leaves the browser. This only edits the compose window's DOM.
 */
(() => {
  'use strict';

  const detect = globalThis.MailSuiteFreeDetect;
  if (!detect) return;

  /* Gmail's compose body, across layouts and locales. */
  const COMPOSE = [
    'div[g_editable="true"]',
    'div.Am.Al.editable',
    'div[contenteditable="true"][role="textbox"]',
    'div[aria-label="Message Body"]',
  ].join(',');

  const settings = { enabled: true, keepUnsubscribe: true, removed: 0 };

  chrome.storage.local.get(settings).then((stored) => Object.assign(settings, stored));
  chrome.storage.onChanged.addListener((changes) => {
    for (const key of Object.keys(changes)) settings[key] = changes[key].newValue;
  });

  const scrubAll = () => {
    if (!settings.enabled) return 0;
    let removed = 0;
    for (const root of document.querySelectorAll(COMPOSE)) {
      removed += detect.scrubRoot(root, { keepUnsubscribe: settings.keepUnsubscribe });
    }
    if (removed) {
      settings.removed += removed;
      chrome.storage.local.set({ removed: settings.removed });
    }
    return removed;
  };

  /* Mailsuite drops the signature into the compose box while you are still
     writing, so watching for it is the main mechanism. Debounced, because Gmail
     mutates its DOM constantly. */
  let timer = 0;
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(scrubAll, 60);
  };

  new MutationObserver((records) => {
    for (const record of records) {
      if (record.addedNodes.length) return schedule();
    }
  }).observe(document.body, { childList: true, subtree: true });

  /* Belt and braces for a signature injected at send time. Capture fires before
     every other click handler and the document-level bubble listener fires after
     them, so one of the two lands on the right side of Mailsuite's own handler
     whichever order they run in. */
  const SEND_LABEL = /^(send|enviar|envoyer|senden|invia|wyślij|送信|보내기|傳送|发送|भेजें)\b/i;

  const isSend = (target) => {
    const btn = target instanceof Element ? target.closest('[role="button"]') : null;
    if (!btn) return false;
    if (btn.classList.contains('aoO')) return true; // Gmail's send button
    const label = btn.getAttribute('data-tooltip') || btn.getAttribute('aria-label') || '';
    return SEND_LABEL.test(label.trim());
  };

  const onSend = (e) => {
    if (isSend(e.target)) scrubAll();
  };

  document.addEventListener('click', onSend, true);
  document.addEventListener('click', onSend, false);
  document.addEventListener(
    'keydown',
    (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') scrubAll();
    },
    true,
  );

  scrubAll();
})();
