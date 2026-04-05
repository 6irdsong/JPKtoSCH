(function () {
  'use strict';

  const SKIP_TAGS = new Set([
    'SCRIPT', 'STYLE', 'NOSCRIPT', 'CODE', 'PRE', 'TEXTAREA', 'INPUT',
    'SELECT', 'OPTION', 'KBD', 'SAMP', 'VAR',
  ]);

  const originalTexts = new Map();

  let enabled = false;
  let mutating = false;
  let observer = null;
  let originalBodyFF = null;
  let fontMode = 'auto';
  let erjianMode = false;

  function shouldSkip(node) {
    if (!node) return true;
    if (node.nodeType === Node.ELEMENT_NODE) {
      if (SKIP_TAGS.has(node.tagName)) return true;
      if (node.isContentEditable) return true;
      if (node.classList && node.classList.contains('jpk-region')) return true;
    }
    let parent = node.parentElement;
    while (parent) {
      if (SKIP_TAGS.has(parent.tagName)) return true;
      if (parent.isContentEditable) return true;
      if (parent.classList && parent.classList.contains('jpk-region')) return true;
      parent = parent.parentElement;
    }
    return false;
  }

  function collectTextNodes(root) {
    const nodes = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (shouldSkip(node)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    while (walker.nextNode()) {
      nodes.push(walker.currentNode);
    }
    return nodes;
  }

  function convertTextNode(textNode) {
    const original = textNode.nodeValue;
    if (!original || !textNode.parentNode) return;

    let needsWork = false;
    for (let i = 0; i < original.length; i++) {
      if (KANJI_TO_SIMPLIFIED[original[i]]) { needsWork = true; break; }
      if (erjianMode && SIMPLIFIED_TO_ERJIAN[original[i]]) { needsWork = true; break; }
    }
    if (!needsWork) return;

    const wrapper = document.createElement('span');
    wrapper.className = 'jpk-region';

    let buffer = '';
    for (let i = 0; i < original.length; i++) {
      const ch = original[i];
      const scChar = KANJI_TO_SIMPLIFIED[ch];

      if (scChar) {
        if (buffer) {
          wrapper.appendChild(document.createTextNode(buffer));
          buffer = '';
        }
        let displayChar = scChar;
        const span = document.createElement('span');
        span.className = 'jpk-char';
        span.dataset.jp = ch;
        span.dataset.sc = scChar;

        if (erjianMode && SIMPLIFIED_TO_ERJIAN[scChar]) {
          displayChar = SIMPLIFIED_TO_ERJIAN[scChar];
          span.dataset.ej = displayChar;
        }

        span.textContent = displayChar;
        wrapper.appendChild(span);
      } else if (erjianMode && SIMPLIFIED_TO_ERJIAN[ch]) {
        if (buffer) {
          wrapper.appendChild(document.createTextNode(buffer));
          buffer = '';
        }
        const span = document.createElement('span');
        span.className = 'jpk-char';
        span.dataset.sc = ch;
        span.dataset.ej = SIMPLIFIED_TO_ERJIAN[ch];
        span.textContent = SIMPLIFIED_TO_ERJIAN[ch];
        wrapper.appendChild(span);
      } else {
        buffer += ch;
      }
    }

    if (buffer) {
      wrapper.appendChild(document.createTextNode(buffer));
    }

    originalTexts.set(wrapper, original);

    mutating = true;
    textNode.parentNode.replaceChild(wrapper, textNode);
    mutating = false;
  }

  function convertAll() {
    const textNodes = collectTextNodes(document.body);
    for (const node of textNodes) {
      convertTextNode(node);
    }
  }

  function restoreAll() {
    mutating = true;
    for (const [wrapper, original] of originalTexts) {
      try {
        if (wrapper.parentNode) {
          const textNode = document.createTextNode(original);
          wrapper.parentNode.replaceChild(textNode, wrapper);
        }
      } catch (_) {}
    }
    originalTexts.clear();
    mutating = false;
  }

  function setupObserver() {
    if (observer) return;
    observer = new MutationObserver((mutations) => {
      if (!enabled) return;
      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          for (const added of mutation.addedNodes) {
            if (added.nodeType === Node.ELEMENT_NODE &&
                added.classList && added.classList.contains('jpk-region')) continue;
            if (added.nodeType === Node.TEXT_NODE) {
              if (!shouldSkip(added)) convertTextNode(added);
            } else if (added.nodeType === Node.ELEMENT_NODE) {
              const nodes = collectTextNodes(added);
              for (const n of nodes) convertTextNode(n);
            }
          }
        }
      }
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  function teardownObserver() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
  }

  let tooltipEl = null;

  function injectStyles() {
    if (document.getElementById('jpk-styles')) return;
    const style = document.createElement('style');
    style.id = 'jpk-styles';
    style.textContent = `
      .jpk-region {
        display: contents;
        font: inherit;
        line-height: inherit;
        letter-spacing: inherit;
      }
      .jpk-char {
        font: inherit;
        line-height: inherit;
        letter-spacing: inherit;
        word-spacing: inherit;
        color: inherit;
        margin: 0;
        padding: 0;
        border: none;
        vertical-align: baseline;
        cursor: help;
        text-decoration: underline dotted rgba(99, 102, 241, 0.4);
        text-underline-offset: 3px;
        text-decoration-thickness: 1.5px;
      }
      .jpk-char:hover {
        background: rgba(99, 102, 241, 0.10);
        border-radius: 2px;
        text-decoration-color: rgba(99, 102, 241, 0.7);
      }
      .jpk-char[data-ej] {
        text-decoration-line: underline;
        text-decoration-style: dotted;
        text-decoration-color: rgba(234, 88, 12, 0.45);
        text-underline-offset: 3px;
        text-decoration-thickness: 1.5px;
      }
      .jpk-char[data-ej]:hover {
        background: rgba(234, 88, 12, 0.10);
        text-decoration-color: rgba(234, 88, 12, 0.7);
      }
    `;
    document.head.appendChild(style);
  }

  function removeStyles() {
    const s = document.getElementById('jpk-styles');
    if (s) s.remove();
  }

  function createTooltip() {
    if (tooltipEl) return;
    tooltipEl = document.createElement('div');
    tooltipEl.id = 'jpk-tooltip';
    tooltipEl.style.cssText = [
      'position:fixed', 'z-index:2147483647',
      'padding:8px 16px',
      'background:rgba(10,10,10,.95)', 'color:#fff',
      'font:700 22px/1.3 system-ui,sans-serif',
      'border-radius:8px',
      'pointer-events:none', 'opacity:0',
      'transition:opacity .12s ease',
      'white-space:nowrap',
      'box-shadow:0 4px 20px rgba(0,0,0,.45)',
      'letter-spacing:0.06em',
      'border:1px solid rgba(255,255,255,.12)',
    ].join(';');
    document.documentElement.appendChild(tooltipEl);

    document.body.addEventListener('mouseover', onCharOver, true);
    document.body.addEventListener('mouseout', onCharOut, true);
  }

  function destroyTooltip() {
    if (tooltipEl) {
      tooltipEl.remove();
      tooltipEl = null;
    }
    document.body.removeEventListener('mouseover', onCharOver, true);
    document.body.removeEventListener('mouseout', onCharOut, true);
  }

  function hideTooltip() {
    if (tooltipEl) tooltipEl.style.opacity = '0';
  }

  function onCharOver(e) {
    const span = e.target.closest('.jpk-char');
    if (!span || !enabled) { hideTooltip(); return; }
    showTooltipFor(span);
  }

  function onCharOut(e) {
    const span = e.target.closest('.jpk-char');
    if (!span) { hideTooltip(); return; }
    const rel = e.relatedTarget;
    if (rel && span.contains(rel)) return;
    hideTooltip();
  }

  function showTooltipFor(span) {
    if (!tooltipEl) return;

    const jp = span.dataset.jp;
    const sc = span.dataset.sc;
    const ej = span.dataset.ej;

    let label;
    if (jp) {
      label = jp + ' \u2192 ' + sc;
      if (ej) label += ' \u2192 ' + ej;
    } else {
      label = sc + ' \u2192 ' + ej;
    }

    tooltipEl.textContent = label;
    tooltipEl.style.opacity = '1';

    const rect = span.getBoundingClientRect();
    const ttW = tooltipEl.offsetWidth;
    const ttH = tooltipEl.offsetHeight;

    let left = rect.left + rect.width / 2 - ttW / 2;
    let top = rect.top - ttH - 8;

    if (left < 4) left = 4;
    if (left + ttW > window.innerWidth - 4) left = window.innerWidth - 4 - ttW;
    if (top < 4) top = rect.bottom + 8;

    tooltipEl.style.left = left + 'px';
    tooltipEl.style.top = top + 'px';
  }

  function detectSerif() {
    const ff = getComputedStyle(document.body).fontFamily.toLowerCase();
    return /serif/i.test(ff) && !/sans-serif/i.test(ff) ||
           /mincho|song|ming|times|georgia|宋|明朝/i.test(ff);
  }

  function injectFont() {
    if (fontMode === 'off') return;
    removeFont();

    const useSerif = fontMode === 'serif' || (fontMode === 'auto' && detectSerif());
    const fontFamily = useSerif ? 'Noto Serif SC' : 'Noto Sans SC';
    const weights = useSerif ? 'wght@200;300;400;500;600;700;900' : 'wght@100;300;400;500;700;900';

    const link = document.createElement('link');
    link.id = 'jpk-font-link';
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?family=${fontFamily.replace(/ /g, '+')}:${weights}&display=swap`;
    document.head.appendChild(link);

    const systemFonts = useSerif
      ? "'Noto Serif CJK SC', 'Source Han Serif SC', 'STSong', 'SimSun'"
      : "'Noto Sans CJK SC', 'Source Han Sans SC', 'PingFang SC', 'Microsoft YaHei'";

    originalBodyFF = document.body.style.fontFamily || null;
    const computed = getComputedStyle(document.body).fontFamily;
    document.body.style.fontFamily = computed + `, '${fontFamily}', ${systemFonts}`;
  }

  function removeFont() {
    const link = document.getElementById('jpk-font-link');
    if (link) link.remove();
    if (originalBodyFF !== null) {
      document.body.style.fontFamily = originalBodyFF;
    } else {
      document.body.style.removeProperty('font-family');
    }
    originalBodyFF = null;
  }

  function reconvert() {
    teardownObserver();
    restoreAll();
    convertAll();
    setupObserver();
  }

  function activate() {
    if (enabled) return;
    enabled = true;
    injectStyles();
    injectFont();
    convertAll();
    setupObserver();
    createTooltip();
  }

  function deactivate() {
    if (!enabled) return;
    enabled = false;
    teardownObserver();
    restoreAll();
    removeFont();
    removeStyles();
    destroyTooltip();
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === 'toggle') {
      if (msg.enabled) {
        activate();
      } else {
        deactivate();
      }
      sendResponse({ ok: true });
    } else if (msg.type === 'setErjian') {
      erjianMode = !!msg.erjian;
      if (enabled) {
        reconvert();
      }
      sendResponse({ ok: true });
    } else if (msg.type === 'setFontMode') {
      fontMode = msg.fontMode || 'auto';
      if (enabled) {
        removeFont();
        injectFont();
      }
      sendResponse({ ok: true });
    } else if (msg.type === 'getStatus') {
      sendResponse({ enabled, fontMode, erjianMode });
    }
  });

  function init() {
    chrome.storage.local.get(['enabled', 'excludedDomains', 'fontMode', 'erjianMode'], (data) => {
      fontMode = data.fontMode || 'auto';
      erjianMode = !!data.erjianMode;
      const globalEnabled = data.enabled !== false;
      const excluded = data.excludedDomains || [];
      const hostname = location.hostname;
      const isExcluded = excluded.some((d) => {
        d = d.trim().toLowerCase();
        if (!d) return false;
        return hostname === d || hostname.endsWith('.' + d);
      });
      if (globalEnabled && !isExcluded) {
        activate();
      }
    });
  }

  chrome.storage.onChanged.addListener((changes) => {
    if (changes.fontMode) {
      fontMode = changes.fontMode.newValue || 'auto';
      if (enabled) {
        removeFont();
        injectFont();
      }
    }
    if (changes.erjianMode) {
      erjianMode = !!changes.erjianMode.newValue;
      if (enabled) {
        reconvert();
      }
    }
    if (changes.enabled || changes.excludedDomains) {
      chrome.storage.local.get(['enabled', 'excludedDomains'], (data) => {
        const globalEnabled = data.enabled !== false;
        const excluded = data.excludedDomains || [];
        const hostname = location.hostname;
        const isExcluded = excluded.some((d) => {
          d = d.trim().toLowerCase();
          if (!d) return false;
          return hostname === d || hostname.endsWith('.' + d);
        });
        if (globalEnabled && !isExcluded) {
          activate();
        } else {
          deactivate();
        }
      });
    }
  });

  if (document.body) {
    init();
  } else {
    document.addEventListener('DOMContentLoaded', init);
  }
})();
