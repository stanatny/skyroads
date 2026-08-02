'use strict';

(function attachPresentation(root) {
  function finiteDimension(value) {
    const dimension = Number(value);
    return Number.isFinite(dimension) && dimension > 0 ? dimension : 0;
  }

  const NORMAL_CANVAS_MOTION_POLICY = Object.freeze({
    decorativeMotion: true,
    warningPulse: true,
    shakeScale: 1,
    deathFlashScale: 1,
    deathParticleCount: 48,
    deathShockwave: true,
  });
  const REDUCED_CANVAS_MOTION_POLICY = Object.freeze({
    decorativeMotion: false,
    warningPulse: false,
    shakeScale: 0,
    deathFlashScale: 0.15,
    deathParticleCount: 12,
    deathShockwave: false,
  });

  function canvasMotionPolicy(reducedMotion) {
    return reducedMotion ? REDUCED_CANVAS_MOTION_POLICY : NORMAL_CANVAS_MOTION_POLICY;
  }

  function computeShipDrawRect(viewportWidth, viewportHeight, aspectRatio = 1) {
    const width = Math.min(finiteDimension(viewportWidth) * 0.0875, finiteDimension(viewportHeight) * 0.14);
    const safeAspectRatio = Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : 1;
    const height = width / safeAspectRatio;
    return {
      x: (finiteDimension(viewportWidth) - width) / 2,
      y: finiteDimension(viewportHeight) - height,
      width,
      height,
    };
  }

  function fallbackShipLayout(viewportWidth, viewportHeight, centerX, centerY) {
    const drawRect = computeShipDrawRect(viewportWidth, viewportHeight, 2.4);
    return {
      centerX: Number(centerX) || 0,
      centerY: Number(centerY) || 0,
      width: drawRect.width,
      height: drawRect.height,
      halfWidth: drawRect.width / 2,
    };
  }

  const VISUAL_ASSET_MANIFEST = Object.freeze({
    ship: Object.freeze({
      neutral: './assets/ship/player-neutral.png',
      thrust: './assets/ship/player-thrust.png',
    }),
    ui: Object.freeze({
      panel: './assets/ui/panel-frame-cyan.png',
      button: './assets/ui/button-frame-gold.png',
      meter: './assets/ui/meter-frame-cyan.png',
    }),
    icons: Object.freeze({
      translate: './assets/icons/translate.svg',
      speakerHigh: './assets/icons/speaker-high.svg',
      speakerSlash: './assets/icons/speaker-slash.svg',
      trophy: './assets/icons/trophy.svg',
      pencilSimple: './assets/icons/pencil-simple.svg',
      restart: './assets/icons/arrow-counter-clockwise.svg',
    }),
    font: Object.freeze({
      orbitron: './assets/fonts/Orbitron-Medium.ttf',
    }),
  });

  function freezeAssetGroup(group) {
    return Object.freeze(Object.fromEntries(Object.entries(group).map(([key, value]) => [
      key,
      Object.freeze({ path: value.path, loaded: Boolean(value.loaded), element: value.element || null }),
    ])));
  }

  async function preloadVisualAssets({
    timeoutMs = 5000,
    ImageCtor = root.Image,
    FontFaceCtor = root.FontFace,
    fontSet = root.document && root.document.fonts,
    setTimeoutFn = root.setTimeout,
    clearTimeoutFn = root.clearTimeout,
  } = {}) {
    const states = { ship: {}, ui: {}, icons: {}, font: {} };
    const pending = [];
    const imageTasks = [];

    function queueImage(groupName, key, assetPath) {
      const state = { path: assetPath, loaded: false, element: null };
      states[groupName][key] = state;
      if (typeof ImageCtor !== 'function') return;
      let image = null;
      try { image = new ImageCtor(); } catch (_) { return; }
      state.element = image;
      pending.push(new Promise((resolve) => {
        let settled = false;
        const finish = (loaded) => {
          if (settled) return;
          settled = true;
          image.onload = null;
          image.onerror = null;
          state.loaded = loaded;
          resolve();
        };
        imageTasks.push({ finish });
        image.onload = () => finish(true);
        image.onerror = () => finish(false);
        try {
          image.decoding = 'async';
          image.src = assetPath;
        } catch (_) {
          finish(false);
        }
      }));
    }

    for (const [key, assetPath] of Object.entries(VISUAL_ASSET_MANIFEST.ship)) queueImage('ship', key, assetPath);
    for (const [key, assetPath] of Object.entries(VISUAL_ASSET_MANIFEST.ui)) queueImage('ui', key, assetPath);
    for (const [key, assetPath] of Object.entries(VISUAL_ASSET_MANIFEST.icons)) queueImage('icons', key, assetPath);

    const fontPath = VISUAL_ASSET_MANIFEST.font.orbitron;
    const fontState = { path: fontPath, loaded: false, element: null };
    states.font.orbitron = fontState;
    if (typeof FontFaceCtor === 'function' && fontSet && typeof fontSet.add === 'function') {
      pending.push((async () => {
        try {
          const face = new FontFaceCtor('Orbitron', `url("${fontPath}") format("truetype")`, { weight: '500' });
          const loadedFace = await face.load();
          fontSet.add(loadedFace);
          fontState.element = loadedFace;
          fontState.loaded = true;
        } catch (_) {
          fontState.loaded = false;
        }
      })());
    }

    let timedOut = false;
    let timer = null;
    const allSettled = Promise.all(pending);
    if (pending.length > 0 && typeof setTimeoutFn === 'function') {
      const timeout = Math.max(0, Number(timeoutMs) || 0);
      await Promise.race([
        allSettled,
        new Promise((resolve) => {
          timer = setTimeoutFn(() => { timedOut = true; resolve(); }, timeout);
        }),
      ]);
      if (timer !== null && typeof clearTimeoutFn === 'function') clearTimeoutFn(timer);
      if (timedOut) imageTasks.forEach(({ finish }) => finish(false));
    } else {
      await allSettled;
    }

    const assets = Object.freeze({
      ship: freezeAssetGroup(states.ship),
      ui: freezeAssetGroup(states.ui),
      icons: freezeAssetGroup(states.icons),
      font: freezeAssetGroup(states.font),
    });
    const entries = Object.values(assets).flatMap((group) => Object.values(group));
    const loadedCount = entries.filter((entry) => entry.loaded).length;
    const shipFramesReady = assets.ship.neutral.loaded && assets.ship.thrust.loaded;
    return Object.freeze({
      assets,
      shipFramesReady,
      fallbackRequired: !shipFramesReady,
      timedOut,
      loadedCount,
      failedCount: entries.length - loadedCount,
    });
  }

  function resolvePlayerShipFrame(visualAssets, energized = false) {
    if (!visualAssets || !visualAssets.shipFramesReady || !visualAssets.assets || !visualAssets.assets.ship) return null;
    const frames = visualAssets.assets.ship;
    if (!frames.neutral || !frames.thrust || !frames.neutral.loaded || !frames.thrust.loaded) return null;
    const frame = energized ? frames.thrust : frames.neutral;
    return frame.element || null;
  }

  function playerVisualLayerPlan(visualAssets, {
    energized = false,
    chargeActive = false,
    boostActive = false,
    superActive = false,
  } = {}) {
    const shipFrame = resolvePlayerShipFrame(visualAssets, energized);
    const layers = [shipFrame ? 'ship-image' : 'procedural-ship'];
    if (superActive) layers.push('super-surface');
    if (chargeActive) layers.push('charge');
    if (boostActive) layers.push('boost-aura');
    if (superActive) layers.push('super-aura');
    return Object.freeze({ shipFrame, layers: Object.freeze(layers) });
  }

  function computeHudLayout(viewportWidth, viewportHeight) {
    const width = finiteDimension(viewportWidth);
    const utilityBottom = 60;
    const rightTop = utilityBottom + 20;
    const lineHeight = 20;
    const lineCount = 6;
    return {
      utilityBottom,
      rightX: Math.max(16, width - 16),
      rightTop,
      rightBottom: rightTop + lineHeight * (lineCount - 1),
      lineHeight,
    };
  }

  function canvasMetrics(cssWidth, cssHeight, devicePixelRatio = 1) {
    const width = finiteDimension(cssWidth);
    const height = finiteDimension(cssHeight);
    const ratio = Number(devicePixelRatio);
    const dpr = Math.max(1, Math.min(2, Number.isFinite(ratio) && ratio > 0 ? ratio : 1));
    return {
      cssWidth: width,
      cssHeight: height,
      pixelWidth: Math.round(width * dpr),
      pixelHeight: Math.round(height * dpr),
      dpr,
    };
  }

  function overlayForMode(mode) {
    switch (mode) {
      case 'MENU': return { title: true, gameOver: false };
      case 'PLAYING': return { title: false, gameOver: false };
      case 'GAMEOVER': return { title: false, gameOver: true };
      default: throw new RangeError(`Unsupported game mode: ${mode}`);
    }
  }

  function setOverlayMode(elements, mode) {
    const overlay = overlayForMode(mode);
    if (elements && elements.titleScreen) elements.titleScreen.hidden = !overlay.title;
    if (elements && elements.gameOverScreen) elements.gameOverScreen.hidden = !overlay.gameOver;
    return overlay;
  }

  function focusPrimaryForMode(elements, mode) {
    if (!elements) return null;
    let target = null;
    if (mode === 'PLAYING') {
      target = elements.canvas || null;
      if (target) target.tabIndex = -1;
    } else if (mode === 'MENU') target = elements.startButton || null;
    else if (mode === 'GAMEOVER') target = elements.restartButton || null;
    else overlayForMode(mode);
    if (target && typeof target.focus === 'function') {
      try { target.focus({ preventScroll: true }); } catch (_) { target.focus(); }
    }
    return target;
  }

  function focusableElements(dialog) {
    if (!dialog || typeof dialog.querySelectorAll !== 'function') return [];
    return Array.from(dialog.querySelectorAll('a[href], button, input, select, textarea, [tabindex]'))
      .filter((element) => !element.disabled
        && !element.hidden
        && element.tabIndex !== -1
        && (!element.getAttribute || element.getAttribute('aria-hidden') !== 'true'));
  }

  function trapDialogTab(dialog, event, activeElement) {
    if (!event || event.key !== 'Tab') return false;
    const focusable = focusableElements(dialog);
    if (focusable.length === 0) {
      if (typeof event.preventDefault === 'function') event.preventDefault();
      return true;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const backwards = Boolean(event.shiftKey);
    const outside = !focusable.includes(activeElement);
    if (outside || (!backwards && activeElement === last) || (backwards && activeElement === first)) {
      if (typeof event.preventDefault === 'function') event.preventDefault();
      (backwards ? last : first).focus();
    }
    return true;
  }

  function finalizeRunOnce(runState, leaderboard) {
    if (!runState || !leaderboard || typeof leaderboard.finalizeRun !== 'function') {
      throw new TypeError('Run state and leaderboard are required');
    }
    if (runState.finalResult) return runState.finalResult;
    const result = leaderboard.finalizeRun({
      id: runState.runId,
      distanceMeters: runState.distanceMeters,
      enemyKills: runState.enemyKills,
      elapsedMs: runState.elapsedMs,
    });
    runState.score = result.score;
    runState.finalResult = result;
    return result;
  }

  function bindOverlayActions({ documentObject = root.document, elements = {}, actions = {} } = {}) {
    let activeDialogFrame = null;
    let backgroundState = null;
    const dialogStack = [];
    const cleanup = [];
    const backgroundElements = [
      elements.canvas,
      elements.utilityControls,
      elements.titleScreen,
      elements.gameOverScreen,
      elements.persistenceWarning,
    ].filter(Boolean);

    function setBackgroundBlocked(blocked) {
      if (blocked) {
        if (!backgroundState) {
          backgroundState = new Map(backgroundElements.map((element) => [element, {
            inert: Boolean(element.inert),
            hadAriaHidden: Boolean(element.getAttribute && element.getAttribute('aria-hidden') !== null),
            ariaHidden: element.getAttribute ? element.getAttribute('aria-hidden') : null,
          }]));
        }
        backgroundElements.forEach((element) => {
          element.inert = true;
          if (element.setAttribute) element.setAttribute('aria-hidden', 'true');
        });
        return;
      }
      if (!backgroundState) return;
      backgroundElements.forEach((element) => {
        const prior = backgroundState.get(element);
        if (!prior) return;
        element.inert = prior.inert;
        if (prior.hadAriaHidden && element.setAttribute) element.setAttribute('aria-hidden', prior.ariaHidden);
        else if (element.removeAttribute) element.removeAttribute('aria-hidden');
      });
      backgroundState = null;
    }

    function listen(target, type, listener) {
      if (!target || typeof target.addEventListener !== 'function') return;
      target.addEventListener(type, listener);
      cleanup.push(() => {
        if (typeof target.removeEventListener === 'function') target.removeEventListener(type, listener);
      });
    }

    function hideDialog(dialog) {
      dialog.hidden = true;
      if (dialog.setAttribute) dialog.setAttribute('aria-hidden', 'true');
    }

    function showDialog(dialog) {
      dialog.hidden = false;
      if (dialog.setAttribute) dialog.setAttribute('aria-hidden', 'false');
    }

    function closeDialog(dialog = activeDialogFrame && activeDialogFrame.dialog, { restoreFocus = true } = {}) {
      if (!dialog) return false;
      if (!activeDialogFrame || dialog !== activeDialogFrame.dialog) {
        hideDialog(dialog);
        return true;
      }
      const closingFrame = activeDialogFrame;
      hideDialog(dialog);
      if (!restoreFocus) {
        dialogStack.splice(0).forEach((frame) => hideDialog(frame.dialog));
        activeDialogFrame = null;
        setBackgroundBlocked(false);
        return true;
      }
      if (dialogStack.length > 0) {
        activeDialogFrame = dialogStack.pop();
        showDialog(activeDialogFrame.dialog);
        if (closingFrame.opener && typeof closingFrame.opener.focus === 'function') closingFrame.opener.focus();
        return true;
      }
      activeDialogFrame = null;
      setBackgroundBlocked(false);
      if (closingFrame.opener && typeof closingFrame.opener.focus === 'function') closingFrame.opener.focus();
      return true;
    }

    function openDialog(dialog, opener) {
      if (!dialog) return false;
      if (activeDialogFrame && activeDialogFrame.dialog === dialog) return true;
      if (activeDialogFrame) {
        hideDialog(activeDialogFrame.dialog);
        dialogStack.push(activeDialogFrame);
      }
      activeDialogFrame = {
        dialog,
        opener: opener || (documentObject && documentObject.activeElement) || null,
      };
      showDialog(dialog);
      setBackgroundBlocked(true);
      const focusable = focusableElements(dialog);
      if (focusable[0] && typeof focusable[0].focus === 'function') focusable[0].focus();
      else if (typeof dialog.focus === 'function') dialog.focus();
      return true;
    }

    function onKeyDown(event) {
      if (!activeDialogFrame) return;
      if (event.key === 'Escape') {
        if (typeof event.preventDefault === 'function') event.preventDefault();
        closeDialog();
        return;
      }
      trapDialogTab(activeDialogFrame.dialog, event, documentObject && documentObject.activeElement);
    }

    listen(documentObject, 'keydown', onKeyDown);
    listen(elements.startButton, 'click', () => { if (actions.start) actions.start(); });
    listen(elements.restartButton, 'click', () => { if (actions.start) actions.start(); });
    listen(elements.menuButton, 'click', () => { if (actions.menu) actions.menu(); });
    function runUtilityAction(action) {
      if (action) action();
      if (!activeDialogFrame && actions.getMode && actions.getMode() === 'PLAYING') {
        focusPrimaryForMode(elements, 'PLAYING');
      }
    }
    listen(elements.languageButton, 'click', () => runUtilityAction(actions.language));
    listen(elements.musicButton, 'click', () => runUtilityAction(actions.music));
    listen(elements.sfxButton, 'click', () => runUtilityAction(actions.sfx));

    function showLeaderboard(event) {
      if (actions.beforeLeaderboard) actions.beforeLeaderboard();
      openDialog(elements.leaderboardDialog, event && event.target);
    }
    listen(elements.titleLeaderboardButton, 'click', showLeaderboard);
    listen(elements.gameOverLeaderboardButton, 'click', showLeaderboard);
    listen(elements.leaderboardCloseButton, 'click', () => closeDialog(elements.leaderboardDialog));

    let renameComposing = false;
    function showRename(event) {
      renameComposing = false;
      if (elements.renameInput) {
        elements.renameInput.value = actions.getPlayerName ? actions.getPlayerName() : elements.renameInput.value;
      }
      openDialog(elements.renameDialog, event && event.target);
      if (actions.nameInput) actions.nameInput(elements.renameInput ? elements.renameInput.value : '');
    }
    listen(elements.leaderboardRenameButton, 'click', showRename);
    listen(elements.gameOverRenameButton, 'click', showRename);
    listen(elements.renameCancelButton, 'click', () => closeDialog(elements.renameDialog));
    function processRenameInput() {
      if (!elements.renameInput) return '';
      const leaderboard = root.Skyroads && root.Skyroads.leaderboard;
      const originalValue = elements.renameInput.value;
      const value = leaderboard && typeof leaderboard.sanitizeNameInput === 'function'
        ? leaderboard.sanitizeNameInput(originalValue, { trim: false })
        : originalValue;
      if (value !== originalValue) {
        const selectionStart = Number.isInteger(elements.renameInput.selectionStart)
          ? elements.renameInput.selectionStart
          : originalValue.length;
        const selectionEnd = Number.isInteger(elements.renameInput.selectionEnd)
          ? elements.renameInput.selectionEnd
          : selectionStart;
        const sanitizePrefix = (end) => (leaderboard && typeof leaderboard.sanitizeNameInput === 'function'
          ? leaderboard.sanitizeNameInput(originalValue.slice(0, end), { trim: false }).length
          : Math.min(end, value.length));
        const nextStart = Math.min(value.length, sanitizePrefix(selectionStart));
        const nextEnd = Math.min(value.length, sanitizePrefix(selectionEnd));
        elements.renameInput.value = value;
        try {
          if (typeof elements.renameInput.setSelectionRange === 'function') {
            elements.renameInput.setSelectionRange(nextStart, nextEnd);
          } else {
            elements.renameInput.selectionStart = nextStart;
            elements.renameInput.selectionEnd = nextEnd;
          }
        } catch (_) {
          // Some non-text input implementations do not expose a writable selection.
        }
      }
      if (actions.nameInput) actions.nameInput(value);
      return value;
    }
    listen(elements.renameInput, 'compositionstart', () => { renameComposing = true; });
    listen(elements.renameInput, 'compositionend', () => {
      renameComposing = false;
      processRenameInput();
    });
    listen(elements.renameInput, 'input', (event) => {
      if (renameComposing || (event && event.isComposing)) return;
      processRenameInput();
    });
    listen(elements.renameForm, 'submit', (event) => {
      if (event && typeof event.preventDefault === 'function') event.preventDefault();
      let value = elements.renameInput ? elements.renameInput.value : '';
      const leaderboard = root.Skyroads && root.Skyroads.leaderboard;
      if (leaderboard && typeof leaderboard.sanitizeNameInput === 'function') {
        value = leaderboard.sanitizeNameInput(value);
        if (elements.renameInput) elements.renameInput.value = value;
      }
      if (actions.rename) actions.rename(value);
      closeDialog(elements.renameDialog);
    });

    return Object.freeze({
      openDialog,
      closeDialog,
      getOpenDialog() { return activeDialogFrame && activeDialogFrame.dialog; },
      destroy() {
        cleanup.splice(0).forEach((remove) => remove());
        activeDialogFrame = null;
        dialogStack.splice(0);
        setBackgroundBlocked(false);
      },
      elements,
    });
  }

  function formatElapsedMs(translator, elapsedMs) {
    const seconds = Math.max(0, Number(elapsedMs) || 0) / 1000;
    return translator.formatNumber(seconds, {
      style: 'unit',
      unit: 'second',
      unitDisplay: 'short',
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    });
  }

  function renderRankingRows(tbody, entries, { documentObject = root.document, translator, newestId = null } = {}) {
    if (!tbody || !documentObject || !translator) return;
    const rows = [];
    (Array.isArray(entries) ? entries : []).forEach((entry, index) => {
      const row = documentObject.createElement('tr');
      const isNewest = entry.id === newestId;
      if (row.setAttribute) row.setAttribute('data-newest', isNewest ? 'true' : 'false');
      const values = [
        `#${index + 1}${isNewest ? ` ${translator.t('leaderboard.newest')}` : ''}`,
        entry.name,
        translator.formatNumber(entry.score),
        translator.formatNumber(Math.floor(entry.distanceMeters)),
        formatElapsedMs(translator, entry.elapsedMs),
        translator.formatDate(new Date(entry.createdAt), { year: 'numeric', month: '2-digit', day: '2-digit' }),
      ];
      values.forEach((value) => {
        const cell = documentObject.createElement('td');
        cell.textContent = String(value);
        row.append(cell);
      });
      rows.push(row);
    });
    tbody.replaceChildren(...rows);
  }

  function makeElement(documentObject, tagName, { id, className, type } = {}) {
    const element = documentObject.createElement(tagName);
    if (id) element.id = id;
    if (className) element.className = className;
    if (type) element.type = type;
    return element;
  }

  function makeButton(documentObject, id, className) {
    return makeElement(documentObject, 'button', { id, className, type: 'button' });
  }

  function createCommandCenter({ documentObject = root.document, elements } = {}) {
    if (!documentObject || !elements) throw new TypeError('A document and fixed command-center elements are required');
    const languageButton = makeButton(documentObject, 'language-toggle', 'utility-button');
    const musicButton = makeButton(documentObject, 'music-toggle', 'utility-button audio-utility-button');
    const sfxButton = makeButton(documentObject, 'sfx-toggle', 'utility-button audio-utility-button');
    elements.utilityControls.replaceChildren(languageButton, musicButton, sfxButton);

    const titleKicker = makeElement(documentObject, 'p', { className: 'panel-kicker' });
    const titleHeading = makeElement(documentObject, 'h1');
    const profileName = makeElement(documentObject, 'p', { className: 'pilot-name' });
    const legacyBest = makeElement(documentObject, 'p', { className: 'legacy-best' });
    legacyBest.hidden = true;
    const startButton = makeButton(documentObject, 'start-mission', 'primary-action');
    const titleLeaderboardButton = makeButton(documentObject, 'open-leaderboard', 'secondary-action');
    const titleActions = makeElement(documentObject, 'div', { className: 'panel-actions' });
    titleActions.append(startButton, titleLeaderboardButton);
    const controlList = makeElement(documentObject, 'ul', { className: 'control-list' });
    const controlItems = Array.from({ length: 4 }, () => makeElement(documentObject, 'li'));
    controlList.append(...controlItems);
    elements.titleScreen.replaceChildren(titleKicker, titleHeading, profileName, legacyBest, titleActions, controlList);

    const gameOverHeading = makeElement(documentObject, 'h2');
    const deathReason = makeElement(documentObject, 'p', { className: 'death-reason' });
    const resultScore = makeElement(documentObject, 'p', { className: 'result-primary' });
    const resultDistance = makeElement(documentObject, 'p');
    const resultElapsed = makeElement(documentObject, 'p');
    const resultRank = makeElement(documentObject, 'p', { className: 'result-rank' });
    const resultNewBest = makeElement(documentObject, 'p', { className: 'new-best' });
    resultNewBest.hidden = true;
    const restartButton = makeButton(documentObject, 'restart-mission', 'primary-action');
    const menuButton = makeButton(documentObject, 'return-menu', 'secondary-action');
    const gameOverLeaderboardButton = makeButton(documentObject, 'game-over-leaderboard', 'secondary-action');
    const gameOverRenameButton = makeButton(documentObject, 'game-over-rename', 'secondary-action');
    const gameOverActions = makeElement(documentObject, 'div', { className: 'panel-actions wrap-actions' });
    gameOverActions.append(restartButton, menuButton, gameOverLeaderboardButton, gameOverRenameButton);
    elements.gameOverScreen.replaceChildren(
      gameOverHeading, deathReason, resultScore, resultDistance, resultElapsed,
      resultRank, resultNewBest, gameOverActions,
    );

    const leaderboardHeading = makeElement(documentObject, 'h2', { id: 'leaderboard-heading' });
    elements.leaderboardDialog.setAttribute('aria-labelledby', 'leaderboard-heading');
    elements.leaderboardDialog.setAttribute('tabindex', '-1');
    const leaderboardCutoff = makeElement(documentObject, 'p', { className: 'leaderboard-cutoff' });
    leaderboardCutoff.hidden = true;
    const leaderboardEmpty = makeElement(documentObject, 'p', { className: 'empty-state' });
    const leaderboardTableWrap = makeElement(documentObject, 'div', { className: 'ranking-scroll' });
    const leaderboardTable = makeElement(documentObject, 'table');
    const leaderboardHead = makeElement(documentObject, 'thead');
    const headingRow = makeElement(documentObject, 'tr');
    const leaderboardHeaders = Array.from({ length: 6 }, () => {
      const heading = makeElement(documentObject, 'th');
      heading.setAttribute('scope', 'col');
      return heading;
    });
    headingRow.append(...leaderboardHeaders);
    leaderboardHead.append(headingRow);
    const leaderboardBody = makeElement(documentObject, 'tbody');
    leaderboardTable.append(leaderboardHead, leaderboardBody);
    leaderboardTableWrap.append(leaderboardTable);
    const leaderboardCloseButton = makeButton(documentObject, 'close-leaderboard', 'secondary-action');
    const leaderboardRenameButton = makeButton(documentObject, 'leaderboard-rename', 'secondary-action');
    const leaderboardActions = makeElement(documentObject, 'div', { className: 'panel-actions' });
    leaderboardActions.append(leaderboardRenameButton, leaderboardCloseButton);
    const leaderboardPanel = makeElement(documentObject, 'div', { className: 'dialog-panel' });
    leaderboardPanel.append(
      leaderboardHeading, leaderboardCutoff, leaderboardEmpty,
      leaderboardTableWrap, leaderboardActions,
    );
    elements.leaderboardDialog.replaceChildren(leaderboardPanel);

    const renameHeading = makeElement(documentObject, 'h2', { id: 'rename-heading' });
    elements.renameDialog.setAttribute('aria-labelledby', 'rename-heading');
    elements.renameDialog.setAttribute('tabindex', '-1');
    const renameForm = makeElement(documentObject, 'form');
    const renameLabel = makeElement(documentObject, 'label');
    renameLabel.setAttribute('for', 'pilot-name-input');
    const renameInput = makeElement(documentObject, 'input', { id: 'pilot-name-input' });
    renameInput.type = 'text';
    renameInput.setAttribute('autocomplete', 'nickname');
    renameInput.setAttribute('aria-describedby', 'rename-help rename-count');
    const renameCount = makeElement(documentObject, 'span', { id: 'rename-count', className: 'character-count' });
    const renameHelp = makeElement(documentObject, 'p', { id: 'rename-help', className: 'form-help' });
    const renameSaveButton = makeElement(documentObject, 'button', { id: 'save-name', className: 'primary-action', type: 'submit' });
    const renameCancelButton = makeButton(documentObject, 'cancel-rename', 'secondary-action');
    const renameActions = makeElement(documentObject, 'div', { className: 'panel-actions' });
    renameActions.append(renameSaveButton, renameCancelButton);
    renameForm.append(renameLabel, renameInput, renameCount, renameHelp, renameActions);
    const renamePanel = makeElement(documentObject, 'div', { className: 'dialog-panel' });
    renamePanel.append(renameHeading, renameForm);
    elements.renameDialog.replaceChildren(renamePanel);

    return Object.freeze({
      ...elements,
      languageButton, musicButton, sfxButton,
      titleKicker, titleHeading, profileName, legacyBest, startButton, titleLeaderboardButton, controlItems,
      gameOverHeading, deathReason, resultScore, resultDistance, resultElapsed, resultRank, resultNewBest,
      restartButton, menuButton, gameOverLeaderboardButton, gameOverRenameButton,
      leaderboardPanel, leaderboardHeading, leaderboardCutoff, leaderboardEmpty, leaderboardTableWrap, leaderboardTable,
      leaderboardHeaders, leaderboardBody, leaderboardCloseButton, leaderboardRenameButton,
      renamePanel, renameHeading, renameForm, renameLabel, renameInput, renameCount, renameHelp,
      renameSaveButton, renameCancelButton,
    });
  }

  function updateNameCount(ui, translator, value) {
    const leaderboard = root.Skyroads && root.Skyroads.leaderboard;
    const count = leaderboard && typeof leaderboard.segmentGraphemes === 'function'
      ? leaderboard.segmentGraphemes(String(value == null ? '' : value)).length
      : translator.countCharacters(value || '');
    ui.renameCount.textContent = translator.t('rename.characterCount', {
      count,
      max: leaderboard && Number.isInteger(leaderboard.MAX_NAME_CHARACTERS)
        ? leaderboard.MAX_NAME_CHARACTERS : 16,
    });
  }

  function renderCommandCenter(ui, {
    translator,
    snapshot,
    mode,
    finalResult = null,
    deathReason = null,
    audioMuted = false,
    musicMuted = null,
    sfxMuted = null,
    audioStatus = 'unavailable',
    audioFormat = null,
    audioDecoded = false,
  } = {}) {
    if (!ui || !translator || !snapshot) return;
    setOverlayMode(ui, mode);
    if (ui.utilityControls.setAttribute) ui.utilityControls.setAttribute('aria-label', translator.t('settings.label'));
    ui.languageButton.textContent = `${translator.t('language.switchToChinese')} / ${translator.t('language.switchToEnglish')}`;
    ui.languageButton.setAttribute('aria-label', `${translator.t('language.switchToChinese')} / ${translator.t('language.switchToEnglish')}`);
    const resolvedMusicMuted = musicMuted == null ? Boolean(audioMuted) : Boolean(musicMuted);
    const resolvedSfxMuted = sfxMuted == null ? Boolean(audioMuted) : Boolean(sfxMuted);
    ui.musicButton.textContent = translator.t(resolvedMusicMuted ? 'settings.musicOff' : 'settings.musicOn');
    ui.musicButton.setAttribute('aria-label', ui.musicButton.textContent);
    ui.musicButton.setAttribute('aria-pressed', String(!resolvedMusicMuted));
    ui.musicButton.setAttribute('data-muted', String(resolvedMusicMuted));
    ui.sfxButton.textContent = translator.t(resolvedSfxMuted ? 'settings.sfxOff' : 'settings.sfxOn');
    ui.sfxButton.setAttribute('aria-label', ui.sfxButton.textContent);
    ui.sfxButton.setAttribute('aria-pressed', String(!resolvedSfxMuted));
    ui.sfxButton.setAttribute('data-muted', String(resolvedSfxMuted));
    ui.utilityControls.setAttribute('data-audio-status', String(audioStatus));
    ui.utilityControls.setAttribute('data-audio-format', audioFormat == null ? '' : String(audioFormat));
    ui.utilityControls.setAttribute('data-audio-decoded', String(Boolean(audioDecoded)));
    ui.titleKicker.textContent = translator.t('menu.subtitle');
    ui.titleHeading.textContent = translator.t('menu.title');
    ui.profileName.textContent = `${translator.t('rename.label')}: ${snapshot.profile.name}`;
    ui.startButton.textContent = translator.t('menu.start');
    ui.titleLeaderboardButton.textContent = translator.t('menu.leaderboard');
    const controlIds = ['controls.move', 'controls.jump', 'controls.shoot', 'controls.touch'];
    ui.controlItems.forEach((item, index) => { item.textContent = translator.t(controlIds[index]); });

    ui.legacyBest.hidden = snapshot.legacyBest == null;
    ui.legacyBest.textContent = snapshot.legacyBest == null ? '' : translator.t('leaderboard.legacyBest', {
      value: translator.formatNumber(snapshot.legacyBest),
    });
    ui.persistenceWarning.hidden = !snapshot.persistenceWarning;
    ui.persistenceWarning.textContent = snapshot.persistenceWarning
      ? translator.t('leaderboard.persistenceWarning') : '';

    ui.gameOverHeading.textContent = translator.t('gameover.title');
    const deathId = ['wall', 'gap', 'fuel', 'enemy'].includes(deathReason) ? `death.${deathReason}` : 'death.default';
    ui.deathReason.textContent = translator.t(deathId);
    ui.restartButton.textContent = translator.t('result.restart');
    ui.menuButton.textContent = translator.t('result.menu');
    ui.gameOverLeaderboardButton.textContent = translator.t('menu.leaderboard');
    ui.gameOverRenameButton.textContent = translator.t('leaderboard.rename');
    if (finalResult) {
      ui.resultScore.textContent = translator.t('result.score', { value: translator.formatNumber(finalResult.score) });
      ui.resultDistance.textContent = translator.t('result.distance', { value: translator.formatNumber(Math.floor(finalResult.distanceMeters)) });
      ui.resultElapsed.textContent = translator.t('result.elapsed', { value: formatElapsedMs(translator, finalResult.elapsedMs) });
      ui.resultRank.textContent = finalResult.qualified
        ? translator.t('result.qualified', { rank: translator.formatNumber(finalResult.rank) })
        : translator.t('result.notQualified', { value: translator.formatNumber(finalResult.cutoff || 0) });
      ui.resultNewBest.hidden = !finalResult.newLocalBest;
      ui.resultNewBest.textContent = finalResult.newLocalBest ? translator.t('result.newLocalBest') : '';
    } else {
      ui.resultScore.textContent = '';
      ui.resultDistance.textContent = '';
      ui.resultElapsed.textContent = '';
      ui.resultRank.textContent = '';
      ui.resultNewBest.hidden = true;
      ui.resultNewBest.textContent = '';
    }

    ui.leaderboardHeading.textContent = translator.t('leaderboard.title');
    const headerIds = ['leaderboard.rank', 'leaderboard.name', 'leaderboard.score', 'leaderboard.distance', 'leaderboard.time', 'leaderboard.date'];
    ui.leaderboardHeaders.forEach((heading, index) => { heading.textContent = translator.t(headerIds[index]); });
    ui.leaderboardEmpty.textContent = translator.t('leaderboard.empty');
    ui.leaderboardEmpty.hidden = snapshot.entries.length !== 0;
    ui.leaderboardTableWrap.hidden = snapshot.entries.length === 0;
    ui.leaderboardCloseButton.textContent = translator.t('leaderboard.close');
    ui.leaderboardRenameButton.textContent = translator.t('leaderboard.rename');
    ui.leaderboardCutoff.hidden = !finalResult || finalResult.cutoff == null;
    ui.leaderboardCutoff.textContent = finalResult && finalResult.cutoff != null
      ? translator.t('leaderboard.cutoff', { value: translator.formatNumber(finalResult.cutoff) }) : '';
    renderRankingRows(ui.leaderboardBody, snapshot.entries, {
      documentObject: ui.leaderboardBody.ownerDocument || root.document,
      translator,
      newestId: finalResult && finalResult.entry ? finalResult.entry.id : null,
    });

    ui.renameHeading.textContent = translator.t('rename.title');
    ui.renameLabel.textContent = translator.t('rename.label');
    ui.renameInput.placeholder = translator.t('rename.placeholder');
    if (!ui.renameInput.value) ui.renameInput.value = snapshot.profile.name;
    ui.renameHelp.textContent = translator.t('rename.emptyKeepsName');
    ui.renameSaveButton.textContent = translator.t('rename.save');
    ui.renameCancelButton.textContent = translator.t('rename.cancel');
    updateNameCount(ui, translator, ui.renameInput.value);
  }

  const api = {
    computeShipDrawRect,
    fallbackShipLayout,
    canvasMotionPolicy,
    VISUAL_ASSET_MANIFEST,
    preloadVisualAssets,
    resolvePlayerShipFrame,
    playerVisualLayerPlan,
    computeHudLayout,
    canvasMetrics,
    overlayForMode,
    setOverlayMode,
    focusPrimaryForMode,
    focusableElements,
    trapDialogTab,
    finalizeRunOnce,
    bindOverlayActions,
    formatElapsedMs,
    renderRankingRows,
    createCommandCenter,
    updateNameCount,
    renderCommandCenter,
  };
  root.Skyroads = root.Skyroads || {};
  root.Skyroads.presentation = Object.freeze(api);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
}(globalThis));
