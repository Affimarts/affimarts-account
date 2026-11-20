/**
 * ============================================================================
 * AFFIMARTS ACCOUNT — AUTHENTICATION
 * ============================================================================
 * Form wiring and auth API calls: sign in, registration, verification,
 * password recovery, sign out.
 * ============================================================================
 */
(function (window, document) {
  'use strict';

  var AFM = window.AFM = window.AFM || {};

  var state = {
    user: null,
    ready: null,
    pendingEmail: '',
    resetToken: '',
    verifyToken: ''
  };

  function $(selector, root) {
    return (root || document).querySelector(selector);
  }

  function value(id) {
    var el = document.getElementById(id);
    return el ? String(el.value || '') : '';
  }

  function setValue(id, next) {
    var el = document.getElementById(id);
    if (el) el.value = next;
  }

  function fieldError(input, message) {
    if (!input) return;
    var id = input.id;
    var slot = document.querySelector('[data-afm-field-error="' + id + '"]');
    if (slot) {
      slot.textContent = message || '';
      slot.hidden = !message;
    }
    input.classList.toggle('is-invalid', !!message);
    if (message) {
      input.setAttribute('aria-invalid', 'true');
    } else {
      input.removeAttribute('aria-invalid');
    }
  }

  function clearFields(form) {
    if (!form) return;
    Array.prototype.slice.call(form.querySelectorAll('input, select')).forEach(function (input) {
      if (input.type === 'checkbox') {
        input.checked = false;
      } else {
        input.value = '';
      }
      fieldError(input, '');
    });
  }

  function setBusy(button, busy, busyLabel) {
    if (!button) return;
    if (busy) {
      if (!button.getAttribute('data-afm-label')) {
        button.setAttribute('data-afm-label', button.innerHTML);
      }
      button.disabled = true;
      button.classList.add('is-busy');
      button.innerHTML = '<span class="afm-spinner" aria-hidden="true"></span>' +
        '<span>' + (busyLabel || 'Please wait…') + '</span>';
    } else {
      button.disabled = false;
      button.classList.remove('is-busy');
      var label = button.getAttribute('data-afm-label');
      if (label) button.innerHTML = label;
    }
  }

  function showError(id, message) {
    var box = document.getElementById(id);
    if (!box) return;
    box.textContent = message || '';
    box.hidden = !message;
  }

  function focusFirst(viewName) {
    var view = document.querySelector('[data-afm-view="' + viewName + '"]');
    if (!view) return;
    var target = view.querySelector('input:not([type="hidden"]), select, button.afm-btn');
    if (target) {
      window.setTimeout(function () {
        try { target.focus({ preventScroll: true }); } catch (err) { target.focus(); }
      }, 90);
    }
  }

  /* ====================================================================== */
  /*  Auth API                                                              */
  /* ====================================================================== */

  function setUser(user) {
    state.user = user || null;
    AFM.session.setCachedUser(state.user);
    AFM.bus.emit('auth:change', state.user);
    return state.user;
  }

  function firstName(user) {
    var name = String((user && user.fullName) || '').replace(/^\s+|\s+$/g, '');
    return name ? name.split(' ')[0] : '';
  }

  var auth = {
    get user() {
      return state.user;
    },

    get ready() {
      return state.ready || Promise.resolve(state.user);
    },

    firstName: function () {
      return firstName(state.user);
    },

    /**
     * Restore a previous session from its bearer token.
     * The server is always the authority.
     * @return {Promise<Object|null>}
     */
    restore: function () {
      var token = AFM.session.token();
      if (!token) {
        setUser(null);
        return Promise.resolve(null);
      }

      if (!AFM.api.isConfigured()) {
        setUser(AFM.session.cachedUser());
        return Promise.resolve(state.user);
      }

      state.ready = AFM.api.request('validateSession')
        .then(function (res) {
          var data = res.data || {};
          return setUser(data.user || null);
        })
        .catch(function (err) {
          var code = err && err.code;
          if (code === 'SESSION_INVALID' || code === 'SESSION_EXPIRED' ||
              code === 'SESSION_REQUIRED' || code === 'ACCOUNT_DISABLED') {
            AFM.session.clearToken();
            return setUser(null);
          }
          /* Network hiccup: keep the cached shell, server still enforces auth. */
          return setUser(AFM.session.cachedUser());
        });

      return state.ready;
    },

    /**
     * @param {{email: string, password: string, remember: boolean}} credentials
     * @return {Promise<Object>} user
     */
    login: function (credentials) {
      return AFM.api.request('loginUser', {
        email: credentials.email,
        password: credentials.password,
        remember: !!credentials.remember
      }).then(function (res) {
        var data = res.data || {};
        if (!data.token || !data.user) {
          throw new AFM.api.ApiError('BAD_RESPONSE', 'Sign-in could not be completed. Please try again.');
        }
        AFM.session.setToken(data.token, !!data.remember);
        setUser(data.user);
        AFM.bus.emit('auth:login', data.user);
        return data.user;
      });
    },

    /**
     * @param {Object} payload
     * @return {Promise<Object>}
     */
    register: function (payload) {
      return AFM.api.request('registerUser', payload).then(function (res) {
        var data = res.data || {};
        state.pendingEmail = data.email || payload.email || '';
        AFM.bus.emit('auth:registered', data);
        return data;
      });
    },

    /**
     * @param {string=} token defaults to the stored verification token
     * @return {Promise<Object>}
     */
    verifyEmail: function (token) {
      var raw = token || state.verifyToken;
      if (!raw) {
        return Promise.reject(new AFM.api.ApiError('TOKEN_INVALID', 'This verification link is incomplete.'));
      }
      return AFM.api.request('verifyEmail', { token: raw }).then(function (res) {
        state.verifyToken = '';
        AFM.bus.emit('auth:verified', res.data || {});
        return res.data || {};
      });
    },

    /**
     * @param {string} email
     * @return {Promise<Object>}
     */
    resendVerification: function (email) {
      var target = email || state.pendingEmail;
      return AFM.api.request('resendVerificationEmail', { email: target }).then(function (res) {
        return res.data || {};
      });
    },

    /**
     * @param {string} email
     * @return {Promise<Object>}
     */
    requestReset: function (email) {
      return AFM.api.request('requestPasswordReset', { email: email }).then(function (res) {
        return res.data || {};
      });
    },

    /**
     * @param {{token: string, password: string, confirmPassword: string}} payload
     * @return {Promise<Object>}
     */
    resetPassword: function (payload) {
      return AFM.api.request('resetPassword', {
        token: payload.token || state.resetToken,
        password: payload.password,
        confirmPassword: payload.confirmPassword
      }).then(function (res) {
        state.resetToken = '';
        return res.data || {};
      });
    },

    /**
     * @return {Promise<Object>}
     */
    logout: function () {
      var token = AFM.session.token();
      var finish = function () {
        AFM.session.clearToken();
        setUser(null);
        AFM.bus.emit('auth:logout', {});
      };

      if (!token || !AFM.api.isConfigured()) {
        finish();
        return Promise.resolve({});
      }

      return AFM.api.request('logoutUser', {}).then(finish).catch(finish);
    },

    /**
     * Revoke every session, including this one.
     * @return {Promise<Object>}
     */
    logoutAll: function () {
      return AFM.api.request('logoutAll', {}).then(function (res) {
        AFM.session.clearToken();
        setUser(null);
        AFM.bus.emit('auth:logout', { all: true });
        return res.data || {};
      });
    },

    setUser: setUser,

    /* Internal state used by the UI layer. */
    _state: state,
    _pendingEmail: function () { return state.pendingEmail; },
    _setPendingEmail: function (email) { state.pendingEmail = email || ''; },
    _setResetToken: function (token) { state.resetToken = token || ''; },
    _setVerifyToken: function (token) { state.verifyToken = token || ''; }
  };

  AFM.auth = auth;

  /* ====================================================================== */
  /*  Password visibility + strength                                        */
  /* ====================================================================== */

  function bindToggles() {
    document.addEventListener('click', function (event) {
      var button = event.target.closest ? event.target.closest('[data-afm-toggle]') : null;
      if (!button) return;
      var input = document.getElementById(button.getAttribute('data-afm-toggle'));
      if (!input) return;
      var show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      button.setAttribute('aria-pressed', show ? 'true' : 'false');
      button.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    });
  }

  function bindStrength(inputId) {
    var input = document.getElementById(inputId);
    var meter = document.querySelector('[data-afm-strength-for="' + inputId + '"]');
    if (!input || !meter) return;

    var fill = meter.querySelector('.afm-strength__fill');
    var label = meter.querySelector('.afm-strength__label');

    function update() {
      var score = AFM.validate.strength(input.value);
      meter.setAttribute('data-score', String(score.score));
      meter.setAttribute('aria-valuenow', String(score.percent));
      if (fill) fill.style.width = Math.max(4, score.percent) + '%';
      if (label) {
        label.textContent = input.value ? score.label : 'Use 8+ characters with a number';
      }
    }

    input.addEventListener('input', update);
    update();
  }

  /* ====================================================================== */
  /*  Login                                                                 */
  /* ====================================================================== */

  function handleLoginError(err) {
    var code = err && err.code;
    var message = (err && err.message) || 'Sign-in failed. Please try again.';

    if (code === 'EMAIL_NOT_VERIFIED') {
      state.pendingEmail = value('afm-login-email');
      AFM.ui.showNotice({
        icon: 'mail',
        title: 'Confirm your email first',
        text: 'Your account is ready but needs email confirmation. We can send a fresh verification link to ' + state.pendingEmail + '.',
        primaryLabel: 'Back to sign in',
        primaryView: 'login',
        secondaryLabel: 'Resend verification email',
        secondaryAction: function () {
          AFM.auth._setPendingEmail(state.pendingEmail);
          AFM.ui.showView('resend');
        }
      });
      return;
    }

    showError('afm-login-error', message);
    var password = document.getElementById('afm-login-password');
    if (code === 'INVALID_CREDENTIALS' && password) password.select();
  }

  function bindLogin() {
    var form = document.getElementById('afm-login-form');
    if (!form) return;

    var email = document.getElementById('afm-login-email');
    var password = document.getElementById('afm-login-password');

    if (email) {
      email.addEventListener('blur', function () {
        if (!email.value) return;
        var check = AFM.validate.email(email.value);
        fieldError(email, check.ok ? '' : check.message);
      });
      email.addEventListener('input', function () { fieldError(email, ''); });
    }
    if (password) password.addEventListener('input', function () { fieldError(password, ''); });

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      showError('afm-login-error', '');

      var emailCheck = AFM.validate.email(email ? email.value : '');
      if (!emailCheck.ok) {
        fieldError(email, emailCheck.message);
        if (email) email.focus();
        return;
      }
      if (!password || !password.value) {
        fieldError(password, 'Enter your password.');
        if (password) password.focus();
        return;
      }

      var submit = document.getElementById('afm-login-submit');
      setBusy(submit, true, 'Signing in…');

      AFM.auth.login({
        email: email.value,
        password: password.value,
        remember: !!(document.getElementById('afm-login-remember') || {}).checked
      }).then(function (user) {
        form.reset();
        showError('afm-login-error', '');
        AFM.bus.emit('ui:login-success', user);
      }).catch(handleLoginError).then(function () {
        setBusy(submit, false);
      });
    });
  }

  /* ====================================================================== */
  /*  Registration                                                          */
  /* ====================================================================== */

  function bindRegister() {
    var form = document.getElementById('afm-register-form');
    if (!form) return;

    var name = document.getElementById('afm-reg-name');
    var email = document.getElementById('afm-reg-email');
    var password = document.getElementById('afm-reg-password');
    var confirm = document.getElementById('afm-reg-confirm');
    var mobile = document.getElementById('afm-reg-mobile');
    var dob = document.getElementById('afm-reg-dob');

    var blurChecks = [
      [name, function () { return AFM.validate.name(name.value); }],
      [email, function () { return AFM.validate.email(email.value); }],
      [mobile, function () { return AFM.validate.phone(mobile.value); }],
      [dob, function () { return AFM.validate.dob(dob.value); }],
      [password, function () {
        return AFM.validate.password(password.value, { email: email.value, fullName: name.value });
      }],
      [confirm, function () { return AFM.validate.confirm(password.value, confirm.value); }]
    ];

    blurChecks.forEach(function (pair) {
      var input = pair[0];
      if (!input) return;
      input.addEventListener('blur', function () {
        if (!input.value && input !== password) {
          fieldError(input, '');
          return;
        }
        var check = pair[1]();
        fieldError(input, check.ok ? '' : check.message);
      });
      input.addEventListener('input', function () { fieldError(input, ''); });
    });

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      showError('afm-register-error', '');

      var checks = [
        [name, AFM.validate.name(name.value)],
        [email, AFM.validate.email(email.value)],
        [password, AFM.validate.password(password.value, { email: email.value, fullName: name.value })],
        [confirm, AFM.validate.confirm(password.value, confirm.value)],
        [mobile, AFM.validate.phone(mobile.value)],
        [dob, AFM.validate.dob(dob.value)]
      ];

      var firstInvalid = null;
      checks.forEach(function (pair) {
        fieldError(pair[0], pair[1].ok ? '' : pair[1].message);
        if (!pair[1].ok && !firstInvalid) firstInvalid = pair[0];
      });
      if (firstInvalid) {
        firstInvalid.focus();
        return;
      }

      var submit = document.getElementById('afm-register-submit');
      setBusy(submit, true, 'Creating account…');

      AFM.auth.register({
        fullName: name.value,
        email: email.value,
        password: password.value,
        confirmPassword: confirm.value,
        mobile: mobile ? mobile.value : '',
        gender: (document.getElementById('afm-reg-gender') || {}).value || '',
        dob: dob ? dob.value : ''
      }).then(function (data) {
        form.reset();
        var sent = data.verificationEmailSent !== false;
        AFM.ui.showNotice({
          icon: 'mail',
          title: sent ? 'Check your inbox' : 'Account created',
          text: sent
            ? 'We sent a confirmation link to ' + data.email + '. Open it to activate your account, then sign in.'
            : 'Your account is ready, but the verification email could not be sent. Use the button below to try again.',
          primaryLabel: 'Back to sign in',
          primaryView: 'login',
          secondaryLabel: 'Resend verification email',
          secondaryAction: function () {
            AFM.auth._setPendingEmail(data.email);
            AFM.ui.showView('resend');
          }
        });
        AFM.ui.toast('Account created. Confirm your email to sign in.', 'success');
      }).catch(function (err) {
        if (err && err.code === 'EMAIL_EXISTS') {
          showError('afm-register-error', err.message);
          var loginLink = document.getElementById('afm-register-login-link');
          if (loginLink) loginLink.classList.add('is-highlighted');
          return;
        }
        showError('afm-register-error', (err && err.message) || 'Registration failed. Please try again.');
      }).then(function () {
        setBusy(submit, false);
      });
    });
  }

  /* ====================================================================== */
  /*  Forgot password                                                       */
  /* ====================================================================== */

  function bindForgot() {
    var form = document.getElementById('afm-forgot-form');
    if (!form) return;
    var email = document.getElementById('afm-forgot-email');

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      showError('afm-forgot-error', '');

      var check = AFM.validate.email(email ? email.value : '');
      if (!check.ok) {
        fieldError(email, check.message);
        if (email) email.focus();
        return;
      }

      var submit = document.getElementById('afm-forgot-submit');
      setBusy(submit, true, 'Sending…');

      AFM.auth.requestReset(email.value).then(function () {
        AFM.ui.showNotice({
          icon: 'mail',
          title: 'Check your inbox',
          text: 'If an Affimarts account exists for ' + email.value + ', a password reset link is on its way. The link expires in 30 minutes and can only be used once.',
          primaryLabel: 'Back to sign in',
          primaryView: 'login'
        });
      }).catch(function (err) {
        showError('afm-forgot-error', (err && err.message) || 'Could not send the reset email. Please try again.');
      }).then(function () {
        setBusy(submit, false);
      });
    });
  }

  /* ====================================================================== */
  /*  Reset password                                                        */
  /* ====================================================================== */

  function bindReset() {
    var form = document.getElementById('afm-reset-form');
    if (!form) return;

    var password = document.getElementById('afm-reset-password');
    var confirm = document.getElementById('afm-reset-confirm');

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      showError('afm-reset-error', '');

      var checks = [
        [password, AFM.validate.password(password.value)],
        [confirm, AFM.validate.confirm(password.value, confirm.value)]
      ];
      var firstInvalid = null;
      checks.forEach(function (pair) {
        fieldError(pair[0], pair[1].ok ? '' : pair[1].message);
        if (!pair[1].ok && !firstInvalid) firstInvalid = pair[0];
      });
      if (firstInvalid) {
        firstInvalid.focus();
        return;
      }

      var submit = document.getElementById('afm-reset-submit');
      setBusy(submit, true, 'Updating…');

      AFM.auth.resetPassword({
        password: password.value,
        confirmPassword: confirm.value
      }).then(function (data) {
        form.reset();
        AFM.session.clearToken();
        AFM.auth.setUser(null);
        AFM.ui.showNotice({
          icon: 'check',
          title: 'Password updated',
          text: 'Your password has been changed and every device has been signed out. Sign in with your new password.',
          primaryLabel: 'Sign in',
          primaryView: 'login'
        });
        AFM.ui.toast('Password updated. Please sign in.', 'success');
        AFM.ui.clearQueryParam('reset');
      }).catch(function (err) {
        var message = (err && err.message) || 'Could not update your password.';
        showError('afm-reset-error', message);
        if (err && (err.code === 'TOKEN_INVALID' || err.code === 'TOKEN_USED' || err.code === 'TOKEN_EXPIRED')) {
          AFM.ui.showNotice({
            icon: 'alert',
            title: 'This link is no longer valid',
            text: message + ' Request a new reset link to continue.',
            primaryLabel: 'Request a new link',
            primaryView: 'forgot'
          });
        }
      }).then(function () {
        setBusy(submit, false);
      });
    });
  }

  /* ====================================================================== */
  /*  Email verification                                                    */
  /* ====================================================================== */

  function bindVerify() {
    var button = document.getElementById('afm-verify-submit');
    if (!button) return;

    button.addEventListener('click', function () {
      showError('afm-verify-error', '');
      setBusy(button, true, 'Confirming…');

      AFM.auth.verifyEmail().then(function (data) {
        AFM.ui.clearQueryParam('verify');
        AFM.ui.showNotice({
          icon: 'check',
          title: 'Email confirmed',
          text: 'Your email address is confirmed. Sign in to reach your profile, favourites and settings.',
          primaryLabel: 'Sign in',
          primaryView: 'login'
        });
        AFM.ui.toast('Email confirmed. Welcome to Affimarts.', 'success');
      }).catch(function (err) {
        var message = (err && err.message) || 'We could not confirm this link.';
        showError('afm-verify-error', message);
        AFM.ui.showNotice({
          icon: 'alert',
          title: 'Verification problem',
          text: message,
          primaryLabel: 'Back to sign in',
          primaryView: 'login',
          secondaryLabel: 'Resend verification email',
          secondaryAction: function () {
            AFM.ui.showView('resend');
          }
        });
      }).then(function () {
        setBusy(button, false);
      });
    });
  }

  /* ====================================================================== */
  /*  Resend verification                                                   */
  /* ====================================================================== */

  function bindResend() {
    var form = document.getElementById('afm-resend-form');
    if (!form) return;
    var email = document.getElementById('afm-resend-email');

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      showError('afm-resend-error', '');

      var check = AFM.validate.email(email ? email.value : '');
      if (!check.ok) {
        fieldError(email, check.message);
        if (email) email.focus();
        return;
      }

      var submit = document.getElementById('afm-resend-submit');
      setBusy(submit, true, 'Sending…');

      AFM.auth.resendVerification(email.value).then(function () {
        AFM.ui.showNotice({
          icon: 'mail',
          title: 'Check your inbox',
          text: 'If this address still needs confirmation, a fresh verification link is on its way. The link can only be used once.',
          primaryLabel: 'Back to sign in',
          primaryView: 'login'
        });
      }).catch(function (err) {
        showError('afm-resend-error', (err && err.message) || 'Could not resend the email. Please try again.');
      }).then(function () {
        setBusy(submit, false);
      });
    });
  }

  /* ====================================================================== */
  /*  Public init                                                           */
  /* ====================================================================== */

  auth.init = function () {
    bindToggles();
    bindLogin();
    bindRegister();
    bindForgot();
    bindReset();
    bindVerify();
    bindResend();
    bindStrength('afm-reg-password');
    bindStrength('afm-reset-password');
    return auth;
  };
})(window, document);
