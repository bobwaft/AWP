import { markdown } from '@codemirror/lang-markdown';
import { unifiedMergeView } from '@codemirror/merge';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { basicSetup } from 'codemirror';
import { useEffect, useRef } from 'react';

// Colours come from tokens.css variables, so one theme serves dark and light.
const theme = EditorView.theme({
  '&': { backgroundColor: 'var(--bg-1)', color: 'var(--text-1)' },
  '.cm-content': { caretColor: 'var(--accent-bright)' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--accent-bright)' },
  '&.cm-focused': { outline: 'none' },
  '.cm-gutters': {
    backgroundColor: 'var(--bg-1)',
    color: 'var(--text-3)',
    border: 'none',
  },
  '.cm-activeLine': { backgroundColor: 'var(--bg-2)' },
  '.cm-activeLineGutter': {
    backgroundColor: 'var(--bg-2)',
    color: 'var(--text-2)',
  },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection':
    { backgroundColor: 'var(--accent-dim)' },
  '.cm-changedLine': {
    backgroundColor: 'color-mix(in srgb, var(--success) 14%, transparent)',
  },
  '.cm-deletedChunk': {
    backgroundColor: 'color-mix(in srgb, var(--danger) 14%, transparent)',
  },
  '.cm-changedText': {
    backgroundColor: 'color-mix(in srgb, var(--success) 30%, transparent)',
  },
  '.cm-deletedChunk .cm-deletedText': {
    backgroundColor: 'color-mix(in srgb, var(--danger) 30%, transparent)',
  },
});

type Props = {
  value: string;
  readOnly?: boolean;
  /** When set, shows the doc as a diff against this text with accept/reject controls per hunk. */
  original?: string;
  onChange: (v: string) => void;
};

export function MarkdownEditor({ value, readOnly, original, onChange }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Rebuilt when the mode changes; `value` syncs in the next effect without losing the cursor.
  // biome-ignore lint/correctness/useExhaustiveDependencies: value is intentionally excluded
  useEffect(() => {
    if (!host.current) return;
    const v = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          basicSetup,
          markdown(),
          theme,
          EditorView.lineWrapping,
          EditorState.readOnly.of(!!readOnly),
          EditorView.editable.of(!readOnly),
          ...(original !== undefined
            ? [unifiedMergeView({ original, mergeControls: true })]
            : []),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) onChangeRef.current(u.state.doc.toString());
          }),
        ],
      }),
    });
    view.current = v;
    return () => v.destroy();
  }, [readOnly, original]);

  useEffect(() => {
    const v = view.current;
    if (v && v.state.doc.toString() !== value)
      v.dispatch({
        changes: { from: 0, to: v.state.doc.length, insert: value },
      });
  }, [value]);

  return (
    <div
      ref={host}
      className="h-full overflow-auto text-sm [&_.cm-editor]:min-h-full"
    />
  );
}
