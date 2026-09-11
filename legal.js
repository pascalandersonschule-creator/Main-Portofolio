// Fills in the Impressum/Datenschutz identity fields (name, address,
// phone, VAT ID) from content.json's "legal" section, so Pascal can
// edit them via /admin instead of touching this HTML directly.
(function () {
  const setAll = (selector, value) => {
    document.querySelectorAll(selector).forEach((el) => { el.textContent = value; });
  };

  fetch('content.json', { cache: 'no-store' })
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => {
      if (!data) return;
      const legal = data.legal || {};
      const email = (data.footer && data.footer.email) || '';

      if (legal.fullName) setAll('[data-legal="fullName"]', legal.fullName);
      if (legal.street) setAll('[data-legal="street"]', legal.street);
      if (legal.zipCity) setAll('[data-legal="zipCity"]', legal.zipCity);

      const emailLink = document.getElementById('legalEmailLink');
      if (emailLink && email) {
        emailLink.textContent = email;
        emailLink.href = 'mailto:' + email;
      }

      const phoneLine = document.querySelector('[data-legal="phoneLine"]');
      if (phoneLine) {
        if (legal.phone) {
          phoneLine.querySelector('[data-legal="phone"]').textContent = legal.phone;
        } else {
          phoneLine.remove();
        }
      }

      const vatSection = document.querySelector('[data-legal="vatSection"]');
      if (vatSection) {
        if (legal.vatId) {
          vatSection.querySelector('[data-legal="vatId"]').textContent = legal.vatId;
        } else {
          vatSection.remove();
        }
      }

      const dateEl = document.querySelector('[data-legal="lastUpdated"]');
      if (dateEl && legal.lastUpdated) dateEl.textContent = legal.lastUpdated;

      if (legal.fullName && legal.street && legal.zipCity) {
        const flag = document.querySelector('.legal__placeholder-flag');
        if (flag) flag.remove();
      }
    })
    .catch(() => {});

  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();
})();
