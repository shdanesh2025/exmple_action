[
  { action: 'waitForSelector', selector: '#onetrust-accept-btn-handler' },
  { action: 'click', selector: '#onetrust-accept-btn-handler' },
  { action: 'waitForTimeout', ms: 2000 },
  { action: 'screenshot', name: 'after_cookie' },
  { action: 'saveHtml', name: 'after_cookie' },
  { action: 'waitForSelector', selector: '[data-test="flag-english language-card"]' },
  { action: 'click', selector: '[data-test="flag-english language-card"]' },
  { action: 'screenshot', name: 'after_english_select' },
  { action: 'saveHtml', name: 'after_english_select' },
]
