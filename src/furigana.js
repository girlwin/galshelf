(function (root) {
  'use strict';
  const kana = s => [...String(s || '')].map(c => { const n = c.codePointAt(0); return n >= 0x30a1 && n <= 0x30f6 ? String.fromCodePoint(n - 0x60) : c; }).join('');
  const kanji = c => /[\p{Script=Han}々〆]/u.test(c);
  function splitReading(surface, reading) {
    reading = kana(reading);
    if (!reading || reading === '*' || ![...surface].some(kanji) || kana(surface) === reading) return [];
    const runs = [];
    for (const c of surface) {
      const kind = kanji(c);
      const last = runs[runs.length - 1];
      if (last && last.kanji === kind) last.text += c;
      else runs.push({ text: c, kanji: kind });
    }
    const fallback = () => [{ start: 0, end: [...surface].length, reading }];
    // Each kanji run takes at least one kana, and the kana after it must match the next run at that point: the first
    // match was taken before, so 目覚め (めざめ) found the leading め, failed, and put めざめ over the whole word including
    // the okurigana (user, 2026-11-03). Backtracking tries every split until the whole reading is used.
    const match = (i, r, offset) => {
      if (i === runs.length) return r === reading.length ? [] : null;
      const run = runs[i], length = [...run.text].length;
      if (!run.kanji) { const plain = kana(run.text); if (reading.slice(r, r + plain.length) !== plain) return null; return match(i + 1, r + plain.length, offset + length); }
      const last = i === runs.length - 1;
      for (let end = last ? reading.length : r + 1; end <= reading.length; end++) {
        if (end <= r) continue;
        const rest = match(i + 1, end, offset + length);
        if (rest) return [{ start: offset, end: offset + length, reading: reading.slice(r, end) }, ...rest];
      }
      return null;
    };
    return match(0, 0, 0) || fallback();
  }
  function annotations(text, tokens) {
    const result = [];
    let cursor = 0;
    for (const token of tokens || []) {
      if (!token || typeof token.surface !== 'string' || !token.surface) continue;
      const index = text.indexOf(token.surface, cursor);
      if (index < 0) continue;
      const offset = [...text.slice(0, index)].length;
      for (const segment of splitReading(token.surface, token.reading)) result.push({ start: offset + segment.start, end: offset + segment.end, reading: segment.reading });
      cursor = index + token.surface.length;
    }
    return result;
  }
  // Dictionary readings that ignore context. Sudachi reads 私 as わたくし (its dictionary form) everywhere, which is wrong for
  // ordinary speech: use わたし unless the sentence is clearly formal (わたくしども, humble/polite set phrases).
  const formal = /ございま|いたしま|致しま|申し|参りま|存じ|おります/;
  function contextual(text, tokens) {
    if (!Array.isArray(tokens)) return [];
    const humble = formal.test(String(text || ''));
    return tokens.map((token, i) => {
      if (!token || typeof token.surface !== 'string' || !/^私/.test(token.surface)) return token;
      const reading = kana(token.reading);
      if (!reading.startsWith('わたくし')) return token;
      const next = tokens[i + 1]?.surface || '';
      if (humble || /^(?:ども|共)/.test(token.surface.slice(1) || next)) return token;
      return { ...token, reading: 'わたし' + reading.slice(4) };
    });
  }
  // Readings the game prints itself (its ruby), learned per work, replace guessed ones wherever that word appears:
  // a kanji has too many readings to guess (user, 2026-11-03). Longer words win over shorter ones they contain.
  function withGameRuby(text, list, dict) {
    if (!dict || typeof dict !== 'object') return list;
    const chars = [...String(text || '')], taken = new Array(chars.length).fill(false), extra = [];
    for (const base of Object.keys(dict).sort((a, b) => [...b].length - [...a].length)) {
      const word = [...base], reading = kana(dict[base]);if (!word.length || !reading) continue;
      for (let i = 0; i + word.length <= chars.length; i++) {
        if (chars.slice(i, i + word.length).join('') !== base || taken.slice(i, i + word.length).some(Boolean)) continue;
        for (let k = i; k < i + word.length; k++) taken[k] = true;
        for (const part of splitReading(base, reading)) extra.push({ start: i + part.start, end: i + part.end, reading: part.reading, game: true });
      }
    }
    if (!extra.length) return list;
    return list.filter(a => !taken.slice(a.start, a.end).some(Boolean)).concat(extra).sort((a, b) => a.start - b.start);
  }
  const api = { kana, splitReading, annotations, contextual, withGameRuby };
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.TomoyoFurigana = api;
})(typeof window === 'object' ? window : null);
