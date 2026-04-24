import { useState } from "react";
import { useLocation } from "wouter";
import { BookMarked, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiUrl } from "@/lib/api";
import { extractGoogleDocId, setGuideOwnerToken } from "@/lib/community-guides";

export default function AddGuidePage() {
  const [, navigate] = useLocation();
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [docUrl, setDocUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const docId = extractGoogleDocId(docUrl);

  const submit = async () => {
    if (!title.trim() || !docId) {
      setError("Add a title and a valid public Google Doc link.");
      return;
    }

    setSaving(true);
    setError(null);
    const ownerToken = crypto.randomUUID();
    try {
      const response = await fetch(apiUrl("/guides"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), author: author.trim(), docUrl: docUrl.trim(), ownerToken }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Could not add guide.");
      setGuideOwnerToken(payload.guide.id, ownerToken);
      navigate(`/guides/${payload.guide.slug}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add guide.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <BookMarked className="w-5 h-5 text-muted-foreground" />
          <h1 className="text-xl font-bold tracking-tight">Add Guide</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Add a public Google Doc and the site will render it with the same guide layout used by Jaza's playthrough guide.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Google Doc Guide</CardTitle>
          <CardDescription>
            The doc must be public or published. Images embedded by Google Docs markdown export are supported.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Guide Title</label>
            <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Example: Mid-game Progression Notes" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Author Name</label>
            <Input value={author} onChange={(event) => setAuthor(event.target.value)} placeholder="Optional" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Google Doc Link</label>
            <Input value={docUrl} onChange={(event) => setDocUrl(event.target.value)} placeholder="https://docs.google.com/document/d/..." />
            <div className="text-xs text-muted-foreground">
              {docId ? "Google Doc detected." : "Use a Google Docs document link."}
            </div>
          </div>

          {error ? <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div> : null}

          <div className="flex flex-wrap gap-2">
            <Button onClick={submit} disabled={saving}>{saving ? "Adding..." : "Add Guide"}</Button>
            {docUrl ? (
              <a href={docUrl} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" className="gap-2">
                  <ExternalLink className="h-4 w-4" />
                  Open Doc
                </Button>
              </a>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
