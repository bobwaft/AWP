import { markdown } from '@codemirror/lang-markdown';
import { unifiedMergeView } from '@codemirror/merge';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { basicSetup } from 'codemirror';
import { useEffect, useRef } from 'react';

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
