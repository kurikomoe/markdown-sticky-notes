// Tab / Shift-Tab indentation for Markdown list entries.
//
// Only lines that start a bullet, ordered, or task list item are affected:
//   "- item"      + Tab        -> "    - item"
//   "1. item"     + Tab        -> "    1. item"
//   "- [ ] todo"  + Tab        -> "    - [ ] todo"
//   "    - item"  + Shift-Tab  -> "- item"
//   "> - item"    + Tab        -> ">     - item"
//
// Non-list lines return null so the key falls through to CodeMirror / the
// browser's default behavior (the editor does not otherwise bind Tab).

import { EditorSelection } from '@codemirror/state';

/** Spaces added/removed per indentation level. */
export const LIST_INDENT = '    ';

// Thematic breaks (`---`, `* * *`, `___`) start with a list marker character
// but are not list entries.
const THEMATIC_BREAK_RE = /^\s*([-*_])(?:\s*\1){2,}\s*$/;

// Blockquote prefix (`> `, `> > `, `  > `, `>- `), possibly nested.
const BLOCKQUOTE_PREFIX_RE = /^(?:[ \t]{0,3}>[ \t]?)+/;

// Leading whitespace + marker + whitespace, e.g. "  - ", "1. ", "2) ".
const LIST_MARKER_RE = /^([ \t]*)([-*+]|\d+[.)])([ \t])/;

/**
 * Return indentation info when `text` is a list entry line, otherwise null.
 * The marker may sit inside a blockquote (`> - item`); `quote` is the length
 * of that prefix, i.e. the position where the list's own indentation starts.
 */
export function listEntry(text) {
  const quoteMatch = BLOCKQUOTE_PREFIX_RE.exec(text);
  const quote = quoteMatch ? quoteMatch[0].length : 0;
  const body = text.slice(quote);

  if (THEMATIC_BREAK_RE.test(body)) return null;
  const match = LIST_MARKER_RE.exec(body);
  if (!match) return null;
  return { quote, indent: match[1].length, marker: match[2] };
}

/** Delete up to one level (4 spaces, or a single tab) of list indentation. */
function dedentRange(line, info) {
  const from = line.from + info.quote;
  const leading = line.text.slice(info.quote, info.quote + info.indent);
  const match = /^(\t| {1,4})/.exec(leading);
  return match ? { from, to: from + match[0].length, insert: '' } : null;
}

/**
 * Build a transaction spec that indents (direction > 0) or dedents
 * (direction < 0) every selected line that starts a list entry.
 *
 * Returns null when no selected line is a list entry, so callers can let
 * the key fall through instead of swallowing it.
 */
export function changeListIndent(state, direction) {
  let isList = false;

  const spec = state.changeByRange((range) => {
    const changes = [];
    let lastLine = -1;

    for (let pos = range.from; pos <= range.to; ) {
      const line = state.doc.lineAt(pos);

      // Same line-visiting rule as CodeMirror's indentMore/indentLess:
      // skip the final line when the selection ends at its start.
      if (line.number > lastLine && (range.empty || range.to > line.from)) {
        lastLine = line.number;

        const info = listEntry(line.text);
        if (info) {
          isList = true;
          if (direction > 0) {
            // Insert after any blockquote prefix: `> - item` -> `>     - item`
            changes.push({ from: line.from + info.quote, insert: LIST_INDENT });
          } else {
            const change = dedentRange(line, info);
            if (change) changes.push(change);
          }
        }
      }

      pos = line.to + 1;
    }

    const changeSet = state.changes(changes);
    return {
      changes,
      range: EditorSelection.range(
        changeSet.mapPos(range.anchor, 1),
        changeSet.mapPos(range.head, 1)
      ),
    };
  });

  return isList ? spec : null;
}
