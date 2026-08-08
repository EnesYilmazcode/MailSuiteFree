/*
 * Mailsuite Signature Stripper
 *
 * Removes the promotional signature that Mailsuite (formerly Mailtrack) appends
 * to outgoing Gmail messages.
 *
 * Two things it deliberately does NOT remove:
 *   1. The read-tracking beacon. It is lifted out of the signature block before
 *      the block is deleted, so open tracking keeps working.
 *   2. Any block containing an unsubscribe / opt-out link. Stripping those from
 *      bulk mail is a CAN-SPAM and GDPR problem. Off by default, see settings.
 *
 * Nothing leaves the browser. This only edits the compose window's DOM.
 */
(() => {
  'use strict';

  const PROMO_HOST = /(^|\.)(mailtrack\.io|mailsuite\.com)$/i;

  /* Visible signature wording, lifted from Mailsuite's own popup.bundle.js i18n
     table (senderNotifiedSignatureText / 12 / 13 / 15 / 17 / 18, every locale
     the extension ships). Used to decide whether a block is nothing but the
     signature, never on its own to delete something. */
  const PHRASES = [
    'sender notified by', 'sender notified with mailtrack',
    'email delivery certified by', 'sent with mailtrack', 'sent with',
    'remitente notificado con', 'entrega de email certificada por', 'enviado con mailtrack',
    'remetente notificado com', 'enviado com mailtrack',
    'expéditeur notifié par', "livraison d'e-mail certifiée par", 'envoyé avec mailtrack',
    'absender benachrichtigt von', 'e-mail-zustellung zertifiziert von', 'gesendet mit mailtrack',
    'mittente notificato da', 'consegna email certificata da', 'inviato con mailtrack',
    'nadawca powiadomiony przez', 'dostarczenie e-maila potwierdzone przez', 'wysłano z mailtrack',
    '送信者への通知', 'メール配信証明', 'mailtrackで送信',
    '발신자 알림', '이메일 수신 확인', 'mailtrack로 전송',
    '寄件者已透過', '已透過mailtrack寄出',
    'प्रेषक को सूचित किया गया',
  ];

  const UNSUB = /unsubscribe|opt[-\s]?out|darse de baja|se désabonner|abmelden|annulla iscrizione|cancelar subscri|wypisz|取消訂閱|配信停止|수신 거부|सदस्यता समाप्त/i;

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

  const promoAnchor = (a) => {
    const href = a.getAttribute('href');
    if (!href) return false;
    try {
      return PROMO_HOST.test(new URL(href, location.href).hostname);
    } catch {
      return false;
    }
  };

  const looksLikeBeacon = (img) => {
    const src = img.getAttribute('src') || '';
    if (/mailtrack\.io|mailsuite\.com/i.test(src)) return true;
    const w = parseInt(img.getAttribute('width') || '', 10);
    const h = parseInt(img.getAttribute('height') || '', 10);
    return (w > 0 && w <= 3) || (h > 0 && h <= 3);
  };

  /* True when this element holds the signature and none of the user's own text. */
  const signatureOnly = (el) => {
    let text = el.textContent || '';
    for (const a of el.querySelectorAll('a')) {
      const label = a.textContent;
      if (label && promoAnchor(a)) text = text.split(label).join(' ');
    }
    text = text.toLowerCase();
    for (const phrase of PHRASES) text = text.split(phrase).join(' ');
    return text.replace(/[\s .,;:·|—–()[\]-]/g, '') === '';
  };

  /* Climb from the promo link to the outermost wrapper that is still nothing but
     signature, so the whole block goes and not just the <a>. Stops the moment a
     parent contains something the user wrote. */
  const signatureBlock = (anchor, root) => {
    let block = anchor;
    while (block.parentElement && block.parentElement !== root) {
      if (!signatureOnly(block.parentElement)) break;
      block = block.parentElement;
    }
    return block;
  };

  /* Move the read-tracking beacon out of the block before deleting it. */
  const rescueBeacons = (block, root) => {
    for (const img of [...block.querySelectorAll('img')]) {
      if (looksLikeBeacon(img)) root.appendChild(img);
    }
  };

  /* Drop the blank lines Mailsuite leaves sitting above its signature. */
  const trimBefore = (block) => {
    let prev = block.previousSibling;
    while (prev) {
      const blank =
        (prev.nodeType === Node.TEXT_NODE && !prev.textContent.trim()) ||
        (prev.nodeType === Node.ELEMENT_NODE &&
          (prev.tagName === 'BR' ||
            (/^(DIV|P)$/.test(prev.tagName) &&
              !prev.textContent.trim() &&
              !prev.querySelector('img'))));
      if (!blank) break;
      const doomed = prev;
      prev = prev.previousSibling;
      doomed.remove();
    }
  };

  const scrubRoot = (root) => {
    let removed = 0;
    for (const a of [...root.querySelectorAll('a')]) {
      if (!root.contains(a) || !promoAnchor(a)) continue;
      const block = signatureBlock(a, root);
      if (settings.keepUnsubscribe && UNSUB.test(block.textContent || '')) continue;
      rescueBeacons(block, root);
      trimBefore(block);
      block.remove();
      removed += 1;
    }
    return removed;
  };

  const scrubAll = () => {
    if (!settings.enabled) return 0;
    let removed = 0;
    for (const root of document.querySelectorAll(COMPOSE)) removed += scrubRoot(root);
    if (removed) {
      settings.removed += removed;
      chrome.storage.local.set({ removed: settings.removed });
    }
    return removed;
  };

  /* Mailsuite drops the signature into the compose box while you are still
     writing, so watching for it is the main mechanism. Debounced because Gmail
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
     every other click handler, the document-level bubble listener fires after
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
