const source = new URL("https://jazas.gitbook.io/kingdom-adventurers/");

async function fetchText(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(url + " returned " + response.status);
  return response.text();
}

function decodeEntities(text) {
  return text.replace(/&#x20;|&nbsp;/gi, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"');
}

export async function importJazaGitBook() {
  const index = await fetchText(new URL("llms.txt", source));
  const chapters = [...index.matchAll(/^\s*-\s+\[[^\]]+\]\((https:\/\/[^)\s]+\.md)\)/gm)]
    .map((match) => new URL(match[1]))
    .filter((url) => url.origin === source.origin && url.pathname.startsWith(source.pathname)
      && !url.pathname.endsWith("/dummy-page.md"));
  if (!chapters.some((url) => url.pathname.endsWith("/survey.md"))) {
    throw new Error("GitBook index is missing the Survey chapter");
  }

  const documents = [];
  for (let offset = 0; offset < chapters.length; offset += 8) {
    documents.push(...await Promise.all(chapters.slice(offset, offset + 8).map(fetchText)));
  }

  const images = [];
  function imageReference(rawUrl) {
    // GitBook escapes ampersands in Markdown image destinations.
    const url = new URL(decodeEntities(rawUrl).replace(/\\&/g, "&"), source);
    if (url.protocol !== "https:") throw new Error("Unsupported image URL in GitBook");
    const id = "image" + (images.length + 1);
    images.push("[" + id + "]: <" + url.href + ">");
    return "\n![][" + id + "]\n";
  }

  const sections = documents.map((document, index) => {
    const chapter = chapters[index];
    const start = document.search(/^#\s+/m);
    if (start < 0) throw new Error("Missing chapter heading at " + chapter);
    return document.slice(start)
      .replace(/<figure>\s*<img\b[^>]*\bsrc="([^"]+)"[^>]*>\s*<figcaption>([\s\S]*?)<\/figcaption>\s*<\/figure>/gi,
        (_, url, caption) => imageReference(url) + caption.trim() + "\n")
      .replace(/!\[[^\]]*\]\(([^)\s]+)\)/g, (_, url) => imageReference(url))
      .replace(/<\/?(?:mark|p)\b[^>]*>/gi, "")
      .replace(/^\{% end?[^%]*%\}\s*$/gm, "")
      .replace(/^\{%[^%]*%\}\s*$/gm, "")
      .replace(/^#{2,6}\s+(.+)$/gm, "**$1**")
      .replace(/\]\((\/kingdom-adventurers\/[^)\s]+|https:\/\/jazas\.gitbook\.io\/kingdom-adventurers\/[^)\s]+)\)/g,
        (_, href) => "](" + new URL(href, source).href.replace(/\.md(?=#|$)/, "") + ")")
      .replace(/&#x20;|&nbsp;/gi, " ")
      .replace(/[ \t]+$/gm, "")
      .trim();
  });
  if (!images.length || !sections.some((section) => /^# Survey\s*$/m.test(section))) {
    throw new Error("GitBook import is missing Survey or guide images");
  }
  return sections.join("\n\n") + "\n\n" + images.join("\n") + "\n";
}
