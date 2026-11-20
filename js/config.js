/**
 * ============================================================================
 * AFFIMARTS ACCOUNT — FRONTEND CONFIGURATION
 * ============================================================================
 * 1. Deploy the Google Apps Script project as a web app (see DEPLOYMENT.md).
 * 2. Paste the /exec URL below.
 * 3. Set ACCOUNT_PAGE to the page that hosts this account system.
 *
 * Nothing secret belongs in this file.
 * ============================================================================
 */
(function (window) {
  'use strict';

  window.AFM_CONFIG = {
    /* Required: your Apps Script web-app deployment URL. */
    API_URL: 'https://script.google.com/macros/s/AKfycbwgr8IdRvPt_cWxca5udi9WhVIuTc1DxHlWha8puY1mjLMwsJjvS0cl5kFyXHI2_L-b/exec',

    /* The page that hosts the dashboard (index.html once published). */
    ACCOUNT_PAGE: 'https://www.affimarts.com/p/my-account.html',

    /* Storefront home, used for "continue shopping" links. */
    SITE_URL: 'https://www.affimarts.com',

    /* Automatic sign-in prompt. */
    AUTO_POPUP: true,
    POPUP_DELAY_MS: 3000,

    /* Network */
    REQUEST_TIMEOUT_MS: 30000,

    /* Set true only while debugging. Never logs tokens or passwords. */
    DEBUG: false
  };
})(window);
