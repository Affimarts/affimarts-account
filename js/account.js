/**
 * ============================================================================
 * AFFIMARTS ACCOUNT — UI SHELL
 * ============================================================================
 * • MY ACCOUNT button (replaces the old TRENDING button, same position)
 * • Automatic 3-second sign-in popup, anchored under the button on desktop
 *   and centred as a modal on mobile
 * • Account dropdown, auth views, dashboard tabs, toasts
 * • Boot sequence and session-expiry handling
 * ============================================================================
 */
(function (window, document) {
  'use strict';

  var AFM = window.AFM = window.AFM || {};

  var POPUP_KEY = 'afm.popup.dismissed';
  var AUTO_POPUP_OFF_KEY = 'afm.autopopup.off';
  var MODAL_QUERY = '(max-width: 1020px)';

  var panel = null;
  var scrim = null;
  var closeTimer = null;
  var autoOpened = false;
  var lastFocus = null;
  var pendingTab = '';
  var booted = false;

  function $(selector, root) {
    return (root || document).querySelector(selector);
  }

  function $$(selector, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(selector));
  }

  function getButton() {
    return $('[data-afm-account-btn]');
  }

  function firstName(user) {
    var name = String((user && user.fullName) || '').replace(/^\s+|\s+$/g, '');
    return name ? name.split(' ')[0] : '';
  }

  function isMobile() {
    try {
      return window.matchMedia(MODAL_QUERY).matches;
    } catch (err) {
      return window.innerWidth <= 1020;
    }
  }

  function safeGet(store, key) {
    try {
      return window[store].getItem(key);
    } catch (err) {
      return null;
    }
  }

  function safeSet(store, key, value) {
    try {
      window[store].setItem(key, value);
    } catch (err) {
      /* storage disabled */
    }
  }

  function safeRemove(store, key) {
    try {
      window[store].removeItem(key);
    } catch (err) {
      /* storage disabled */
    }
  }

  /* ====================================================================== */
  /*  Icons                                                                 */
  /* ====================================================================== */

  var ICON = {
    user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="12" cy="8" r="4"></circle><path d="M4 20c0-3.3 3.6-6 8-6s8 2.7 8 6"></path></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"></path></svg>',
    eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12z"></path><circle cx="12" cy="12" r="2.6"></circle></svg>',
    eyeOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M3 3l18 18"></path><path d="M10.6 6.2A10 10 0 0 1 12 6c6.4 0 10 6 10 6a17 17 0 0 1-3.3 4"></path><path d="M6.5 6.6A16.6 16.6 0 0 0 2 12s3.6 6 10 6a9.6 9.6 0 0 0 4.2-.9"></path></svg>',
    arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6"></path></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M4 12.5l5 5L20 6.5"></path></svg>',
    alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M12 3l9.5 17H2.5L12 3z"></path><path d="M12 9v5M12 17.2v.1"></path></svg>',
    mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="1.5"></rect><path d="M3.5 6.5L12 13l8.5-6.5"></path></svg>',
    heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M12 20s-7.5-4.7-7.5-9.6A4.4 4.4 0 0 1 12 7.4a4.4 4.4 0 0 1 7.5 3C19.5 15.3 12 20 12 20z"></path></svg>',
    lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="4.5" y="10" width="15" height="10.5" rx="1.5"></rect><path d="M8 10V7.5a4 4 0 0 1 8 0V10"></path></svg>',
    settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="12" cy="12" r="3.2"></circle><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"></path></svg>'
  };

  /* ====================================================================== */
  /*  Markup                                                                */
  /* ====================================================================== */

  function buttonMarkup() {
    return '' +
      '<button class="afm-account__btn" type="button" data-afm-account-btn ' +
      'aria-haspopup="dialog" aria-expanded="false" aria-controls="afm-panel" ' +
      'aria-label="Sign in or create an account">' +
      '<span class="afm-account__icon" data-afm-account-icon aria-hidden="true">' + ICON.user + '</span>' +
      '<span class="afm-account__avatar" data-afm-account-avatar aria-hidden="true" hidden>AF</span>' +
      '<span class="afm-account__label" data-afm-account-label>My Account</span>' +
      '</button>';
  }

  function passwordToggle(target) {
    return '<button class="afm-eye" type="button" data-afm-toggle="' + target + '" ' +
      'aria-label="Show password" aria-pressed="false">' +
      '<span class="afm-eye__on">' + ICON.eye + '</span>' +
      '<span class="afm-eye__off">' + ICON.eyeOff + '</span>' +
      '</button>';
  }

  function panelMarkup() {
    return '' +
      '<section class="afm-panel" id="afm-panel" role="dialog" aria-modal="false" ' +
      'aria-label="Affimarts account" tabindex="-1" hidden>' +
      '<div class="afm-panel__head">' +
      '<span class="afm-panel__eyebrow">Affimarts Account</span>' +
      '<button class="afm-panel__close" type="button" data-afm-close aria-label="Close account panel">' +
      ICON.close + '</button>' +
      '</div>' +

      '<div class="afm-panel__body">' +

      /* ---------------- Login ---------------- */
      '<section class="afm-view" data-afm-view="login" hidden>' +
      '<h2 class="afm-title">Welcome to Affimarts!</h2>' +
      '<p class="afm-sub">Sign in to discover your personalized fashion experience.</p>' +
      '<form class="afm-form" id="afm-login-form" novalidate>' +
      '<div class="afm-field">' +
      '<label for="afm-login-email">Email Address</label>' +
      '<input id="afm-login-email" name="email" type="email" inputmode="email" autocomplete="email" ' +
      'placeholder="you@example.com" required>' +
      '<p class="afm-field__error" data-afm-field-error="afm-login-email" hidden></p>' +
      '</div>' +
      '<div class="afm-field">' +
      '<label for="afm-login-password">Password</label>' +
      '<div class="afm-inputgroup">' +
      '<input id="afm-login-password" name="password" type="password" autocomplete="current-password" ' +
      'placeholder="Your password" required>' +
      passwordToggle('afm-login-password') +
      '</div>' +
      '<p class="afm-field__error" data-afm-field-error="afm-login-password" hidden></p>' +
      '</div>' +
      '<div class="afm-row afm-row--between">' +
      '<label class="afm-check"><input type="checkbox" id="afm-login-remember" name="remember">' +
      '<span>Remember me</span></label>' +
      '<button class="afm-linkbtn" type="button" data-afm-view-link="forgot">Forgot password?</button>' +
      '</div>' +
      '<div class="afm-alert" id="afm-login-error" role="alert" hidden></div>' +
      '<button class="afm-btn" type="submit" id="afm-login-submit"><span>Sign in</span></button>' +
      '</form>' +
      '<p class="afm-switch">New to Affimarts? ' +
      '<button class="afm-linkbtn" type="button" data-afm-view-link="register">Create account</button></p>' +
      '<p class="afm-secure"><span class="afm-secure__icon">' + ICON.lock + '</span>' +
      'Your password is encrypted. We never store it in plain text.</p>' +
      '</section>' +

      /* ---------------- Register ---------------- */
      '<section class="afm-view" data-afm-view="register" hidden>' +
      '<button class="afm-back" type="button" data-afm-view-link="login">' +
      '<span aria-hidden="true">←</span> Back to sign in</button>' +
      '<h2 class="afm-title">Create your account</h2>' +
      '<p class="afm-sub">Save the edits you love and keep your style inspiration in one place.</p>' +
      '<form class="afm-form" id="afm-register-form" novalidate>' +
      '<div class="afm-field">' +
      '<label for="afm-reg-name">Full Name <em>*</em></label>' +
      '<input id="afm-reg-name" name="fullName" type="text" autocomplete="name" placeholder="Your full name" required>' +
      '<p class="afm-field__error" data-afm-field-error="afm-reg-name" hidden></p>' +
      '</div>' +
      '<div class="afm-field">' +
      '<label for="afm-reg-email">Email Address <em>*</em></label>' +
      '<input id="afm-reg-email" name="email" type="email" inputmode="email" autocomplete="email" ' +
      'placeholder="you@example.com" required>' +
      '<p class="afm-field__error" data-afm-field-error="afm-reg-email" hidden></p>' +
      '</div>' +
      '<div class="afm-field">' +
      '<label for="afm-reg-password">Password <em>*</em></label>' +
      '<div class="afm-inputgroup">' +
      '<input id="afm-reg-password" name="password" type="password" autocomplete="new-password" ' +
      'placeholder="At least 8 characters" required>' +
      passwordToggle('afm-reg-password') +
      '</div>' +
      '<div class="afm-strength" data-afm-strength-for="afm-reg-password" role="meter" ' +
      'aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">' +
      '<div class="afm-strength__track"><span class="afm-strength__fill"></span></div>' +
      '<span class="afm-strength__label">Use 8+ characters with a number</span>' +
      '</div>' +
      '<p class="afm-field__error" data-afm-field-error="afm-reg-password" hidden></p>' +
      '</div>' +
      '<div class="afm-field">' +
      '<label for="afm-reg-confirm">Confirm Password <em>*</em></label>' +
      '<div class="afm-inputgroup">' +
      '<input id="afm-reg-confirm" name="confirmPassword" type="password" autocomplete="new-password" ' +
      'placeholder="Repeat your password" required>' +
      passwordToggle('afm-reg-confirm') +
      '</div>' +
      '<p class="afm-field__error" data-afm-field-error="afm-reg-confirm" hidden></p>' +
      '</div>' +
      '<div class="afm-grid2">' +
      '<div class="afm-field">' +
      '<label for="afm-reg-mobile">Mobile Number <span>optional</span></label>' +
      '<input id="afm-reg-mobile" name="mobile" type="tel" inputmode="tel" autocomplete="tel" placeholder="+91 98765 43210">' +
      '<p class="afm-field__error" data-afm-field-error="afm-reg-mobile" hidden></p>' +
      '</div>' +
      '<div class="afm-field">' +
      '<label for="afm-reg-gender">Gender <span>optional</span></label>' +
      '<select id="afm-reg-gender" name="gender">' +
      '<option value="">Prefer not to say</option>' +
      '<option value="Female">Female</option>' +
      '<option value="Male">Male</option>' +
      '<option value="Other">Other</option>' +
      '</select>' +
      '</div>' +
      '</div>' +
      '<div class="afm-field">' +
      '<label for="afm-reg-dob">Date of Birth <span>optional</span></label>' +
      '<input id="afm-reg-dob" name="dob" type="date" autocomplete="bday">' +
      '<p class="afm-field__error" data-afm-field-error="afm-reg-dob" hidden></p>' +
      '</div>' +
      '<div class="afm-alert" id="afm-register-error" role="alert" hidden></div>' +
      '<button class="afm-btn" type="submit" id="afm-register-submit"><span>Create account</span></button>' +
      '<p class="afm-legal">By creating an account you agree to receive account emails from Affimarts. ' +
      'You can unsubscribe from style edits at any time.</p>' +
      '</form>' +
      '<p class="afm-switch">Already have an account? ' +
      '<button class="afm-linkbtn" type="button" data-afm-view-link="login" id="afm-register-login-link">Sign in</button></p>' +
      '</section>' +

      /* ---------------- Forgot password ---------------- */
      '<section class="afm-view" data-afm-view="forgot" hidden>' +
      '<button class="afm-back" type="button" data-afm-view-link="login">' +
      '<span aria-hidden="true">←</span> Back to sign in</button>' +
      '<h2 class="afm-title">Forgot your password?</h2>' +
      '<p class="afm-sub">Enter the email linked to your account and we will send a secure reset link. ' +
      'It expires in 30 minutes and can only be used once.</p>' +
      '<form class="afm-form" id="afm-forgot-form" novalidate>' +
      '<div class="afm-field">' +
      '<label for="afm-forgot-email">Email Address</label>' +
      '<input id="afm-forgot-email" name="email" type="email" inputmode="email" autocomplete="email" ' +
      'placeholder="you@example.com" required>' +
      '<p class="afm-field__error" data-afm-field-error="afm-forgot-email" hidden></p>' +
      '</div>' +
      '<div class="afm-alert" id="afm-forgot-error" role="alert" hidden></div>' +
      '<button class="afm-btn" type="submit" id="afm-forgot-submit"><span>Send reset link</span></button>' +
      '</form>' +
      '<p class="afm-secure"><span class="afm-secure__icon">' + ICON.lock + '</span>' +
      'For privacy we never reveal whether an email is registered.</p>' +
      '</section>' +

      /* ---------------- Reset password ---------------- */
      '<section class="afm-view" data-afm-view="reset" hidden>' +
      '<h2 class="afm-title">Choose a new password</h2>' +
      '<p class="afm-sub">Your reset link is single-use and expires 30 minutes after it was sent.</p>' +
      '<form class="afm-form" id="afm-reset-form" novalidate>' +
      '<div class="afm-field">' +
      '<label for="afm-reset-password">New Password</label>' +
      '<div class="afm-inputgroup">' +
      '<input id="afm-reset-password" name="password" type="password" autocomplete="new-password" ' +
      'placeholder="At least 8 characters" required>' +
      passwordToggle('afm-reset-password') +
      '</div>' +
      '<div class="afm-strength" data-afm-strength-for="afm-reset-password" role="meter" ' +
      'aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">' +
      '<div class="afm-strength__track"><span class="afm-strength__fill"></span></div>' +
      '<span class="afm-strength__label">Use 8+ characters with a number</span>' +
      '</div>' +
      '<p class="afm-field__error" data-afm-field-error="afm-reset-password" hidden></p>' +
      '</div>' +
      '<div class="afm-field">' +
      '<label for="afm-reset-confirm">Confirm New Password</label>' +
      '<div class="afm-inputgroup">' +
      '<input id="afm-reset-confirm" name="confirmPassword" type="password" autocomplete="new-password" ' +
      'placeholder="Repeat your new password" required>' +
      passwordToggle('afm-reset-confirm') +
      '</div>' +
      '<p class="afm-field__error" data-afm-field-error="afm-reset-confirm" hidden></p>' +
      '</div>' +
      '<div class="afm-alert" id="afm-reset-error" role="alert" hidden></div>' +
      '<button class="afm-btn" type="submit" id="afm-reset-submit"><span>Update password</span></button>' +
      '</form>' +
      '</section>' +

      /* ---------------- Verify email ---------------- */
      '<section class="afm-view" data-afm-view="verify" hidden>' +
      '<div class="afm-notice__icon afm-notice__icon--mail">' + ICON.mail + '</div>' +
      '<h2 class="afm-title">Confirm your email</h2>' +
      '<p class="afm-sub">One quick tap activates your Affimarts account, unlocks saved favourites ' +
      'and keeps your profile secure.</p>' +
      '<div class="afm-alert" id="afm-verify-error" role="alert" hidden></div>' +
      '<button class="afm-btn" type="button" id="afm-verify-submit"><span>Confirm my email</span></button>' +
      '<button class="afm-back afm-back--center" type="button" data-afm-view-link="login">Back to sign in</button>' +
      '</section>' +

      /* ---------------- Resend verification ---------------- */
      '<section class="afm-view" data-afm-view="resend" hidden>' +
      '<button class="afm-back" type="button" data-afm-view-link="login">' +
      '<span aria-hidden="true">←</span> Back to sign in</button>' +
      '<h2 class="afm-title">Resend confirmation</h2>' +
      '<p class="afm-sub">Enter your email and we will send a fresh confirmation link if the address ' +
      'still needs verifying.</p>' +
      '<form class="afm-form" id="afm-resend-form" novalidate>' +
      '<div class="afm-field">' +
      '<label for="afm-resend-email">Email Address</label>' +
      '<input id="afm-resend-email" name="email" type="email" inputmode="email" autocomplete="email" ' +
      'placeholder="you@example.com" required>' +
      '<p class="afm-field__error" data-afm-field-error="afm-resend-email" hidden></p>' +
      '</div>' +
      '<div class="afm-alert" id="afm-resend-error" role="alert" hidden></div>' +
      '<button class="afm-btn" type="submit" id="afm-resend-submit"><span>Send confirmation email</span></button>' +
      '</form>' +
      '</section>' +

      /* ---------------- Notice ---------------- */
      '<section class="afm-view" data-afm-view="notice" hidden>' +
      '<div class="afm-notice__icon" data-afm-notice-icon>' + ICON.check + '</div>' +
      '<h2 class="afm-title" data-afm-notice-title>Done</h2>' +
      '<p class="afm-sub" data-afm-notice-text></p>' +
      '<div class="afm-notice__actions">' +
      '<button class="afm-btn" type="button" data-afm-notice-primary>Continue</button>' +
      '<button class="afm-linkbtn afm-linkbtn--center" type="button" data-afm-notice-secondary hidden></button>' +
      '</div>' +
      '</section>' +

      /* ---------------- Signed-in menu ---------------- */
      '<section class="afm-view" data-afm-view="menu" hidden>' +
      '<div class="afm-usercard">' +
      '<span class="afm-avatar" data-afm-menu-avatar>AF</span>' +
      '<div class="afm-usercard__text">' +
      '<strong data-afm-menu-name>Your account</strong>' +
      '<span data-afm-menu-email>you@example.com</span>' +
      '</div>' +
      '</div>' +
      '<nav class="afm-menu" aria-label="Account menu">' +
      '<button type="button" class="afm-menu__item" data-afm-go="profile">' +
      '<span class="afm-menu__icon">' + ICON.user + '</span>' +
      '<span class="afm-menu__label">My Profile</span>' +
      '<span class="afm-menu__arrow">' + ICON.arrow + '</span></button>' +
      '<button type="button" class="afm-menu__item" data-afm-go="edit">' +
      '<span class="afm-menu__icon">' + ICON.settings + '</span>' +
      '<span class="afm-menu__label">Edit Profile</span>' +
      '<span class="afm-menu__arrow">' + ICON.arrow + '</span></button>' +
      '<button type="button" class="afm-menu__item" data-afm-go="favorites">' +
      '<span class="afm-menu__icon">' + ICON.heart + '</span>' +
      '<span class="afm-menu__label">My Favorites</span>' +
      '<span class="afm-menu__count" data-afm-menu-favcount>0</span>' +
      '<span class="afm-menu__arrow">' + ICON.arrow + '</span></button>' +
      '<button type="button" class="afm-menu__item" data-afm-go="settings">' +
      '<span class="afm-menu__icon">' + ICON.lock + '</span>' +
      '<span class="afm-menu__label">Account Settings</span>' +
      '<span class="afm-menu__arrow">' + ICON.arrow + '</span></button>' +
      '<button type="button" class="afm-menu__item afm-menu__item--logout" data-afm-go="logout">' +
      '<span class="afm-menu__icon">' + ICON.close + '</span>' +
      '<span class="afm-menu__label">Logout</span></button>' +
      '</nav>' +
      '<p class="afm-menu__foot">Signed in securely · Session validated on every visit</p>' +
      '</section>' +

      '</div>' +

      '<div class="afm-panel__foot">' +
      '<span class="afm-panel__secure">' + ICON.lock + ' Secure sign-in</span>' +
      '<a href="#" data-afm-account-link>Account page</a>' +
      '</div>' +
      '</section>';
  }

  /* ====================================================================== */
  /*  Panel                                                                 */
  /* ====================================================================== */

  function buildPanel() {
    if (document.getElementById('afm-panel')) {
      panel = document.getElementById('afm-panel');
      scrim = document.querySelector('[data-afm-scrim]');
      return;
    }

    scrim = document.createElement('div');
    scrim.className = 'afm-scrim';
    scrim.setAttribute('data-afm-scrim', '');
    scrim.hidden = true;
    document.body.appendChild(scrim);

    var wrapper = document.createElement('div');
    wrapper.innerHTML = panelMarkup();
    panel = wrapper.firstChild;
    document.body.appendChild(panel);

    var accountLink = panel.querySelector('[data-afm-account-link]');
    var accountPage = (window.AFM_CONFIG || {}).ACCOUNT_PAGE;
    if (accountLink && accountPage) accountLink.setAttribute('href', accountPage);
  }

  function setAccountLink() {
    var link = document.querySelector('[data-afm-account-link]');
    if (!link) return;
    var page = (window.AFM_CONFIG || {}).ACCOUNT_PAGE || '';
    if (!page) {
      link.hidden = true;
      return;
    }
    link.href = page;
  }

  function isPanelOpen() {
    return !!panel && panel.classList.contains('is-open');
  }

  function clearErrors() {
    $$('.afm-alert', panel).forEach(function (box) {
      box.hidden = true;
      box.textContent = '';
    });
    $$('.afm-field__error', panel).forEach(function (slot) {
      slot.hidden = true;
      slot.textContent = '';
    });
    $$('.is-invalid', panel).forEach(function (input) {
      input.classList.remove('is-invalid');
      input.removeAttribute('aria-invalid');
    });
  }

  function showView(name) {
    if (!panel) return;
    if (name === 'menu' && !AFM.auth.user) name = 'login';
    if (name === 'reset' && !AFM.auth._state.resetToken) name = 'forgot';

    var view = panel.querySelector('[data-afm-view="' + name + '"]');
    if (!view) name = 'login';
    view = panel.querySelector('[data-afm-view="' + name + '"]');

    $$('[data-afm-view]', panel).forEach(function (section) {
      section.hidden = section !== view;
    });
    panel.setAttribute('data-view', name);
    clearErrors();

    if (name === 'menu') paintMenu();
    if (name === 'resend') {
      var resendEmail = document.getElementById('afm-resend-email');
      var pending = AFM.auth._pendingEmail();
      if (resendEmail && pending && !resendEmail.value) resendEmail.value = pending;
    }

    var target = view.querySelector('input:not([type="hidden"]):not([type="checkbox"]), select, button.afm-btn');
    if (target) {
      window.setTimeout(function () {
        try { target.focus({ preventScroll: true }); } catch (err) { target.focus(); }
      }, 100);
    }
  }

  function positionPanel() {
    if (!panel || panel.hidden) return;

    if (isMobile()) {
      panel.classList.add('afm-panel--modal');
      panel.setAttribute('aria-modal', 'true');
      panel.style.removeProperty('--afm-top');
      panel.style.removeProperty('--afm-right');
      if (scrim) {
        scrim.hidden = false;
        scrim.classList.add('is-open');
      }
      document.body.classList.add('afm-lock');
      return;
    }

    panel.classList.remove('afm-panel--modal');
    panel.setAttribute('aria-modal', 'false');
    document.body.classList.remove('afm-lock');
    if (scrim) {
      scrim.classList.remove('is-open');
      scrim.hidden = true;
    }

    var button = getButton();
    if (!button) return;

    var rect = button.getBoundingClientRect();
    var right = Math.max(12, window.innerWidth - rect.right);
    var top = Math.max(12, rect.bottom + 10);
    panel.style.setProperty('--afm-top', top + 'px');
    panel.style.setProperty('--afm-right', right + 'px');
  }

  function openPanel(options) {
    if (!panel) return;
    options = options || {};

    var view = options.view || (AFM.auth.user ? 'menu' : 'login');
    autoOpened = options.auto === true;
    lastFocus = document.activeElement;

    /* A manual visit means the visitor has already engaged with the account
       UI; do not interrupt them with the automatic prompt later in this tab. */
    if (!autoOpened) markDismissed();

    if (closeTimer) {
      window.clearTimeout(closeTimer);
      closeTimer = null;
    }

    panel.hidden = false;
    if (scrim) scrim.hidden = false;

    showView(view);

    /* Force layout so the transition starts from the closed state. */
    void panel.offsetWidth;

    positionPanel();
    panel.classList.add('is-open');
    if (scrim && isMobile()) scrim.classList.add('is-open');

    var button = getButton();
    if (button) button.setAttribute('aria-expanded', 'true');

    document.documentElement.classList.add('afm-panel-open');

    window.setTimeout(function () {
      var active = panel.querySelector('[data-afm-view]:not([hidden])');
      var focusTarget = active && active.querySelector('input:not([type="hidden"]):not([type="checkbox"]), select, button.afm-btn');
      if (!focusTarget) focusTarget = panel.querySelector('[data-afm-close]');
      if (focusTarget) {
        try { focusTarget.focus({ preventScroll: true }); } catch (err) { focusTarget.focus(); }
      } else {
        panel.focus();
      }
    }, 120);
  }

  function markDismissed() {
    safeSet('sessionStorage', POPUP_KEY, '1');
  }

  function closePanel(options) {
    if (!panel || !isPanelOpen()) return;
    options = options || {};

    if (autoOpened) {
      markDismissed();
      autoOpened = false;
    }

    panel.classList.remove('is-open');
    if (scrim) scrim.classList.remove('is-open');
    document.documentElement.classList.remove('afm-panel-open');
    document.body.classList.remove('afm-lock');

    var button = getButton();
    if (button) button.setAttribute('aria-expanded', 'false');

    if (closeTimer) window.clearTimeout(closeTimer);
    closeTimer = window.setTimeout(function () {
      panel.hidden = true;
      if (scrim) scrim.hidden = true;
      closeTimer = null;
    }, 260);

    if (options.restoreFocus !== false && lastFocus && lastFocus.focus) {
      try { lastFocus.focus({ preventScroll: true }); } catch (err) { lastFocus.focus(); }
    }
  }

  function togglePanel() {
    if (isPanelOpen()) {
      closePanel();
    } else {
      openPanel({ view: AFM.auth.user ? 'menu' : 'login' });
    }
  }

  /* ====================================================================== */
  /*  Header / menu painting                                                */
  /* ====================================================================== */

  function paintHeader() {
    var button = getButton();
    if (!button) return;

    var user = AFM.auth.user;
    var label = button.querySelector('[data-afm-account-label]');
    var avatar = button.querySelector('[data-afm-account-avatar]');
    var icon = button.querySelector('[data-afm-account-icon]');

    button.classList.toggle('is-authed', !!user);

    if (user) {
      if (label) label.textContent = firstName(user) || 'My Account';
      if (avatar) {
        avatar.textContent = user.initials || 'AF';
        avatar.hidden = false;
      }
      if (icon) icon.hidden = true;
      button.setAttribute('aria-label', 'Open account menu for ' + (user.fullName || 'your account'));
    } else {
      if (label) label.textContent = 'My Account';
      if (avatar) avatar.hidden = true;
      if (icon) icon.hidden = false;
      button.setAttribute('aria-label', 'Sign in or create an account');
    }
  }

  function paintMenu() {
    var user = AFM.auth.user;
    if (!user || !panel) return;

    var avatar = panel.querySelector('[data-afm-menu-avatar]');
    var name = panel.querySelector('[data-afm-menu-name]');
    var email = panel.querySelector('[data-afm-menu-email]');
    var count = panel.querySelector('[data-afm-menu-favcount]');

    if (avatar) avatar.textContent = user.initials || 'AF';
    if (name) name.textContent = user.fullName || 'Your account';
    if (email) email.textContent = user.email || '';
    if (count) count.textContent = String((AFM.profile._state && AFM.profile._state.stats.favorites) || 0);
  }

  function refreshHeader() {
    paintHeader();
    paintMenu();
  }

  /* ====================================================================== */
  /*  Notices + toasts                                                      */
  /* ====================================================================== */

  function showNotice(options) {
    options = options || {};
    if (!panel) return;

    var icon = panel.querySelector('[data-afm-notice-icon]');
    var title = panel.querySelector('[data-afm-notice-title]');
    var text = panel.querySelector('[data-afm-notice-text]');
    var primary = panel.querySelector('[data-afm-notice-primary]');
    var secondary = panel.querySelector('[data-afm-notice-secondary]');

    if (icon) {
      icon.innerHTML = options.icon === 'alert' ? ICON.alert : (options.icon === 'mail' ? ICON.mail : ICON.check);
      icon.setAttribute('data-tone', options.icon || 'check');
    }
    if (title) title.textContent = options.title || 'Done';
    if (text) text.textContent = options.text || '';

    if (primary) {
      primary.textContent = options.primaryLabel || 'Continue';
      primary.hidden = false;
      primary.onclick = function () {
        if (typeof options.primaryAction === 'function') {
          options.primaryAction();
        } else {
          showView(options.primaryView || 'login');
        }
      };
    }

    if (secondary) {
      if (options.secondaryLabel) {
        secondary.textContent = options.secondaryLabel;
        secondary.hidden = false;
        secondary.onclick = function () {
          if (typeof options.secondaryAction === 'function') options.secondaryAction();
        };
      } else {
        secondary.hidden = true;
        secondary.onclick = null;
      }
    }

    showView('notice');
  }

  function toast(message, type) {
    var host = document.getElementById('afm-toasts');
    if (!host) {
      host = document.createElement('div');
      host.id = 'afm-toasts';
      host.className = 'afm-toasts';
      host.setAttribute('aria-live', 'polite');
      host.setAttribute('aria-atomic', 'false');
      document.body.appendChild(host);
    }

    var item = document.createElement('div');
    item.className = 'afm-toast afm-toast--' + (type || 'info');
    item.setAttribute('role', 'status');

    var dot = document.createElement('span');
    dot.className = 'afm-toast__dot';
    dot.setAttribute('aria-hidden', 'true');

    var copy = document.createElement('span');
    copy.className = 'afm-toast__text';
    copy.textContent = message;

    item.appendChild(dot);
    item.appendChild(copy);
    host.appendChild(item);

    while (host.children.length > 3) host.removeChild(host.firstChild);

    window.requestAnimationFrame(function () {
      item.classList.add('is-in');
    });

    window.setTimeout(function () {
      item.classList.remove('is-in');
      window.setTimeout(function () {
        if (item.parentNode) item.parentNode.removeChild(item);
      }, 300);
    }, 4400);
  }

  /* ====================================================================== */
  /*  Navigation                                                            */
  /* ====================================================================== */

  function showTab(name) {
    var dash = document.getElementById('afm-dash');
    var valid = ['profile', 'edit', 'favorites', 'settings'];
    if (valid.indexOf(name) === -1) name = 'profile';

    if (!dash) {
      window.location.href = ((window.AFM_CONFIG || {}).ACCOUNT_PAGE || '/') + '#' + name;
      return;
    }

    if (!AFM.auth.user) {
      pendingTab = name;
      openPanel({ view: 'login' });
      return;
    }

    $$('[data-afm-tab]', dash).forEach(function (tab) {
      var active = tab.getAttribute('data-afm-tab') === name;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', active ? 'true' : 'false');
      tab.setAttribute('tabindex', active ? '0' : '-1');
    });

    $$('[data-afm-tab-panel]', dash).forEach(function (section) {
      section.hidden = section.getAttribute('data-afm-tab-panel') !== name;
    });

    if (name === 'favorites') AFM.favorites.load();
    if (name === 'profile' || name === 'edit' || name === 'settings') AFM.profile.render();

    try {
      history.replaceState(null, '', '#' + name);
    } catch (err) {
      /* history unavailable */
    }

    if (window.matchMedia('(max-width: 760px)').matches) {
      var nav = dash.querySelector('.afm-dash__nav');
      if (nav && nav.scrollIntoView) nav.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function go(target) {
    if (target === 'logout') {
      AFM.auth.logout().then(function () {
        toast('You have been signed out.', 'info');
        closePanel();
        AFM.profile.render();
      });
      return;
    }

    var dash = document.getElementById('afm-dash');
    if (dash) {
      showTab(target);
      closePanel();
      var top = dash.getBoundingClientRect().top + window.pageYOffset - 100;
      window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    } else {
      window.location.href = ((window.AFM_CONFIG || {}).ACCOUNT_PAGE || '/') + '#' + target;
    }
  }

  /* ====================================================================== */
  /*  Wiring                                                                */
  /* ====================================================================== */

  function ensureButton() {
    if ($('[data-afm-account]') || $('[data-afm-account-btn]')) return;

    var actions = document.querySelector('.ah-actions');
    if (!actions) return;

    var root = document.createElement('div');
    root.className = 'afm-account';
    root.setAttribute('data-afm-account', '');
    root.innerHTML = buttonMarkup();

    var burger = actions.querySelector('.ah-burger');
    actions.insertBefore(root, burger || null);
  }

  function bindHeader() {
    var button = getButton();
    if (button) {
      button.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        togglePanel();
      });
    }

    $$('[data-afm-open-login]').forEach(function (el) {
      el.addEventListener('click', function (event) {
        event.preventDefault();
        openPanel({ view: 'login' });
      });
    });

    $$('[data-afm-open-register]').forEach(function (el) {
      el.addEventListener('click', function (event) {
        event.preventDefault();
        openPanel({ view: 'register' });
      });
    });
  }

  function bindPanel() {
    if (!panel) return;

    panel.addEventListener('click', function (event) {
      var close = event.target.closest ? event.target.closest('[data-afm-close]') : null;
      if (close) {
        closePanel();
        return;
      }

      var viewLink = event.target.closest ? event.target.closest('[data-afm-view-link]') : null;
      if (viewLink) {
        showView(viewLink.getAttribute('data-afm-view-link'));
        return;
      }

      var goButton = event.target.closest ? event.target.closest('[data-afm-go]') : null;
      if (goButton) {
        go(goButton.getAttribute('data-afm-go'));
      }
    });

    if (scrim) {
      scrim.addEventListener('click', function () {
        closePanel();
      });
    }

    document.addEventListener('mousedown', function (event) {
      if (!isPanelOpen()) return;
      if (panel.contains(event.target)) return;
      var button = getButton();
      if (button && button.contains(event.target)) return;
      closePanel();
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' || event.key === 'Esc') {
        if (isPanelOpen()) {
          event.preventDefault();
          closePanel();
          return;
        }
      }

      if (event.key !== 'Tab' || !isPanelOpen() || !isMobile()) return;

      var focusables = $$('a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])', panel)
        .filter(function (el) { return el.offsetParent !== null; });

      if (!focusables.length) return;
      var first = focusables[0];
      var last = focusables[focusables.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });

    var raf = null;
    function reposition() {
      if (!isPanelOpen()) return;
      if (raf) return;
      raf = window.requestAnimationFrame(function () {
        raf = null;
        positionPanel();
      });
    }

    window.addEventListener('scroll', reposition, { passive: true });
    window.addEventListener('resize', reposition);

    try {
      var media = window.matchMedia(MODAL_QUERY);
      if (media.addEventListener) media.addEventListener('change', reposition);
      else if (media.addListener) media.addListener(reposition);
    } catch (err) {
      /* ignore */
    }
  }

  function bindDashboard() {
    $$('[data-afm-tab]').forEach(function (tab) {
      tab.addEventListener('click', function () {
        showTab(tab.getAttribute('data-afm-tab'));
      });
    });

    $$('[data-afm-tab-jump]').forEach(function (button) {
      button.addEventListener('click', function () {
        showTab(button.getAttribute('data-afm-tab-jump'));
      });
    });

    var year = document.getElementById('afm-year');
    if (year) year.textContent = String(new Date().getFullYear());

    var dash = document.getElementById('afm-dash');
    if (dash) {
      dash.addEventListener('keydown', function (event) {
        if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
        var tabs = $$('[data-afm-tab]', dash);
        var current = -1;
        for (var i = 0; i < tabs.length; i++) {
          if (tabs[i].classList.contains('is-active')) { current = i; break; }
        }
        if (current === -1) return;
        var next = event.key === 'ArrowRight' ? (current + 1) % tabs.length : (current - 1 + tabs.length) % tabs.length;
        tabs[next].focus();
        showTab(tabs[next].getAttribute('data-afm-tab'));
      });
    }

    $$('[data-afm-logout]').forEach(function (button) {
      button.addEventListener('click', function () { go('logout'); });
    });
  }

  function bindEvents() {
    AFM.bus.on('auth:change', function (user) {
      refreshHeader();
      AFM.profile.setVisible(user);
      if (user) {
        AFM.favorites.load(true);
      } else {
        AFM.favorites.render();
      }
    });

    AFM.bus.on('ui:login-success', function (user) {
      closePanel({ restoreFocus: false });
      refreshHeader();
      AFM.profile.render();
      toast('Welcome back' + (user && user.fullName ? ', ' + firstName(user) : '') + '.', 'success');

      if (pendingTab) {
        var target = pendingTab;
        pendingTab = '';
        window.setTimeout(function () { showTab(target); }, 60);
      } else if (document.getElementById('afm-dash')) {
        showTab('profile');
      }
    });

    AFM.bus.on('auth:logout', function () {
      refreshHeader();
      AFM.profile.render();
      AFM.favorites.render();
    });

    AFM.bus.on('session:expired', function () {
      var wasSignedIn = !!AFM.auth.user;
      if (wasSignedIn) AFM.auth.setUser(null);
      refreshHeader();
      AFM.profile.render();
      if (wasSignedIn && !isPanelOpen()) {
        openPanel({ view: 'login' });
        toast('Your session expired. Please sign in again.', 'info');
      }
    });
  }

  /* ====================================================================== */
  /*  Query string + hash                                                   */
  /* ====================================================================== */

  function queryParam(name) {
    try {
      return new URLSearchParams(window.location.search).get(name);
    } catch (err) {
      var match = new RegExp('[?&]' + name + '=([^&]*)').exec(window.location.search);
      return match ? decodeURIComponent(match[1]) : null;
    }
  }

  function clearQueryParam(name) {
    try {
      var url = new URL(window.location.href);
      if (!url.searchParams.has(name)) return;
      url.searchParams.delete(name);
      history.replaceState(null, '', url.pathname + (url.searchParams.toString() ? '?' + url.searchParams.toString() : '') + url.hash);
    } catch (err) {
      /* ignore */
    }
  }

  function handleQuery() {
    var verify = queryParam('verify');
    if (verify) {
      AFM.auth._setVerifyToken(verify);
      clearQueryParam('verify');
      openPanel({ view: 'verify' });
      return;
    }

    var reset = queryParam('reset');
    if (reset) {
      AFM.auth._setResetToken(reset);
      clearQueryParam('reset');
      openPanel({ view: 'reset' });
      return;
    }

    if (queryParam('view') === 'register') {
      openPanel({ view: 'register' });
      clearQueryParam('view');
      return;
    }

    if (queryParam('view') === 'login') {
      openPanel({ view: 'login' });
      clearQueryParam('view');
    }
  }

  function handleHash() {
    var hash = String(window.location.hash || '').replace(/^#/, '');
    if (!hash) return;
    if (['profile', 'edit', 'favorites', 'settings'].indexOf(hash) === -1) return;
    if (document.getElementById('afm-dash')) showTab(hash);
  }

  /* ====================================================================== */
  /*  Automatic popup                                                       */
  /* ====================================================================== */

  function autoPopupAllowed() {
    var cfg = window.AFM_CONFIG || {};
    if (cfg.AUTO_POPUP === false) return false;
    if (safeGet('localStorage', AUTO_POPUP_OFF_KEY) === '1') return false;
    if (safeGet('sessionStorage', POPUP_KEY) === '1') return false;
    if (AFM.auth.user) return false;
    if (isPanelOpen()) return false;
    if (queryParam('verify') || queryParam('reset')) return false;
    if (window.location.hash === '#register') return false;
    /* The dedicated account page is already the sign-in surface; a popup on
       top of it would duplicate the guest card. */
    if (document.getElementById('afm-guest')) return false;
    if (document.documentElement.classList.contains('afm-panel-open')) return false;
    return true;
  }

  function scheduleAutoPopup() {
    var cfg = window.AFM_CONFIG || {};
    var delay = Number(cfg.POPUP_DELAY_MS);
    if (!isFinite(delay) || delay < 0) delay = 3000;

    window.setTimeout(function () {
      AFM.auth.ready.then(function () {
        if (autoPopupAllowed()) openPanel({ view: 'login', auto: true });
      });
    }, delay);
  }

  /* ====================================================================== */
  /*  Public UI helpers                                                     */
  /* ====================================================================== */

  AFM.ui = {
    openPanel: openPanel,
    closePanel: closePanel,
    togglePanel: togglePanel,
    showView: showView,
    showNotice: showNotice,
    showTab: showTab,
    go: go,
    toast: toast,
    refreshHeader: refreshHeader,
    clearQueryParam: clearQueryParam,
    error: function (id, message) {
      var box = document.getElementById(id);
      if (!box) return;
      box.textContent = message || '';
      box.hidden = !message;
    },
    busy: function (button, busy, label) {
      if (!button) return;
      if (busy) {
        if (!button.getAttribute('data-afm-label')) {
          button.setAttribute('data-afm-label', button.innerHTML);
        }
        button.disabled = true;
        button.innerHTML = '<span class="afm-spinner" aria-hidden="true"></span><span>' +
          (label || 'Please wait…') + '</span>';
      } else {
        button.disabled = false;
        var original = button.getAttribute('data-afm-label');
        if (original) button.innerHTML = original;
      }
    },
    position: positionPanel,
    isOpen: isPanelOpen
  };

  /* ====================================================================== */
  /*  Boot                                                                  */
  /* ====================================================================== */

  function boot() {
    if (booted) return;
    booted = true;

    try {
      if (safeGet('localStorage', 'afm.reduce.motion') === '1') {
        document.documentElement.classList.add('afm-reduce-motion');
      }
    } catch (err) {
      /* ignore */
    }

    ensureButton();
    buildPanel();
    setAccountLink();

    var setup = document.getElementById('afm-setup');
    if (setup && !AFM.api.isConfigured()) setup.hidden = false;

    AFM.auth.init();
    AFM.profile.init();
    AFM.favorites.init();

    bindHeader();
    bindPanel();
    bindDashboard();
    bindEvents();

    paintHeader();

    /* Cached paint keeps the header stable while the server validates. */
    if (AFM.session.hasToken() && !AFM.auth.user) {
      var cached = AFM.session.cachedUser();
      if (cached) {
        paintHeader();
        AFM.profile.setVisible(cached);
      }
    }

    AFM.auth.restore().then(function () {
      refreshHeader();
      AFM.profile.render();
      handleQuery();
      handleHash();
    });

    scheduleAutoPopup();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window, document);
