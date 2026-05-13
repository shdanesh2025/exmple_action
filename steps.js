module.exports = [
  // --- Accept cookies ---
  {
    action: 'waitForSelector',
    selector: '#onetrust-accept-btn-handler',
    options: { visible: true, timeout: 10000 }
  },
  {
    action: 'click',
    selector: '#onetrust-accept-btn-handler'
  },
  {
    action: 'waitForTimeout',
    ms: 2000
  },

  // --- Screenshot & HTML after cookie acceptance ---
  {
    action: 'screenshot',
    name: 'after_cookie'
  },
  {
    action: 'saveHtml',
    name: 'after_cookie'
  },

  // --- Select English language card ---
  {
    action: 'waitForSelector',
    selector: '[data-test="flag-english language-card"]',
    options: { visible: true, timeout: 10000 }
  },
  {
    action: 'click',
    selector: '[data-test="flag-english language-card"]'
  },
  {
    action: 'waitForTimeout',
    ms: 3000
  },

  // --- Screenshot & HTML after language selection ---
  {
    action: 'screenshot',
    name: 'after_english_select'
  },
  {
    action: 'saveHtml',
    name: 'after_english_select'
  }
];
