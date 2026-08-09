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

  /*
   * Scan the whole page, not a list of guessed compose selectors.
   *
   * The first version scoped every scan to div[g_editable="true"] and friends.
   * That put a guess about Gmail's internal class names on the critical path:
   * if the compose root did not match, nothing was ever examined and the
   * extension silently did nothing.
   *
   * It does not need to be that fragile. #mt-signature and
   * data-signature-template are Mailsuite's own labels and appear on nothing
   * else, so if one is in the page it is theirs and it can go. Scanning from
   * document.body removes an entire class of failure.
   *
   * Side effect worth knowing: this also hides the signature on Mailtrack mail
   * you receive. Purely visual, in your browser, and it changes nothing about
   * what anybody sent.
   */
  const settings = { enabled: true, keepUnsubscribe: true, removed: 0 };

  chrome.storage.local.get(settings).then((stored) => Object.assign(settings, stored));
  chrome.storage.onChanged.addListener((changes) => {
    for (const key of Object.keys(changes)) settings[key] = changes[key].newValue;
  });

  const scrubAll = () => {
    if (!settings.enabled || !document.body) return 0;
    const removed = detect.scrubRoot(document.body, {
      keepUnsubscribe: settings.keepUnsubscribe,
    });
    if (removed) {
      settings.removed += removed;
      chrome.storage.local.set({ removed: settings.removed });
      console.log(`[MailSuiteFree] removed ${removed} signature block(s)`);
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

  /* Says the content script is alive. If this line is missing from the Gmail
     console, the extension is not loaded, which is a different problem from the
     extension not working. */
  console.log('[MailSuiteFree] active on', location.host);
  scrubAll();
})();
