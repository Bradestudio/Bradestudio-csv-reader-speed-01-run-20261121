// A faster drop-in for csv-reader 1.0.0 (make.fun's own reference program).
//
// run(input) returns exactly csv-reader 1.0.0's answer for {text, header}:
// {columns, rows, errors}. The semantics are csv-reader's own, read from
// baseline/csv-reader/vendor/csv-reader/index.js in the kit and verified
// against it case by case:
//
//   - a U+FEFF at the very start of the text is dropped;
//   - a record ends at LF or CRLF; a line left with no characters is no record;
//   - outside quotes a CR not followed by LF is dropped (stray_cr);
//   - a field opening with a quote runs to the next quote that is not doubled,
//     "" inside it is one quote, each CRLF or lone CR inside it reads as LF;
//     what follows its closing quote up to the next comma or line break is
//     appended as it stands (quote_junk, when the field ends); a quote that
//     never closes is a literal character and the text after it is read again
//     as unquoted (unterminated_quote); a quote inside an unquoted field is
//     a literal character; fields stay strings, never trimmed or converted;
//   - columns is the first record when header is true, else null; rows are the
//     records after it, each padded with "" (short_row, with fields: its field
//     count) or cut (long_row, with extra: the cut fields) to the first
//     record's width;
//   - each error is {code, line, row}, in the order met; line is the 1-based
//     line its record starts on (every LF, CRLF and lone CR inside quotes
//     counted), row its record's index in rows, null for the header.
//
// Speed: the reference walks one character at a time and builds every field
// a character at a time. This reader jumps with String.indexOf (native) and
// slices fields whole. A record whose first line holds no quote and no stray
// CR — the common case in the drawn sets — is split in one native
// String.split(',') call; quoted and broken records fall back to a per-field
// scanner that still jumps field to field instead of stepping character by
// character. Nothing is kept from one run() call to the next: every case is
// answered alone, with no cache across cases.

const COMMA = 0;
const LINE_BREAK = 1;
const END = 2;

/** csv-reader 1.0.0's answer for one case's input. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  const n = text.length;
  let pos = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  let line = 1;

  // The record being read: the line it starts on and the index in rows it
  // takes (null: the header). The field readers below report errors against
  // these, as the reference does.
  let recordLine = 1;
  let recordRow = null;

  // Reads an unquoted field from pos, appending onto `init` ("" for a fresh
  // field, the quoted value for junk after a closing quote, '"' for the
  // re-read after a quote that never closes). Returns [value, ended].
  function readUnquoted(init) {
    let parts = null;
    let val = init;
    const add = (s) => {
      if (s === '') return;
      if (parts !== null) parts.push(s);
      else if (val === '') val = s;
      else {
        parts = [val, s];
        val = '';
      }
    };
    const value = () => (parts !== null ? parts.join('') : val);
    for (;;) {
      const ci = text.indexOf(',', pos);
      const ni = text.indexOf('\n', pos);
      let m;
      let isComma;
      let eot = false;
      if (ci === -1 && ni === -1) {
        m = n;
        isComma = false;
        eot = true;
      } else if (ni === -1 || (ci !== -1 && ci < ni)) {
        m = ci;
        isComma = true;
      } else {
        m = ni;
        isComma = false;
      }
      const seg = text.slice(pos, m);
      let ri = seg.indexOf('\r');
      if (ri === -1) {
        add(seg);
        if (eot) {
          pos = n;
          return [value(), END];
        }
        if (isComma) {
          pos = m + 1;
          return [value(), COMMA];
        }
        pos = m + 1;
        line += 1;
        return [value(), LINE_BREAK];
      }
      // A CR sits inside this field's span: walk them in order. One followed
      // by LF ends the field (CRLF); any other is dropped (stray_cr) and the
      // field goes on past it.
      let s = 0;
      for (;;) {
        if (text.charCodeAt(pos + ri + 1) === 10) {
          add(seg.slice(s, ri));
          pos = pos + ri + 2;
          line += 1;
          return [value(), LINE_BREAK];
        }
        errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
        add(seg.slice(s, ri));
        s = ri + 1;
        ri = seg.indexOf('\r', s);
        if (ri === -1) break;
      }
      add(seg.slice(s));
      if (eot) {
        pos = n;
        return [value(), END];
      }
      if (isComma) {
        pos = m + 1;
        return [value(), COMMA];
      }
      pos = m + 1;
      line += 1;
      return [value(), LINE_BREAK];
    }
  }

  // Reads a quoted field whose opening quote is at pos. Returns [value, ended].
  function readQuoted() {
    const open = pos;
    const openLine = line;
    let qline = line;
    let parts = null;
    let val = '';
    const add = (s) => {
      if (s === '') return;
      if (parts !== null) parts.push(s);
      else if (val === '') val = s;
      else {
        parts = [val, s];
        val = '';
      }
    };
    const value = () => (parts !== null ? parts.join('') : val);
    let i = pos + 1;
    for (;;) {
      const q = text.indexOf('"', i);
      if (q === -1) {
        // The quote never closes: it is a literal character, and the text
        // after it is read again as unquoted; the lines the failed scan
        // counted are dropped (line goes back to the line the quote opened on).
        errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
        line = openLine;
        pos = open + 1;
        return readUnquoted('"');
      }
      const seg = text.slice(i, q);
      const doubled = text.charCodeAt(q + 1) === 34;
      const ri = seg.indexOf('\r');
      if (ri === -1) {
        const ni = seg.indexOf('\n');
        if (ni !== -1) {
          let c = 0;
          let p = ni;
          while (p !== -1) {
            c += 1;
            p = seg.indexOf('\n', p + 1);
          }
          qline += c;
        }
        add(seg);
      } else {
        // CRLF and a lone CR inside quotes each read as one LF.
        const breaks = seg.match(/\r\n?|\n/g);
        if (breaks !== null) qline += breaks.length;
        add(seg.replace(/\r\n?/g, '\n'));
      }
      if (doubled) {
        add('"');
        i = q + 2;
        continue;
      }
      // The quote at q closes the field.
      line = qline;
      pos = q + 1;
      if (pos >= n) return [value(), END];
      const c = text.charCodeAt(pos);
      if (c === 44) {
        pos += 1;
        return [value(), COMMA];
      }
      if (c === 10) {
        pos += 1;
        line += 1;
        return [value(), LINE_BREAK];
      }
      if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
        return [value(), LINE_BREAK];
      }
      // What follows the closing quote is appended as it stands, up to the
      // next comma or line break.
      const cur = value();
      const out = readUnquoted(cur);
      if (out[0].length > cur.length) {
        errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
      }
      return out;
    }
  }

  while (true) {
    // Lines with no characters are no records.
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= n) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;

    // Fast path: the record ends on this line and the line holds no quote and
    // no stray CR, so its fields are one native split. A trailing CR before
    // the line's LF is the CRLF line break, not content. Quotes are dense in
    // the drawn sets, so the quote check runs on the text itself (no slice
    // is made for a record that falls back).
    const le = text.indexOf('\n', pos);
    const lineEnd = le === -1 ? n : le;
    const qi = text.indexOf('"', pos);
    let fast = qi === -1 || qi >= lineEnd;
    let seg = '';
    if (fast) {
      seg = text.slice(pos, lineEnd);
      if (le !== -1 && seg.charCodeAt(seg.length - 1) === 13) seg = seg.slice(0, -1);
      if (seg.indexOf('\r') !== -1) fast = false;
    }
    let fields;
    if (fast) {
      if (seg === '') {
        // A blank line: no record (unreachable after the skip above, kept
        // so the split never sees an empty line).
        pos = le === -1 ? n : le + 1;
        line += 1;
        continue;
      }
      fields = seg.split(',');
      pos = le === -1 ? n : le + 1;
      line += 1;
    } else {
      fields = [];
      let quoted = false;
      let ended = COMMA;
      let v;
      do {
        if (text.charCodeAt(pos) === 34) {
          quoted = true;
          [v, ended] = readQuoted();
        } else {
          quoted = false;
          [v, ended] = readUnquoted('');
        }
        fields.push(v);
      } while (ended === COMMA);
      // A line that held only stray CRs is left with no characters: no record
      // (its stray_cr errors stay).
      if (fields.length === 1 && fields[0] === '' && !quoted) continue;
    }

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
