import Markdown from 'react-markdown';

// Assistant messages: Markdown without raw HTML (react-markdown's default). Links are inert
// so a click can never navigate the webview; the target stays visible as a tooltip.
export function ChatMarkdown({ text }: { text: string }) {
  return (
    <div className="flex flex-col gap-2 [&_code]:rounded-sm [&_code]:bg-bg-3 [&_code]:px-1 [&_code]:font-mono [&_code]:text-xs [&_li]:ml-5 [&_li]:list-disc [&_ol>li]:list-decimal [&_pre]:overflow-auto [&_pre]:rounded-sm [&_pre]:bg-bg-3 [&_pre]:p-2 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_strong]:font-semibold">
      <Markdown
        components={{
          a: ({ href, children }) => (
            <span title={href} className="text-accent underline">
              {children}
            </span>
          ),
        }}
      >
        {text}
      </Markdown>
    </div>
  );
}
