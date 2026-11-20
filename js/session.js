/**
 * ============================================================================
 * AFFIMARTS ACCOUNT — SESSION + API TRANSPORT
 * ============================================================================
 * • Bearer token storage (sessionStorage by default, cookie for "Remember me")
 * • Device identifier used only as a server-side throttling bucket
 * • The single HTTP client used by every module
 *
 * Why not HttpOnly cookies?
 *   A Google Apps Script web app cannot emit Set-Cookie or CORS headers, so an
 *   HttpOnly cookie cannot be created by this backend. The alternative used
 *   here is a short-lived opaque bearer token that is validated server-side on
 *   every request. The token is never a password and never a client-side
 *   "logged in" flag. See DEPLOYMENT.md ("Security limitations").
 * ============================================================================
 */
(function (window, document) {
  'use strict';

  var AFM = window.AFM = window.AFM || {};

  /* ---------------------------------------------------------------------- */
  /*  Event bus                                                             */
  /* ---------------------------------------------------------------------- */

  var listeners = {};

  AFM.bus = {
    on: function (name, fn) {
      if (typeof fn !== 'function') return function () {};
      (listeners[name] = listeners[name] || []).push(fn);
      return function () {
        listeners[name] = (listeners[name] || []).filter(function (item) { return item !== fn; });
      };
    },
    emit: function (name, detail) {
      (listeners[name] || []).slice().forEach(function (fn) {
        try {
          fn(detail);
        } catch (err) {
          if (window.console && console.warn) console.warn('[AFM] listener failed', name, err);
        }
      });
    }
  };

  /* ---------------------------------------------------------------------- */
  /*  Safe storage                                                          */
  /* ---------------------------------------------------------------------- */

  function storageGet(store, key) {
    try {
      return window[store].getItem(key);
    } catch (err) {
      return null;
    }
  }

  function storageSet(store, key, value) {
    try {
      window[store].setItem(key, value);
      return true;
    } catch (err) {
      return false;
    }
  }

  function storageRemove(store, key) {
    try {
      window[store].removeItem(key);
    } catch (err) {
      /* ignore */
    }
  }

  /* ---------------------------------------------------------------------- */
  /*  Cookies (only used for the opt-in "Remember me" token)                 */
  /* ---------------------------------------------------------------------- */

  var COOKIE_NAME = 'afm_session';

  function cookieSet(name, value, maxAgeSeconds) {
    var parts = [
      name + '=' + encodeURIComponent(value),
      'Path=/',
      'SameSite=Lax',
      'Max-Age=' + Math.max(0, Math.floor(maxAgeSeconds))
    ];
    if (window.location.protocol === 'https:') parts.push('Secure');
    document.cookie = parts.join('; ');
  }

  function cookieGet(name) {
    var prefix = name + '=';
    var parts = String(document.cookie || '').split(';');
    for (var i = 0; i < parts.length; i++) {
      var part = parts[i].replace(/^\s+/, '');
      if (part.indexOf(prefix) === 0) {
        try {
          return decodeURIComponent(part.slice(prefix.length));
        } catch (err) {
          return '';
        }
      }
    }
    return '';
  }

  function cookieRemove(name) {
    document.cookie = name + '=; Path=/; SameSite=Lax; Max-Age=0' +
      (window.location.protocol === 'https:' ? '; Secure' : '');
  }

  /* ---------------------------------------------------------------------- */
  /*  Session state                                                         */
  /* ---------------------------------------------------------------------- */

  var TOKEN_KEY = 'afm.token';
  var USER_KEY = 'afm.user';
  var DEVICE_KEY = 'afm.device';

  function randomId() {
    try {
      if (window.crypto && window.crypto.getRandomValues) {
        var bytes = new Uint8Array(16);
        window.crypto.getRandomValues(bytes);
        var out = '';
        for (var i = 0; i < bytes.length; i++) {
          out += ('0' + bytes[i].toString(16)).slice(-2);
        }
        return out;
      }
    } catch (err) {
      /* fall through */
    }
    return String(Date.now()) + Math.random().toString(16).slice(2) + Math.random().toString(16).slice(2);
  }

  function deviceId() {
    var existing = storageGet('localStorage', DEVICE_KEY);
    if (existing && /^[A-Za-z0-9_-]{8,64}$/.test(existing)) return existing;
    var id = randomId().slice(0, 40);
    storageSet('localStorage', DEVICE_KEY, id);
    return id;
  }

  AFM.session = {
    /**
     * Current bearer token, or '' when signed out.
     * @return {string}
     */
    token: function () {
      var fromTab = storageGet('sessionStorage', TOKEN_KEY);
      if (fromTab) return fromTab;
      var fromCookie = cookieGet(COOKIE_NAME);
      return fromCookie || '';
    },

    /**
     * Persist a token. Remember-me tokens live in a Secure, SameSite=Lax
     * cookie; normal tokens live only for the tab session.
     * @param {string} token
     * @param {boolean} remember
     */
    setToken: function (token, remember) {
      if (!token) {
        AFM.session.clearToken();
        return;
      }
      if (remember) {
        cookieSet(COOKIE_NAME, token, 30 * 24 * 60 * 60);
        storageRemove('sessionStorage', TOKEN_KEY);
      } else {
        storageSet('sessionStorage', TOKEN_KEY, token);
        cookieRemove(COOKIE_NAME);
      }
    },

    clearToken: function () {
      storageRemove('sessionStorage', TOKEN_KEY);
      cookieRemove(COOKIE_NAME);
    },

    /**
     * Cached public profile for instant UI paint. Never contains secrets and
     * is always replaced by the server response after validation.
     * @return {Object|null}
     */
    cachedUser: function () {
      var raw = storageGet('sessionStorage', USER_KEY);
      if (!raw) return null;
      try {
        return JSON.parse(raw);
      } catch (err) {
        return null;
      }
    },

    setCachedUser: function (user) {
      if (!user) {
        storageRemove('sessionStorage', USER_KEY);
        return;
      }
      storageSet('sessionStorage', USER_KEY, JSON.stringify({
        userId: user.userId || '',
        fullName: user.fullName || '',
        initials: user.initials || '',
        email: user.email || '',
        emailVerified: !!user.emailVerified,
        accountStatus: user.accountStatus || 'active'
      }));
    },

    deviceId: deviceId,
    hasToken: function () {
      return !!AFM.session.token();
    }
  };

  /* ---------------------------------------------------------------------- */
  /*  API client                                                            */
  /* ---------------------------------------------------------------------- */

  function ApiError(code, message, data) {
    this.name = 'ApiError';
    this.code = code || 'REQUEST_FAILED';
    this.message = message || 'The request could not be completed.';
    this.data = data || {};
  }
  ApiError.prototype = Object.create(Error.prototype);
  ApiError.prototype.constructor = ApiError;

  function isConfigured() {
    var cfg = window.AFM_CONFIG || {};
    var url = String(cfg.API_URL || '').replace(/^\s+|\s+$/g, '');
    if (!url) return false;
    if (url.indexOf('PASTE_') === 0) return false;
    if (url.indexOf('YOUR_') !== -1) return false;
    return /^https:\/\/script\.google\.com\/macros\/s\/.+\/exec/.test(url) ||
      /^https:\/\/script\.google\.com\/macros\/s\/.+\/dev/.test(url) ||
      /^https:\/\//.test(url);
  }

  function buildBody(action, data) {
    return JSON.stringify({
      action: action,
      token: AFM.session.token(),
      data: data || {},
      meta: {
        deviceId: deviceId(),
        page: String(window.location.pathname || '').slice(0, 200),
        timezone: (function () {
          try {
            return Intl.DateTimeFormat().resolvedOptions().timeZone || '';
          } catch (err) {
            return '';
          }
        })()
      }
    });
  }

  function parseResponse(text, status) {
    var payload;
    try {
      payload = JSON.parse(text);
    } catch (err) {
      throw new ApiError(
        'BAD_RESPONSE',
        'The account service returned an unexpected response. Please try again.'
      );
    }

    if (!payload || typeof payload !== 'object') {
      throw new ApiError('BAD_RESPONSE', 'The account service returned an unexpected response.');
    }

    if (payload.success !== true) {
      throw new ApiError(
        payload.code || 'REQUEST_FAILED',
        payload.message || 'The request could not be completed.',
        payload.data || {}
      );
    }

    return payload;
  }

  /**
   * POST an action to the Apps Script backend.
   * @param {string} action
   * @param {Object=} data
   * @return {Promise<{success: boolean, code: string, message: string, data: Object}>}
   */
  function request(action, data) {
    if (!isConfigured()) {
      return Promise.reject(new ApiError(
        'NOT_CONFIGURED',
        'The account service is not connected yet. Add your Apps Script deployment URL in js/config.js.'
      ));
    }

    var cfg = window.AFM_CONFIG || {};
    var controller = null;
    var timer = null;
    var options = {
      method: 'POST',
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: buildBody(action, data)
    };

    if (typeof window.AbortController === 'function') {
      controller = new window.AbortController();
      options.signal = controller.signal;
      timer = window.setTimeout(function () {
        try { controller.abort(); } catch (err) { /* ignore */ }
      }, Number(cfg.REQUEST_TIMEOUT_MS) || 30000);
    }

    var started = Date.now();

    return window.fetch(cfg.API_URL, options)
      .then(function (response) {
        return response.text().then(function (text) {
          return { status: response.status, text: text };
        });
      })
      .then(function (result) {
        if (timer) window.clearTimeout(timer);
        var payload = parseResponse(result.text, result.status);
        if (cfg.DEBUG && window.console) {
          console.log('[AFM]', action, result.status, (Date.now() - started) + 'ms');
        }
        return payload;
      })
      .catch(function (err) {
        if (timer) window.clearTimeout(timer);

        if (err && err.name === 'AbortError') {
          throw new ApiError('TIMEOUT', 'The account service took too long to respond. Please try again.');
        }
        if (err instanceof ApiError) {
          if (err.code === 'SESSION_INVALID' || err.code === 'SESSION_EXPIRED' ||
              err.code === 'SESSION_REQUIRED' || err.code === 'ACCOUNT_DISABLED') {
            AFM.session.clearToken();
            AFM.session.setCachedUser(null);
            AFM.bus.emit('session:expired', err);
          }
          throw err;
        }

        if (window.console && console.warn) console.warn('[AFM] network error', err);
        throw new ApiError(
          'NETWORK',
          'We could not reach the Affimarts account service. Check your connection and try again.'
        );
      });
  }

  AFM.api = {
    request: request,
    isConfigured: isConfigured,
    ApiError: ApiError
  };
})(window, document);
