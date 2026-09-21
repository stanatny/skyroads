'use strict';

(function attachCockpitRuntime(root) {
  // 将三维画面连接到现有状态；回退通知调用方同步兼容物理，不重置计分或存档。
  function create({ state, config, documentObject = root.document,
    rendererApi = root.Skyroads && root.Skyroads.flightRenderer,
    uiApi = root.Skyroads && root.Skyroads.cockpitUi, onFallback } = {}) {
    const canvas = documentObject.getElementById('flight-scene');
    const notice = documentObject.getElementById('renderer-notice');
    let renderer = null;
    let ui = null;
    let error = null;
    let disposed = false;

    function updateUi() {
      if (ui) ui.update(state, config);
      if (notice && error) {
        notice.hidden = false;
        notice.textContent = state.translator && state.translator.locale === 'zh-CN'
          ? '3D 画面暂不可用，已切换兼容画面，任务可继续。'
          : '3D view unavailable. Compatibility view is active; your mission can continue.';
      }
    }

    function fallback(reason) {
      error = reason instanceof Error ? reason.message : String(reason || '3D renderer unavailable');
      const previous = renderer;
      renderer = null;
      if (canvas) canvas.hidden = true;
      documentObject.documentElement.setAttribute('data-renderer', 'classic');
      if (ui) ui.setAvailable(false);
      try { if (previous) previous.dispose(); } catch (_) { /* 丢失的上下文可能无法释放 GPU 对象。 */ }
      updateUi();
      if (typeof onFallback === 'function') onFallback();
    }

    function resize() {
      if (!renderer) return;
      try { renderer.resize(state.width, state.height, state.dpr); }
      catch (reason) { fallback(reason); }
    }

    function render() {
      if (!renderer || disposed) return false;
      try {
        renderer.render(state);
        state.ctx.clearRect(0, 0, state.width, state.height);
        updateUi();
        return Boolean(renderer);
      } catch (reason) {
        fallback(reason);
        return false;
      }
    }

    function dispose() {
      disposed = true;
      if (renderer) renderer.dispose();
      if (ui) ui.dispose();
      renderer = null;
      if (canvas) canvas.hidden = true;
    }

    try {
      if (uiApi) ui = uiApi.create({ document: documentObject });
      if (!canvas || !rendererApi) throw new Error('3D renderer unavailable');
      renderer = rendererApi.create({ canvas, config, onFailure: fallback });
      canvas.hidden = false;
      documentObject.documentElement.setAttribute('data-renderer', 'cockpit');
      if (notice) notice.hidden = true;
      if (ui) ui.setAvailable(true);
      resize();
    } catch (reason) { fallback(reason); }

    return Object.freeze({ render, resize, updateUi, dispose,
      getDiagnostics: () => Object.freeze({
        renderer: renderer ? 'cockpit' : 'classic',
        error,
        ...(renderer && renderer.getDiagnostics ? renderer.getDiagnostics() : {}),
      }),
    });
  }

  const api = Object.freeze({ create });
  root.Skyroads = root.Skyroads || {};
  root.Skyroads.cockpitRuntime = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
}(globalThis));
