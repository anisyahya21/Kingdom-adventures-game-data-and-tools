import React, { useState, useRef } from "react";
import ReactMarkdown from "react-markdown";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function AddGuidePage() {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Helper to insert text at cursor position in textarea
  function insertAtCursor(textarea: HTMLTextAreaElement, text: string) {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const before = textarea.value.substring(0, start);
    const after = textarea.value.substring(end);
    textarea.value = before + text + after;
    textarea.selectionStart = textarea.selectionEnd = start + text.length;
    textarea.focus();
  }

  // Handle image upload
  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      alert("Only image files are allowed.");
      return;
    }
    // Upload to backend
    const formData = new FormData();
    formData.append("image", file);
    try {
      const res = await fetch("/ka/upload-image", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      const url = data.url;
      if (textareaRef.current) {
        insertAtCursor(textareaRef.current, `![${file.name}](${url})\n`);
        setContent(textareaRef.current.value);
      }
    } catch (err) {
      alert("Image upload failed");
    }
  }

  // Table of Contents generator
  function getHeadings(markdown: string) {
    const lines = markdown.split("\n");
    return lines
      .map((line, idx) => {
        const match = line.match(/^(#{1,6})\s+(.*)/);
        if (match) {
          return {
            level: match[1].length,
            text: match[2],
            id: `heading-${idx}-${match[2].toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
          };
        }
        return null;
      })
      .filter(Boolean) as { level: number; text: string; id: string }[];
  }

  const headings = getHeadings(content);

  // Add IDs to headings in preview for anchor links
  const renderers = {
    heading: ({ level, children }: any) => {
      const text = String(children[0]);
      const heading = headings.find(h => h.text === text);
      return React.createElement(
        `h${level}`,
        heading ? { id: heading.id } : {},
        children
      );
    },
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <Card>
        <CardHeader>
          <CardTitle>Add Your Own Guide</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Guide Title</label>
            <Input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Enter a title for your guide"
            />
          </div>
          {/* Table of Contents */}
          {headings.length > 0 && (
            <div className="mb-4 p-2 border rounded bg-muted">
              <div className="font-semibold mb-1 text-sm">Table of Contents</div>
              <ul className="text-xs">
                {headings.map(h => (
                  <li key={h.id} style={{ marginLeft: (h.level - 1) * 16 }}>
                    <a href={`#${h.id}`} className="hover:underline text-primary">
                      {h.text}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium mb-1">Guide Content</label>
            <div className="flex gap-2 mb-2">
              <Input type="file" accept="image/*" onChange={handleImageUpload} />
              <span className="text-xs text-muted-foreground">Upload image (inserts Markdown link)</span>
            </div>
            <textarea
              ref={textareaRef}
              className="w-full border rounded px-2 py-1 min-h-[160px]"
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder="Write your guide here (Markdown supported)"
            />
          </div>
          {/* Markdown Preview with heading IDs for ToC */}
          <div className="border rounded p-2 bg-background">
            <div className="font-semibold text-xs mb-1">Preview</div>
            <ReactMarkdown components={renderers}>{content}</ReactMarkdown>
          </div>
          <button
            className="bg-primary text-white px-4 py-2 rounded disabled:opacity-50"
            disabled={!title || !content}
            onClick={() => alert("Guide submission coming soon!")}
          >
            Submit Guide
          </button>
        </CardContent>
      </Card>
    </div>
  );
}
