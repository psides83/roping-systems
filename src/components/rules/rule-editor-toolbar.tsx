"use client";

import { useState } from "react";
import { useEditorState, type Editor } from "@tiptap/react";
import { Bold, Italic, Strikethrough, List, ListOrdered, Quote, Minus, Code, SquareCode, Link as LinkIcon, Unlink, Undo2, Redo2, RemoveFormatting, Check, X } from "lucide-react";
import { isRuleLink } from "@/lib/rules-editor-extensions";

export function RuleEditorToolbar({ editor, disabled }: { editor: Editor; disabled: boolean }) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const state = useEditorState({ editor, selector: ({ editor }) => ({
    bold: editor.isActive("bold"), italic: editor.isActive("italic"), strike: editor.isActive("strike"), bullet: editor.isActive("bulletList"), ordered: editor.isActive("orderedList"), quote: editor.isActive("blockquote"), code: editor.isActive("code"), codeBlock: editor.isActive("codeBlock"), link: editor.isActive("link"), undo: editor.can().undo(), redo: editor.can().redo(), heading: editor.getAttributes("heading").level ?? 0,
  }) });
  const tools = [
    { name: "Bold", icon: Bold, active: state.bold, run: () => editor.chain().focus().toggleBold().run() },
    { name: "Italic", icon: Italic, active: state.italic, run: () => editor.chain().focus().toggleItalic().run() },
    { name: "Strikethrough", icon: Strikethrough, active: state.strike, run: () => editor.chain().focus().toggleStrike().run() },
    { name: "Bulleted list", icon: List, active: state.bullet, run: () => editor.chain().focus().toggleBulletList().run() },
    { name: "Numbered list", icon: ListOrdered, active: state.ordered, run: () => editor.chain().focus().toggleOrderedList().run() },
    { name: "Quote", icon: Quote, active: state.quote, run: () => editor.chain().focus().toggleBlockquote().run() },
    { name: "Divider", icon: Minus, run: () => editor.chain().focus().setHorizontalRule().run() },
    { name: "Inline code", icon: Code, active: state.code, run: () => editor.chain().focus().toggleCode().run() },
    { name: "Code block", icon: SquareCode, active: state.codeBlock, run: () => editor.chain().focus().toggleCodeBlock().run() },
    { name: "Link", icon: LinkIcon, active: state.link, run: () => { setUrl(editor.getAttributes("link").href ?? ""); setError(""); setLinkOpen(true); } },
    { name: "Remove link", icon: Unlink, unavailable: !state.link, run: () => editor.chain().focus().extendMarkRange("link").unsetLink().run() },
    { name: "Clear formatting", icon: RemoveFormatting, run: () => editor.chain().focus().unsetAllMarks().clearNodes().run() },
    { name: "Undo", icon: Undo2, unavailable: !state.undo, run: () => editor.chain().focus().undo().run() },
    { name: "Redo", icon: Redo2, unavailable: !state.redo, run: () => editor.chain().focus().redo().run() },
  ];
  function applyLink() {
    const href = url.trim();
    if (!isRuleLink(href)) { setError("Use an https://, http:// or mailto: link."); return; }
    if (editor.state.selection.empty && !state.link) editor.chain().focus().insertContent({ type: "text", text: href, marks: [{ type: "link", attrs: { href } }] }).run();
    else editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
    setLinkOpen(false);
  }
  return <div className="border-b border-[#dfe4e1] bg-[#f7f8f7] p-1.5">
    <div className="flex flex-wrap items-center gap-0.5" role="group" aria-label="Text formatting">
      <select aria-label="Text style" disabled={disabled} value={state.heading} onChange={(event) => { const level = Number(event.target.value); if (!level) editor.chain().focus().setParagraph().run(); else editor.chain().focus().setHeading({ level: level as 1 | 2 | 3 | 4 | 5 | 6 }).run(); }} className="mr-1 h-10 max-w-36 rounded-md border border-[#ccd4d0] bg-white px-2 text-xs font-semibold">
        <option value={0}>Paragraph</option>{[1, 2, 3, 4, 5, 6].map((level) => <option key={level} value={level}>Heading {level}</option>)}
      </select>
      {tools.map(({ name, icon: Icon, active, unavailable, run }) => <button key={name} type="button" title={name} aria-label={name} aria-pressed={active} disabled={disabled || unavailable} onMouseDown={(event) => event.preventDefault()} onClick={run} className={`grid h-10 w-10 shrink-0 place-items-center rounded-md disabled:opacity-35 ${active ? "bg-[#dfe4e1] text-[#17201c]" : "text-[#526058] hover:bg-[#e7ebe8]"}`}><Icon size={17} /></button>)}
    </div>
    {linkOpen && <div className="mt-2 border-t border-[#dfe4e1] p-2" onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); setLinkOpen(false); editor.commands.focus(); } }}>
      <label className="text-xs font-semibold">Link address<input autoFocus disabled={disabled} type="url" value={url} onChange={(event) => setUrl(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); applyLink(); } }} className="mt-1 block h-10 w-full max-w-md rounded-md border border-[#ccd4d0] bg-white px-3 text-sm" /></label>
      <div className="mt-2 flex gap-2"><button type="button" disabled={disabled} onClick={applyLink} className="inline-flex h-10 items-center gap-2 rounded-md border border-[#ccd4d0] bg-white px-3 text-xs font-semibold"><Check size={16} />Apply link</button><button type="button" aria-label="Cancel link" title="Cancel link" onClick={() => setLinkOpen(false)} className="grid h-10 w-10 place-items-center rounded-md border border-[#ccd4d0]"><X size={16} /></button></div>
      {error && <p role="alert" className="mt-2 text-xs text-rose-800">{error}</p>}
    </div>}
  </div>;
}
