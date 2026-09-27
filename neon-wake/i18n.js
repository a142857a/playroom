import { UI_ZH } from './locale-ui.js';
import { COMBAT_ZH } from './locale-combat.js';
import { STATS_ZH } from './locale-stats.js';

export const LANGUAGE_STORAGE_KEY = 'skyward-bloom-language';
const chinese = Object.freeze({ ...UI_ZH, ...COMBAT_ZH, ...STATS_ZH });
let language = 'en';
try { if (globalThis.localStorage?.getItem(LANGUAGE_STORAGE_KEY) === 'zh-CN') language = 'zh-CN'; } catch { /* Playable without storage. */ }
export const getLanguage = () => language;
export function setLanguage(next) {
  if (next !== 'en' && next !== 'zh-CN') return language;
  const changed = language !== next;
  language = next;
  try { globalThis.localStorage?.setItem(LANGUAGE_STORAGE_KEY, language); } catch { /* Preference remains available for this visit. */ }
  if (changed && globalThis.window?.dispatchEvent) window.dispatchEvent(new Event('languagechange'));
  return language;
}
const escapePattern = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Canvas banners arrive from simulation as complete English strings. Match only
// known full templates; simulation IDs and saved data never depend on language.
const patterns = Object.entries(chinese).filter(([key]) => /\{\w+\}/.test(key)).map(([key, value]) => {
  const names = [];
  let offset = 0, pattern = '';
  for (const match of key.matchAll(/\{(\w+)\}/g)) {
    pattern += escapePattern(key.slice(offset, match.index)) + '(.+?)';
    names.push(match[1]); offset = match.index + match[0].length;
  }
  pattern += escapePattern(key.slice(offset));
  return { regex: new RegExp('^' + pattern + '$'), names, value, specificity: key.replace(/\{\w+\}/g, '').length };
}).sort((a,b) => b.specificity-a.specificity);
const cache = new Map();
const interpolate = (template, values, translated) => template.replace(/\{(\w+)\}/g, (match, name) => {
  if (!Object.hasOwn(values, name)) return match;
  const value = String(values[name]);
  return translated ? chinese[value] ?? value : value;
});
export function t(key, values = {}) {
  const text = String(key ?? '');
  if (language === 'en') return interpolate(text, values, false);
  if (Object.hasOwn(chinese, text)) return interpolate(chinese[text], values, true);
  if (Object.keys(values).length) return interpolate(text, values, true);
  if (cache.has(text)) return cache.get(text);
  let translated = text;
  for (const candidate of patterns) {
    const match = candidate.regex.exec(text);
    if (!match) continue;
    const captured = Object.fromEntries(candidate.names.map((name, index) => [name, match[index+1]]));
    translated = interpolate(candidate.value, captured, true); break;
  }
  if (cache.size >= 512) cache.clear();
  cache.set(text, translated);
  return translated;
}
export function translateDocument(root = globalThis.document) {
  if (!root) return;
  for (const node of root.querySelectorAll('[data-i18n]')) node.textContent = t(node.getAttribute('data-i18n'));
  for (const attribute of ['aria-label', 'title', 'content']) {
    const marker = 'data-i18n-' + attribute;
    for (const node of root.querySelectorAll('['+marker+']')) node.setAttribute(attribute, t(node.getAttribute(marker)));
  }
  if (root.documentElement) root.documentElement.lang = language;
  const button = root.getElementById?.('languageBtn');
  if (button) {
    const description = t(language === 'en' ? 'Switch to Simplified Chinese' : 'Switch to English');
    button.setAttribute('aria-label', description); button.title = description;
  }
}
