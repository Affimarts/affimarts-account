/**
 * ============================================================================
 * AFFIMARTS ACCOUNT — VALIDATION
 * ============================================================================
 * Shared, dependency-free validators. The backend repeats every check; this
 * layer exists for instant feedback only.
 * ============================================================================
 */
(function (window) {
  'use strict';

  var AFM = window.AFM = window.AFM || {};

  function result(ok, message) {
    return { ok: !!ok, message: ok ? '' : (message || 'Please check this field.') };
  }

  function text(value) {
    return String(value == null ? '' : value).replace(/^\s+|\s+$/g, '');
  }

  var COMMON = [
    'password', 'password1', 'password123', '12345678', '123456789',
    'qwerty123', 'iloveyou', 'admin123', 'letmein', 'welcome1',
    'affimarts', 'affimarts1', 'abc12345', '11111111'
  ];

  /**
   * Score 0–5 with a human label.
   * @param {string} value
   * @return {{score: number, percent: number, label: string, ok: boolean}}
   */
  function strength(value) {
    var v = String(value == null ? '' : value);
    var score = 0;

    if (v.length >= 8) score++;
    if (v.length >= 12) score++;
    if (/[a-z]/.test(v) && /[A-Z]/.test(v)) score++;
    if (/[0-9]/.test(v)) score++;
    if (/[^A-Za-z0-9]/.test(v)) score++;

    var labels = ['Too short', 'Weak', 'Fair', 'Good', 'Strong', 'Excellent'];
    var ok = v.length >= 8 && /[A-Za-z]/.test(v) && /[0-9]/.test(v) &&
      COMMON.indexOf(v.toLowerCase()) === -1;

    return {
      score: score,
      percent: Math.round((score / 5) * 100),
      label: labels[Math.min(score, 5)],
      ok: ok
    };
  }

  AFM.validate = {
    email: function (value) {
      var v = text(value).toLowerCase();
      if (!v) return result(false, 'Enter your email address.');
      if (v.length > 254) return result(false, 'That email address is too long.');
      if (v.indexOf('..') !== -1) return result(false, 'That email address is not valid.');
      var ok = /^[a-z0-9!#$%&'*+/=?^_`{|}~.-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i.test(v);
      return result(ok, 'Enter a valid email, for example name@example.com.');
    },

    name: function (value) {
      var v = text(value);
      if (v.length < 2) return result(false, 'Enter your full name.');
      if (v.length > 80) return result(false, 'That name is too long.');
      if (!/^[A-Za-z\u00C0-\u024F\u0900-\u097F.' -]+$/.test(v)) {
        return result(false, 'Use letters, spaces, apostrophes, dots and hyphens only.');
      }
      return result(true);
    },

    phone: function (value) {
      var v = text(value);
      if (!v) return result(true);
      var digits = v.replace(/[^0-9]/g, '');
      if (digits.length < 7 || digits.length > 15) {
        return result(false, 'Enter a valid mobile number.');
      }
      if (!/^[+(]?[0-9][0-9\s().-]{4,24}$/.test(v)) {
        return result(false, 'Enter a valid mobile number.');
      }
      return result(true);
    },

    dob: function (value) {
      var v = text(value);
      if (!v) return result(true);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return result(false, 'Use the YYYY-MM-DD format.');

      var parts = v.split('-');
      var date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
      if (isNaN(date.getTime()) ||
          date.getFullYear() !== Number(parts[0]) ||
          date.getMonth() !== Number(parts[1]) - 1 ||
          date.getDate() !== Number(parts[2])) {
        return result(false, 'Enter a real calendar date.');
      }

      var now = new Date();
      if (date.getTime() > now.getTime()) return result(false, 'Your date of birth cannot be in the future.');

      var age = (now.getTime() - date.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
      if (age < 13) return result(false, 'You must be at least 13 years old.');
      if (age > 120) return result(false, 'Please check your date of birth.');
      return result(true);
    },

    password: function (value, context) {
      context = context || {};
      var v = String(value == null ? '' : value);

      if (!v) return result(false, 'Choose a password.');
      if (v.length < 8) return result(false, 'Use at least 8 characters.');
      if (v.length > 128) return result(false, 'Use 128 characters or fewer.');
      if (!/[A-Za-z]/.test(v) || !/[0-9]/.test(v)) {
        return result(false, 'Include at least one letter and one number.');
      }
      if (/^\s|\s$/.test(v)) return result(false, 'Do not start or end with a space.');
      if (COMMON.indexOf(v.toLowerCase()) !== -1) {
        return result(false, 'That password is too common. Choose a stronger one.');
      }

      var email = text(context.email).toLowerCase();
      if (email) {
        var local = email.split('@')[0];
        if (local.length >= 3 && v.toLowerCase().indexOf(local) !== -1) {
          return result(false, 'Do not use your email address in your password.');
        }
      }

      var name = text(context.fullName).toLowerCase();
      if (name) {
        var parts = name.split(/\s+/).filter(function (part) { return part.length >= 4; });
        for (var i = 0; i < parts.length; i++) {
          if (v.toLowerCase().indexOf(parts[i]) !== -1) {
            return result(false, 'Do not use your name in your password.');
          }
        }
      }

      return result(true);
    },

    confirm: function (password, confirmation) {
      if (String(password) !== String(confirmation)) {
        return result(false, 'The two passwords do not match.');
      }
      return result(true);
    },

    url: function (value) {
      var v = text(value);
      if (!v) return result(false, 'Paste the product link.');
      if (!/^https?:\/\//i.test(v)) return result(false, 'Links must start with https://');
      try {
        var host = v.replace(/^https?:\/\//i, '').split('/')[0].split('?')[0].split('#')[0];
        host = host.replace(/^[^@]*@/, '').replace(/:\d+$/, '').toLowerCase();
        if (!host || host.indexOf('.') === -1) return result(false, 'That link is not valid.');
      } catch (err) {
        return result(false, 'That link is not valid.');
      }
      return result(true);
    },

    strength: strength
  };
})(window);
