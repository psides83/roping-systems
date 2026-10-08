import Markdown from "react-markdown";

export function RuleText({ text }: { text: string }) {
  return <div className="break-words text-sm leading-7 text-[#526058] [&_p]:mb-3 [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:mb-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_a]:font-semibold [&_a]:text-[var(--brand-accent-strong)] [&_a]:underline [&_strong]:text-[#17201c]">
    <Markdown skipHtml allowedElements={["p", "strong", "em", "ul", "ol", "li", "a", "br"]} unwrapDisallowed components={{ a: ({ children, href }) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a> }}>{text}</Markdown>
  </div>;
}
