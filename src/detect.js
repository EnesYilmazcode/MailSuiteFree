/*
 * Detection rules for the Mailsuite signature.
 *
 * Deliberately free of chrome.* APIs and of globals beyond the nodes handed in,
 * so the same code runs inside Gmail and under jsdom in test/. src/strip.js
 * holds the Gmail glue.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MailSuiteFreeDetect = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const ELEMENT_NODE = 1;
  const TEXT_NODE = 3;

  const PROMO_HOST = /(^|\.)(mailtrack\.io|mailsuite\.com)$/i;

  /* Visible signature wording, lifted from Mailsuite's own popup.bundle.js i18n
     table (senderNotifiedSignatureText and its 12 / 13 / 15 / 17 / 18 variants,
     every locale the extension ships). Only ever used to subtract known text
     while deciding whether a block is nothing but signature. Never on its own
     as grounds to delete something. */
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

  const PUNCTUATION = /[\s .,;:·|—–()[\]-]/g;

  /** A link out to Mailsuite's own site, which is what the signature always is. */
  const promoAnchor = (a) => Boolean(a.getAttribute('href')) && PROMO_HOST.test(a.hostname || '');

  /** The read-tracking pixel, which has to survive whatever else we delete. */
  const looksLikeBeacon = (img) => {
    const src = img.getAttribute('src') || '';
    if (/mailtrack\.io|mailsuite\.com/i.test(src)) return true;
    const w = parseInt(img.getAttribute('width') || '', 10);
    const h = parseInt(img.getAttribute('height') || '', 10);
    return (w > 0 && w <= 3) || (h > 0 && h <= 3);
  };

  /** True when this element holds the signature and none of the user's own text. */
  const signatureOnly = (el) => {
    let text = el.textContent || '';
    for (const a of el.querySelectorAll('a')) {
      const label = a.textContent;
      if (label && promoAnchor(a)) text = text.split(label).join(' ');
    }
    text = text.toLowerCase();
    for (const phrase of PHRASES) text = text.split(phrase).join(' ');
    return text.replace(PUNCTUATION, '') === '';
  };

  /**
   * The block to delete for a given promo link, or null to leave it alone.
   *
   * The link's immediate parent has to be signature-only. That single check is
   * what stops the extension eating a sentence in which somebody genuinely
   * linked to mailsuite.com. From there it climbs as far as it can while every
   * parent is still signature-only, so the whole block goes rather than a bare
   * <a> stranded in leftover text.
   */
  const signatureBlock = (anchor, root) => {
    const parent = anchor.parentElement;
    if (!parent || parent === root || !signatureOnly(parent)) return null;
    let block = parent;
    while (
      block.parentElement &&
      block.parentElement !== root &&
      signatureOnly(block.parentElement)
    ) {
      block = block.parentElement;
    }
    return block;
  };

  /** Move any tracking beacon out of the block before the block is deleted. */
  const rescueBeacons = (block, root) => {
    let rescued = 0;
    for (const img of Array.from(block.querySelectorAll('img'))) {
      if (!looksLikeBeacon(img)) continue;
      root.appendChild(img);
      rescued += 1;
    }
    return rescued;
  };

  /** Drop the blank lines Mailsuite leaves sitting above its signature. */
  const trimBefore = (block) => {
    let prev = block.previousSibling;
    while (prev) {
      const blank =
        (prev.nodeType === TEXT_NODE && !prev.textContent.trim()) ||
        (prev.nodeType === ELEMENT_NODE &&
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

  /**
   * Strip every signature under `root`, returning how many were removed.
   * `keepUnsubscribe` leaves blocks carrying an opt-out link alone, since bulk
   * mail is required to carry one under CAN-SPAM and GDPR.
   */
  const scrubRoot = (root, options) => {
    const keepUnsubscribe = !options || options.keepUnsubscribe !== false;
    let removed = 0;
    for (const a of Array.from(root.querySelectorAll('a'))) {
      if (!root.contains(a) || !promoAnchor(a)) continue;
      const block = signatureBlock(a, root);
      if (!block) continue;
      if (keepUnsubscribe && UNSUB.test(block.textContent || '')) continue;
      rescueBeacons(block, root);
      trimBefore(block);
      block.remove();
      removed += 1;
    }
    return removed;
  };

  return {
    PROMO_HOST,
    PHRASES,
    UNSUB,
    promoAnchor,
    looksLikeBeacon,
    signatureOnly,
    signatureBlock,
    rescueBeacons,
    trimBefore,
    scrubRoot,
  };
});
