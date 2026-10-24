import { toast } from "sonner";

export async function sharePage(path: string, title: string, native = false, browserOnly = false) {
  const url = new URL(path, window.location.origin).href;
  try {
    if (native && navigator.share) {
      await navigator.share({ title, url });
      return;
    }
    if (!navigator.clipboard) throw new Error("Clipboard unavailable");
    await navigator.clipboard.writeText(url);
    toast.success(
      browserOnly ? "Preview link copied — only available in this browser" : "Link copied",
    );
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return;
    toast.error("Couldn't share the link. Copy the address from your browser instead.");
  }
}
