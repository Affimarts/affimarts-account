/**
 * ============================================================================
 * AFFIMARTS ACCOUNT — PROFILE + SETTINGS
 * ============================================================================
 * Dashboard rendering, profile editing, password change, session controls and
 * browser preferences. Every account mutation goes through the API.
 * ============================================================================
 */
(function (window, document) {
  'use strict';

  var AFM = window.AFM = window.AFM || {};

  var state = {
    session: null,
    stats: { favorites: 0 },
    loading: false
  };

  function $(selector, root) {
    return (root || document).querySelector(selector);
  }

  function text(selector, value) {
    var el = $(selector);
    if (el) el.textContent = value == null ? '' : String(value);
  }

  function formatDate(value, fallback) {
    if (!value) return fallback || '—';
    var raw = String(value);
    var date;
    /* Date-only values are calendar dates, not UTC instants. Parsing them
       locally avoids an off-by-one day in negative timezones. */
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      var parts = raw.split('-');
      date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    } else {
      date = new Date(raw);
    }
    if (isNaN(date.getTime())) return raw;
    try {
      return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    } catch (err) {
      return date.toDateString();
    }
  }

  function formatDateTime(value) {
    if (!value) return '—';
    var date = new Date(value);
    if (isNaN(date.getTime())) return String(value);
    try {
      return date.toLocaleString('en-GB', {
        day: 'numeric', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });
    } catch (err) {
      return date.toString();
    }
  }

  function statusLabel(user) {
    if (!user) return 'Signed out';
    if (user.accountStatus === 'disabled') return 'Disabled';
    if (!user.emailVerified) return 'Pending email confirmation';
    return 'Active';
  }

  function fieldError(input, message) {
    if (!input) return;
    var slot = document.querySelector('[data-afm-field-error="' + input.id + '"]');
    if (slot) {
      slot.textContent = message || '';
      slot.hidden = !message;
    }
    input.classList.toggle('is-invalid', !!message);
  }

  function showError(id, message) {
    var box = document.getElementById(id);
    if (!box) return;
    box.textContent = message || '';
    box.hidden = !message;
  }

  function setBusy(button, busy, label) {
    if (!button) return;
    if (busy) {
      if (!button.getAttribute('data-afm-label')) {
        button.setAttribute('data-afm-label', button.innerHTML);
      }
      button.disabled = true;
      button.innerHTML = '<span class="afm-spinner" aria-hidden="true"></span><span>' +
        (label || 'Saving…') + '</span>';
    } else {
      button.disabled = false;
      var original = button.getAttribute('data-afm-label');
      if (original) button.innerHTML = original;
    }
  }

  /* ====================================================================== */
  /*  Rendering                                                             */
  /* ====================================================================== */

  function paint(user) {
    if (!user) {
      text('[data-afm-profile-name]', 'Guest');
      text('[data-afm-profile-email]', '');
      return;
    }

    var initials = user.initials || 'AF';
    document.querySelectorAll('[data-afm-profile-avatar]').forEach(function (node) {
      node.textContent = initials;
    });

    text('[data-afm-profile-name]', user.fullName);
    text('[data-afm-profile-email]', user.email);
    text('[data-afm-profile-mobile]', user.mobile || 'Not added yet');
    text('[data-afm-profile-registered]', formatDate(user.registrationDate));
    text('[data-afm-profile-lastlogin]', user.lastLogin ? formatDateTime(user.lastLogin) : 'This is your first visit');
    text('[data-afm-profile-dob]', user.dateOfBirth ? formatDate(user.dateOfBirth) : 'Not added yet');
    text('[data-afm-profile-gender]', user.gender || 'Not specified');
    text('[data-afm-profile-favorites]', String(state.stats.favorites || 0));

    var status = $('[data-afm-profile-status]');
    if (status) {
      status.textContent = statusLabel(user);
      status.setAttribute('data-status', user.accountStatus === 'disabled' ? 'disabled' : (user.emailVerified ? 'active' : 'pending'));
    }

    var verified = $('[data-afm-profile-verified]');
    if (verified) {
      verified.textContent = user.emailVerified ? 'Verified' : 'Not verified';
      verified.setAttribute('data-verified', user.emailVerified ? 'true' : 'false');
    }

    /* Edit form */
    var name = document.getElementById('afm-edit-name');
    var email = document.getElementById('afm-edit-email');
    var mobile = document.getElementById('afm-edit-mobile');
    var gender = document.getElementById('afm-edit-gender');
    var dob = document.getElementById('afm-edit-dob');

    if (name) name.value = user.fullName || '';
    if (email) email.value = user.email || '';
    if (mobile) mobile.value = user.mobile || '';
    if (gender) gender.value = user.gender || '';
    if (dob) dob.value = user.dateOfBirth || '';

    text('[data-afm-settings-email]', user.email);

    var expiry = $('#afm-session-expiry');
    if (expiry) {
      expiry.textContent = state.session && state.session.expiresAt
        ? 'This session stays active until ' + formatDateTime(state.session.expiresAt) + ' unless you sign out.'
        : 'Your session is validated securely on every request.';
    }

    var prefAuto = document.getElementById('afm-pref-autopopup');
    if (prefAuto) {
      var disabled = false;
      try { disabled = localStorage.getItem('afm.autopopup.off') === '1'; } catch (err) { disabled = false; }
      prefAuto.checked = !disabled;
    }

    var prefMotion = document.getElementById('afm-pref-motion');
    if (prefMotion) {
      var reduced = false;
      try { reduced = localStorage.getItem('afm.reduce.motion') === '1'; } catch (err) { reduced = false; }
      prefMotion.checked = reduced;
    }
  }

  /* ====================================================================== */
  /*  Dashboard visibility                                                  */
  /* ====================================================================== */

  function setVisible(user) {
    var dash = document.getElementById('afm-dash');
    var guest = document.getElementById('afm-guest');
    if (dash) dash.hidden = !user;
    if (guest) guest.hidden = !!user;
  }

  /* ====================================================================== */
  /*  Load                                                                  */
  /* ====================================================================== */

  function refresh() {
    if (!AFM.auth.user) return Promise.resolve(null);
    if (!AFM.api.isConfigured()) return Promise.resolve(null);
    if (state.loading) return Promise.resolve(null);
    state.loading = true;

    return AFM.api.request('getUserProfile').then(function (res) {
      var data = res.data || {};
      if (data.user) AFM.auth.setUser(data.user);
      state.session = data.session || null;
      state.stats = data.stats || { favorites: 0 };
      paint(data.user);
      return data;
    }).catch(function (err) {
      if (err && err.code !== 'SESSION_INVALID' && err.code !== 'SESSION_EXPIRED') {
        AFM.ui.toast((err && err.message) || 'Could not refresh your profile.', 'error');
      }
      return null;
    }).then(function (data) {
      state.loading = false;
      return data;
    });
  }

  /* ====================================================================== */
  /*  Forms                                                                 */
  /* ====================================================================== */

  function bindEditForm() {
    var form = document.getElementById('afm-edit-form');
    if (!form) return;

    var name = document.getElementById('afm-edit-name');
    var mobile = document.getElementById('afm-edit-mobile');
    var dob = document.getElementById('afm-edit-dob');

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      showError('afm-edit-error', '');

      var checks = [
        [name, AFM.validate.name(name ? name.value : '')],
        [mobile, AFM.validate.phone(mobile ? mobile.value : '')],
        [dob, AFM.validate.dob(dob ? dob.value : '')]
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

      var submit = document.getElementById('afm-edit-submit');
      setBusy(submit, true, 'Saving…');

      AFM.api.request('updateUserProfile', {
        fullName: name ? name.value : '',
        mobile: mobile ? mobile.value : '',
        gender: (document.getElementById('afm-edit-gender') || {}).value || '',
        dob: dob ? dob.value : ''
      }).then(function (res) {
        var data = res.data || {};
        if (data.user) AFM.auth.setUser(data.user);
        paint(data.user || AFM.auth.user);
        AFM.ui.toast('Profile updated.', 'success');
      }).catch(function (err) {
        showError('afm-edit-error', (err && err.message) || 'Could not save your profile.');
      }).then(function () {
        setBusy(submit, false);
      });
    });
  }

  function bindPasswordForm() {
    var form = document.getElementById('afm-password-form');
    if (!form) return;

    var current = document.getElementById('afm-pw-current');
    var next = document.getElementById('afm-pw-new');
    var confirm = document.getElementById('afm-pw-confirm');

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      showError('afm-pw-error', '');

      if (!current || !current.value) {
        fieldError(current, 'Enter your current password.');
        if (current) current.focus();
        return;
      }

      var checks = [
        [next, AFM.validate.password(next ? next.value : '', { email: AFM.auth.user ? AFM.auth.user.email : '' })],
        [confirm, AFM.validate.confirm(next ? next.value : '', confirm ? confirm.value : '')]
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

      var submit = document.getElementById('afm-pw-submit');
      setBusy(submit, true, 'Updating…');

      AFM.api.request('updatePassword', {
        currentPassword: current.value,
        newPassword: next.value,
        confirmPassword: confirm.value
      }).then(function () {
        form.reset();
        AFM.ui.toast('Password changed. Other devices were signed out.', 'success');
      }).catch(function (err) {
        showError('afm-pw-error', (err && err.message) || 'Could not change your password.');
      }).then(function () {
        setBusy(submit, false);
      });
    });
  }

  function bindLogoutAll() {
    var button = document.getElementById('afm-logout-all');
    if (!button) return;

    var armed = false;
    var timer = null;

    button.addEventListener('click', function () {
      if (!armed) {
        armed = true;
        button.setAttribute('data-armed', 'true');
        button.textContent = 'Click again to sign out everywhere';
        timer = window.setTimeout(function () {
          armed = false;
          button.removeAttribute('data-armed');
          button.textContent = 'Sign out of all devices';
        }, 6000);
        return;
      }

      window.clearTimeout(timer);
      armed = false;
      button.removeAttribute('data-armed');
      button.disabled = true;
      button.textContent = 'Signing out…';

      AFM.auth.logoutAll().then(function () {
        AFM.ui.toast('All devices have been signed out.', 'success');
        AFM.ui.closePanel();
        AFM.ui.showTab('profile');
      }).catch(function (err) {
        AFM.ui.toast((err && err.message) || 'Could not sign out every device.', 'error');
        button.disabled = false;
        button.textContent = 'Sign out of all devices';
      });
    });
  }

  function bindPreferences() {
    var auto = document.getElementById('afm-pref-autopopup');
    if (auto) {
      auto.addEventListener('change', function () {
        try {
          if (auto.checked) {
            localStorage.removeItem('afm.autopopup.off');
          } else {
            localStorage.setItem('afm.autopopup.off', '1');
          }
        } catch (err) {
          /* storage disabled */
        }
        AFM.ui.toast(auto.checked ? 'Sign-in prompt enabled.' : 'Sign-in prompt disabled on this device.', 'success');
      });
    }

    var motion = document.getElementById('afm-pref-motion');
    if (motion) {
      motion.addEventListener('change', function () {
        try {
          if (motion.checked) {
            localStorage.setItem('afm.reduce.motion', '1');
          } else {
            localStorage.removeItem('afm.reduce.motion');
          }
        } catch (err) {
          /* storage disabled */
        }
        document.documentElement.classList.toggle('afm-reduce-motion', motion.checked);
        AFM.ui.toast(motion.checked ? 'Animations reduced.' : 'Animations restored.', 'success');
      });
    }
  }

  /* ====================================================================== */
  /*  Public API                                                            */
  /* ====================================================================== */

  AFM.profile = {
    init: function () {
      bindEditForm();
      bindPasswordForm();
      bindLogoutAll();
      bindPreferences();
      return AFM.profile;
    },

    render: function () {
      var user = AFM.auth.user;
      setVisible(user);
      paint(user);
      if (user && AFM.api.isConfigured()) refresh();
      return AFM.profile;
    },

    refresh: refresh,
    formatDate: formatDate,
    formatDateTime: formatDateTime,
    statusLabel: statusLabel,
    setVisible: setVisible,
    paint: paint,
    _state: state
  };
})(window, document);
