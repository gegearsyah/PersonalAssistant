const MAX_TABS = 20;
const MAX_CHARS_PER_TAB = 12000;
const MAX_TOTAL_CHARS = 100000;

/**
 * Simple HTML to markdown conversion without DOMParser (service worker safe).
 * Strips script/style, replaces block tags with newlines, strips remaining tags.
 */
function htmlToMarkdown(html) {
  if (!html || typeof html !== 'string') return '';
  let s = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, '');
  s = s
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<h1[^>]*>/gi, '\n\n# ')
    .replace(/<h2[^>]*>/gi, '\n\n## ')
    .replace(/<h3[^>]*>/gi, '\n\n### ')
    .replace(/<h4[^>]*>/gi, '\n\n#### ')
    .replace(/<h5[^>]*>/gi, '\n\n##### ')
    .replace(/<h6[^>]*>/gi, '\n\n###### ')
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<a\s+[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)');
  s = s.replace(/<[^>]+>/g, '');
  s = s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
  s = s.replace(/\n{3,}/g, '\n\n').replace(/[ \t]+/g, ' ').trim();
  return s;
}

/**
 * Injected into the page to extract HTML. Must be a function that can be serialized.
 */
function extractPageContent() {
  const el = document.body || document.documentElement;
  if (!el) return '';
  const clone = el.cloneNode(true);
  const scripts = clone.querySelectorAll('script, style, noscript');
  scripts.forEach((s) => s.remove());
  return clone.innerHTML;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action !== 'collectContext') {
    sendResponse(null);
    return;
  }
  (async () => {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const contextTabs = [];
    let totalChars = 0;

    for (const tab of tabs.slice(0, MAX_TABS)) {
      if (!tab.id || (!tab.url && !tab.pendingUrl) || (tab.url || tab.pendingUrl).startsWith('chrome://') || (tab.url || tab.pendingUrl).startsWith('edge://')) continue;
      try {
        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: extractPageContent,
        });
        const raw = results?.[0]?.result;
        const html = typeof raw === 'string' ? raw : '';
        const markdown = html ? htmlToMarkdown(html) : null;
        const truncated = markdown && markdown.length > MAX_CHARS_PER_TAB
          ? markdown.slice(0, MAX_CHARS_PER_TAB) + '\n\n[truncated]'
          : markdown;
        const len = (truncated ?? '').length;
        if (totalChars + len > MAX_TOTAL_CHARS) break;
        totalChars += len;
        const header = `## Tab: ${tab.title || 'Untitled'} (${tab.url})${tab.active ? ' (ACTIVE TAB)' : ''}\n\n`;
        contextTabs.push({
          id: tab.id,
          url: tab.url,
          title: tab.title || '',
          active: tab.active,
          markdown: truncated ? header + truncated : null,
        });
      } catch (_) {
        contextTabs.push({
          id: tab.id,
          url: tab.url,
          title: tab.title || '',
          active: tab.active,
          markdown: null,
        });
      }
    }

    sendResponse({
      tabs: contextTabs,
      closed_tabs: [],
      totalChars,
      truncated: totalChars >= MAX_TOTAL_CHARS,
    });
  })();
  return true;
});
