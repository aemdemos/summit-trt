/**
 * Section title: semantic heading + optional subtitle, with size, alignment, and tone.
 * Supports a legacy 4-row table (title row, title size, subtitle row, subtitle size) and
 * key/value rows from readBlockConfig (UE/DA). Legacy imports: parseFromId() reads optional
 * heading id fragments (---) from migrated content only.
 */
import { readBlockConfig } from '../../scripts/aem.js';
import { moveInstrumentation } from '../../scripts/scripts.js';

const HEADING_SELECTOR = 'h1, h2, h3, h4, h5, h6, p';
const HEADING_TAGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p'];
const ALIGNMENTS = ['left', 'center', 'right'];
/** Allowlist for block `classes` (tone); avoids arbitrary class injection */
const ALLOWED_TONE_CLASSES = new Set([
  '',
  'section-title-tone-muted',
  'section-title-tone-accent',
]);

const SIZE_MAP = new Map([
  ['xxl', 'size-xxl'],
  ['xl', 'size-xl'],
  ['l', 'size-l'],
  ['m', 'size-m'],
  ['s', 'size-s'],
  ['xs', 'size-xs'],
]);

function normalizeSize(val) {
  if (!val || typeof val !== 'string') return '';
  const n = val.trim().toLowerCase();
  if (!n) return '';
  const mapped = SIZE_MAP.get(n);
  if (mapped) return mapped;
  if (n.startsWith('size-')) return n;
  const order = ['xxl', 'xs', 'xl', 'l', 'm', 's'];
  const key = order.find((k) => n.includes(k));
  return key ? SIZE_MAP.get(key) ?? '' : '';
}

function cellText(row) {
  if (!row?.children?.length) return '';
  const col = row.children.length >= 2 ? row.children[1] : row.children[0];
  return (col?.textContent ?? '').trim();
}

function get(config, ...keys) {
  const v = keys.reduce((acc, k) => acc ?? config[k], undefined);
  return typeof v === 'string' ? v.trim() : '';
}

function hasValue(s) {
  return typeof s === 'string' && s.trim().length > 0;
}

function validTag(t) {
  if (!t || typeof t !== 'string') return '';
  const lower = t.trim().toLowerCase();
  return (HEADING_TAGS.includes(lower)) ? lower : '';
}

/** Legacy migration helper: optional segments in heading id (not used for greenfield authoring). */
function parseFromId(id) {
  const out = { type: '', sizeClass: '', alignment: '' };
  if (!id || typeof id !== 'string') return out;
  const parts = id.split('---');
  if (parts[1] && HEADING_TAGS.includes(parts[1].toLowerCase())) {
    out.type = parts[1].toLowerCase();
  }
  const rest = (parts[2] ?? '').toLowerCase();
  const sizePart = (rest.split('-and-')[0] ?? '').replace(/^size-/, '');
  out.sizeClass = normalizeSize(sizePart) || normalizeSize(rest);
  if (rest.includes('right')) out.alignment = 'right';
  else if (rest.includes('center')) out.alignment = 'center';
  return out;
}

function getHeadingFromCell(cell, existingHeading = null) {
  const heading = existingHeading ?? cell?.querySelector?.(HEADING_SELECTOR);
  if (heading) {
    return {
      text: (heading.textContent ?? '').trim(),
      tag: heading.tagName.toLowerCase(),
      id: heading.id ?? '',
    };
  }
  return { text: cellText(cell), tag: 'h2', id: '' };
}

function createTitleElement(tag, className, text, id, sourceEl) {
  const t = validTag(tag) || 'h2';
  const el = document.createElement(HEADING_TAGS.includes(t) ? t : 'p');
  el.classList.add(className);
  if (sourceEl) {
    moveInstrumentation(sourceEl, el);
    el.append(...sourceEl.childNodes);
  } else {
    el.textContent = text ?? '';
  }
  if (hasValue(id)) el.id = id;
  return el;
}

function readTitleFromRows(rows, block) {
  const state = {
    titleText: '',
    titleTag: 'h2',
    titleSizeClass: '',
    titleId: '',
    alignVal: '',
    titleHeadingEl: null,
  };
  const legacyFour = rows.length > 0 && rows.length <= 4;
  const titleSource = rows.length >= 1 ? rows[0] : block;
  const titleHeadingEl = titleSource?.querySelector?.(HEADING_SELECTOR);
  state.titleHeadingEl = titleHeadingEl;
  const titleInfo = getHeadingFromCell(titleSource, titleHeadingEl);
  if (!hasValue(titleInfo.text) && !titleHeadingEl) return state;
  state.titleText = titleInfo.text;
  state.titleTag = titleInfo.tag;
  state.titleId = titleInfo.id;
  const fromId = parseFromId(titleInfo.id);
  if (fromId.type) state.titleTag = fromId.type;
  if (rows.length === 0) {
    state.titleSizeClass = fromId.sizeClass;
    state.alignVal = fromId.alignment;
  }
  if (legacyFour && rows.length >= 2) {
    state.titleSizeClass = normalizeSize(cellText(rows[1])) || state.titleSizeClass;
  }
  return state;
}

function readSubtitleFromRows(rows, block) {
  const state = {
    subtitleText: '',
    subtitleTag: 'p',
    subtitleSizeClass: '',
    subHeadingEl: null,
  };
  const legacyFour = rows.length > 0 && rows.length <= 4;
  if (legacyFour && rows.length >= 3) {
    state.subHeadingEl = rows[2]?.querySelector?.(HEADING_SELECTOR) ?? null;
    const sub = getHeadingFromCell(rows[2], state.subHeadingEl);
    if (hasValue(sub.text) || state.subHeadingEl) {
      state.subtitleText = sub.text;
      state.subtitleTag = sub.tag;
    }
  }
  if (legacyFour && rows.length >= 4) state.subtitleSizeClass = normalizeSize(cellText(rows[3]));
  if (rows.length === 0 && hasValue(block.getAttribute?.('data-subtitle'))) {
    state.subtitleText = block.getAttribute('data-subtitle');
  }
  return state;
}

function normalizeToneClass(raw) {
  if (!raw || typeof raw !== 'string') return '';
  const t = raw.trim();
  return ALLOWED_TONE_CLASSES.has(t) ? t : '';
}

function applyConfig(state, config) {
  const cfg = (key, ...alt) => get(config, key, ...alt);
  const titleCfg = cfg('title-text', 'title') || cfg('title');
  if (hasValue(titleCfg)) state.titleText = titleCfg;
  const tType = validTag(cfg('title-type', 'titleType'));
  if (tType) state.titleTag = tType;
  if (hasValue(cfg('title-size', 'titleSize'))) {
    state.titleSizeClass = normalizeSize(cfg('title-size', 'titleSize'));
  }
  const alignField = cfg('alignment');
  if (ALIGNMENTS.includes(alignField)) state.alignVal = alignField;
  const classesField = cfg('classes');
  const tone = normalizeToneClass(classesField);
  if (tone) {
    state.toneClass = tone;
  } else if (!state.alignVal && ALIGNMENTS.includes(classesField)) {
    state.alignVal = classesField;
  }
  if (hasValue(cfg('subtitle'))) state.subtitleText = cfg('subtitle');
  const sType = validTag(cfg('subtitle-type', 'subtitleType'));
  if (sType) state.subtitleTag = sType;
  if (hasValue(cfg('subtitle-size', 'subtitleSize'))) {
    state.subtitleSizeClass = normalizeSize(cfg('subtitle-size', 'subtitleSize'));
  }
}

function renderSectionTitle(block, state) {
  const keepAlign = ALIGNMENTS.includes(state.alignVal) ? state.alignVal : '';
  const keepSize = hasValue(state.titleSizeClass) ? state.titleSizeClass : '';
  const keepSubSize = hasValue(state.subtitleSizeClass) ? state.subtitleSizeClass : '';
  const keepTone = state.toneClass && ALLOWED_TONE_CLASSES.has(state.toneClass) ? state.toneClass : '';

  block.replaceChildren();
  block.classList.remove(
    'left',
    'center',
    'right',
    'size-xxl',
    'size-xl',
    'size-l',
    'size-m',
    'size-s',
    'size-xs',
    'subtitle-size-xxl',
    'subtitle-size-xl',
    'subtitle-size-l',
    'subtitle-size-m',
    'subtitle-size-s',
    'subtitle-size-xs',
    'section-title-tone-muted',
    'section-title-tone-accent',
  );

  const titleEl = createTitleElement(
    state.titleTag,
    'title',
    state.titleText,
    state.titleId,
    state.titleHeadingEl,
  );
  block.appendChild(titleEl);
  if (keepSize) block.classList.add(keepSize);
  if (keepAlign) block.classList.add(keepAlign);
  if (keepTone) block.classList.add(keepTone);
  if (!hasValue(state.subtitleText)) return;

  const subEl = createTitleElement(
    state.subtitleTag,
    'subtitle',
    state.subtitleText,
    '',
    state.subHeadingEl,
  );
  block.appendChild(subEl);
  if (keepSubSize) block.classList.add(`subtitle-${keepSubSize}`);
}

export default function decorate(block) {
  const config = readBlockConfig(block) ?? {};
  const rows = Array.from(block.querySelectorAll(':scope > div'));
  const legacySlice = rows.slice(0, 4);
  const titleState = readTitleFromRows(legacySlice, block);
  const subtitleState = readSubtitleFromRows(legacySlice, block);
  const state = {
    ...titleState,
    ...subtitleState,
    toneClass: '',
  };
  applyConfig(state, config);
  if (!hasValue(state.titleText) && !state.titleHeadingEl) return;
  renderSectionTitle(block, state);
}
