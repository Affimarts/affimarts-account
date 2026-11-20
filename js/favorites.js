/**
 * ============================================================================
 * AFFIMARTS ACCOUNT — FAVORITES
 * ============================================================================
 * Saved products/articles, backed by the Favorites sheet. The signed-in user
 * is resolved server-side from the session token.
 * ============================================================================
 */
(function (window, document) {
  'use strict';

  var AFM = window.AFM = window.AFM || {};

  var state = {
    items: [],
    loaded: false,
    loading: false
  };

  function $(selector, root) {
    return (root || document).querySelector(selector);
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

  function initials(title) {
    var clean = String(title || 'A').replace(/^[^A-Za-z0-9]+/, '');
    return (clean.charAt(0) || 'A').toUpperCase();
  }

  function createCard(item) {
    var card = document.createElement('article');
    card.className = 'afm-fav';
    card.setAttribute('data-favorite-id', item.favoriteId);

    var link = document.createElement('a');
    link.className = 'afm-fav__media';
    link.href = item.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.setAttribute('aria-label', 'View ' + item.title);

    var glyph = document.createElement('span');
    glyph.className = 'afm-fav__glyph';
    glyph.setAttribute('aria-hidden', 'true');
    glyph.textContent = initials(item.title);
    link.appendChild(glyph);

    if (item.image) {
      var img = document.createElement('img');
      img.src = item.image;
      img.alt = '';
      img.loading = 'lazy';
      img.decoding = 'async';
      img.addEventListener('error', function () {
        img.remove();
      });
      link.appendChild(img);
    }

    var body = document.createElement('div');
    body.className = 'afm-fav__body';

    var title = document.createElement('h3');
    title.className = 'afm-fav__title';
    title.textContent = item.title;

    var meta = document.createElement('p');
    meta.className = 'afm-fav__meta';
    meta.textContent = item.addedAt
      ? 'Saved ' + AFM.profile.formatDate(item.addedAt)
      : 'Saved to your collection';

    var actions = document.createElement('div');
    actions.className = 'afm-fav__actions';

    var view = document.createElement('a');
    view.className = 'afm-btn afm-btn--small afm-btn--ghost';
    view.href = item.url;
    view.target = '_blank';
    view.rel = 'noopener noreferrer';
    view.textContent = 'View product';

    var remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'afm-btn afm-btn--small afm-btn--quiet';
    remove.setAttribute('data-afm-remove', item.favoriteId);
    remove.textContent = 'Remove';

    actions.appendChild(view);
    actions.appendChild(remove);
    body.appendChild(title);
    body.appendChild(meta);
    body.appendChild(actions);

    card.appendChild(link);
    card.appendChild(body);
    return card;
  }

  function render() {
    var list = document.getElementById('afm-favorites-list');
    var empty = document.getElementById('afm-favorites-empty');
    var count = document.querySelector('[data-afm-favorites-count]');
    if (!list) return;

    list.textContent = '';

    if (!state.items.length) {
      if (empty) empty.hidden = false;
      list.hidden = true;
    } else {
      if (empty) empty.hidden = true;
      list.hidden = false;
      state.items.forEach(function (item) {
        list.appendChild(createCard(item));
      });
    }

    if (count) count.textContent = String(state.items.length);

    if (AFM.ui && AFM.ui.refreshHeader) {
      try { AFM.ui.refreshHeader(); } catch (err) { /* ignore */ }
    }
  }

  function load(force) {
    if (!AFM.auth.user) {
      state.items = [];
      state.loaded = false;
      render();
      return Promise.resolve([]);
    }
    if (state.loading) return Promise.resolve(state.items);
    if (state.loaded && !force) {
      render();
      return Promise.resolve(state.items);
    }
    if (!AFM.api.isConfigured()) {
      render();
      return Promise.resolve([]);
    }

    state.loading = true;
    var loading = document.getElementById('afm-favorites-loading');
    if (loading) loading.hidden = false;

    return AFM.api.request('getFavorites').then(function (res) {
      var data = res.data || {};
      state.items = Array.isArray(data.favorites) ? data.favorites : [];
      state.loaded = true;
      if (AFM.profile._state) AFM.profile._state.stats.favorites = state.items.length;
      render();
      return state.items;
    }).catch(function (err) {
      if (err && err.code !== 'SESSION_INVALID' && err.code !== 'SESSION_EXPIRED') {
        AFM.ui.toast((err && err.message) || 'Could not load your favourites.', 'error');
      }
      return state.items;
    }).then(function (items) {
      state.loading = false;
      if (loading) loading.hidden = true;
      return items;
    });
  }

  /**
   * @param {{title: string, url: string, image: string=}} item
   * @return {Promise<Object>}
   */
  function add(item) {
    if (!AFM.auth.user) {
      AFM.ui.openPanel({ view: 'login' });
      AFM.ui.toast('Sign in to save favourites.', 'info');
      return Promise.reject(new AFM.api.ApiError('SESSION_REQUIRED', 'Sign in to save favourites.'));
    }

    return AFM.api.request('addFavorite', {
      title: item.title,
      url: item.url,
      image: item.image || ''
    }).then(function (res) {
      var data = res.data || {};
      state.loaded = false;
      AFM.ui.toast(
        data.duplicate ? 'Already in your favourites.' : 'Saved to your favourites.',
        data.duplicate ? 'info' : 'success'
      );
      return load(true).then(function () { return data; });
    });
  }

  /**
   * @param {string} favoriteId
   * @return {Promise<Object>}
   */
  function remove(favoriteId) {
    return AFM.api.request('removeFavorite', { favoriteId: favoriteId }).then(function (res) {
      state.items = state.items.filter(function (item) {
        return item.favoriteId !== favoriteId;
      });
      if (AFM.profile._state) AFM.profile._state.stats.favorites = state.items.length;
      render();
      AFM.ui.toast('Removed from your favourites.', 'success');
      return res.data || {};
    }).catch(function (err) {
      AFM.ui.toast((err && err.message) || 'Could not remove that favourite.', 'error');
      throw err;
    });
  }

  /* ====================================================================== */
  /*  Wiring                                                                */
  /* ====================================================================== */

  function bindList() {
    var list = document.getElementById('afm-favorites-list');
    if (!list) return;

    list.addEventListener('click', function (event) {
      var button = event.target.closest ? event.target.closest('[data-afm-remove]') : null;
      if (!button) return;
      var id = button.getAttribute('data-afm-remove');
      if (!id) return;
      button.disabled = true;
      remove(id).catch(function () {
        button.disabled = false;
      });
    });
  }

  function bindForm() {
    var form = document.getElementById('afm-favorite-form');
    if (!form) return;

    var title = document.getElementById('afm-fav-title');
    var url = document.getElementById('afm-fav-url');
    var image = document.getElementById('afm-fav-image');

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      showError('afm-fav-error', '');

      var titleCheck = title && title.value.trim()
        ? { ok: true }
        : { ok: false, message: 'Add a product title.' };
      var urlCheck = AFM.validate.url(url ? url.value : '');

      if (!titleCheck.ok) {
        title.focus();
        showError('afm-fav-error', titleCheck.message);
        return;
      }
      if (!urlCheck.ok) {
        if (url) url.focus();
        showError('afm-fav-error', urlCheck.message);
        return;
      }
      if (image && image.value && !/^https:\/\//i.test(image.value.trim())) {
        image.focus();
        showError('afm-fav-error', 'Image links must start with https://');
        return;
      }

      var submit = document.getElementById('afm-fav-submit');
      setBusy(submit, true, 'Saving…');

      add({
        title: title.value,
        url: url.value,
        image: image ? image.value : ''
      }).then(function () {
        form.reset();
      }).catch(function (err) {
        showError('afm-fav-error', (err && err.message) || 'Could not save that favourite.');
      }).then(function () {
        setBusy(submit, false);
      });
    });
  }

  /**
   * Wire any element with data-afm-save on the page (product cards, article
   * footers, etc.). Attributes:
   *   data-afm-title  required
   *   data-afm-url    required
   *   data-afm-image  optional
   * @param {Element|Document=} root
   */
  function bindSaveButtons(root) {
    var scope = root || document;
    Array.prototype.slice.call(scope.querySelectorAll('[data-afm-save]')).forEach(function (button) {
      if (button.getAttribute('data-afm-bound') === '1') return;
      button.setAttribute('data-afm-bound', '1');

      button.addEventListener('click', function (event) {
        event.preventDefault();
        var title = button.getAttribute('data-afm-title') || '';
        var url = button.getAttribute('data-afm-url') || '';
        var image = button.getAttribute('data-afm-image') || '';

        if (!title || !url) return;

        button.disabled = true;
        add({ title: title, url: url, image: image }).then(function () {
          button.classList.add('is-saved');
          var label = button.querySelector('[data-afm-save-label]');
          if (label) label.textContent = 'Saved';
        }).catch(function () {
          /* toast already shown */
        }).then(function () {
          button.disabled = false;
        });
      });
    });
  }

  AFM.favorites = {
    init: function () {
      bindList();
      bindForm();
      bindSaveButtons(document);
      return AFM.favorites;
    },
    load: load,
    render: render,
    add: add,
    remove: remove,
    bindSaveButtons: bindSaveButtons,
    get items() { return state.items.slice(); }
  };
})(window, document);
