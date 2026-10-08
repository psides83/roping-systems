import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ruleTextStyle } from "@/lib/rule-text-style";

export function RuleText({ text }: { text: string }) {
  return <div className={ruleTextStyle}>
    <Markdown remarkPlugins={[remarkGfm]} skipHtml allowedElements={["p", "strong", "em", "del", "ul", "ol", "li", "a", "br", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "hr", "pre", "code"]} unwrapDisallowed components={{ a: ({ children, href }) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a> }}>{text}</Markdown>
  </div>;
}
