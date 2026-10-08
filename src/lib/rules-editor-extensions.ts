import { Extension } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "@tiptap/markdown";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";

export function isRuleLink(value: string) {
  try { return ["https:", "http:", "mailto:"].includes(new URL(value).protocol); }
  catch { return false; }
}

export function rulesEditorExtensions(onLimit: () => void = () => {}) {
  return [
    StarterKit.configure({ underline: false, link: false }),
    Link.configure({ openOnClick: false, defaultProtocol: "https", isAllowedUri: isRuleLink }),
    Markdown,
    Placeholder.configure({ placeholder: "Write your rules…" }),
    Extension.create({
      name: "rulesTextLimit",
      addProseMirrorPlugins() {
        const editor = this.editor;
        return [new Plugin({ filterTransaction(transaction) {
          if (!transaction.docChanged) return true;
          if (transaction.getMeta("rulesSource")) return true;
          if (editor.markdown!.serialize(transaction.doc.toJSON()).length <= 20000) return true;
          onLimit();
          return false;
        } })];
      },
    }),
  ];
}
