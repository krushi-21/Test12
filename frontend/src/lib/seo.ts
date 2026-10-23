export const seo = (title: string, description: string, noindex = false) => ({
  meta: [
    { title: `${title} — Naviraa` },
    { name: "description", content: description },
    { property: "og:title", content: `${title} — Naviraa` },
    { property: "og:description", content: description },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
    ...(noindex ? [{ name: "robots", content: "noindex" }] : []),
  ],
});
