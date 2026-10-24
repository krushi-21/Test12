import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { CommentSection } from "@/components/comments";
import { StoreProvider, useStore } from "@/lib/store";
import { Gallery } from "@/components/discovery-ui";
import type { ReactNode } from "react";
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));
function SignIn() {
  const { signIn } = useStore();
  return (
    <button
      onClick={() =>
        signIn({
          name: "Test founder",
          email: "preview@example.org",
          verified: true,
          founderSlug: "meera-iyer",
        })
      }
    >
      Preview sign in
    </button>
  );
}
afterEach(() => {
  cleanup();
  localStorage.clear();
});
describe("Shared comment operations", () => {
  it("posts a single root, persists a reply, and allows comment likes", async () => {
    render(
      <StoreProvider>
        <SignIn />
        <CommentSection launchSlug="new-launch" ownerSlug="meera-iyer" />
      </StoreProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Preview sign in" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Your comment" }), {
      target: { value: "A new comment" },
    });
    const post = screen.getByRole("button", { name: "Post comment" });
    fireEvent.click(post);
    fireEvent.click(post);
    await screen.findByText("A new comment");
    expect(screen.getAllByText("A new comment")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Reply" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Your reply" }), {
      target: { value: "A nested reply" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Post reply" }));
    await screen.findByText("A nested reply");
    fireEvent.click(
      screen.getAllByRole("button", { name: "Like comment by Test founder" })[0] as HTMLElement,
    );
    await waitFor(() => {
      const state = JSON.parse(localStorage.getItem("naviraa-demo-v1") ?? "{}");
      expect(state.comments).toHaveLength(2);
      expect(
        state.comments.find((c: { text: string }) => c.text === "A nested reply").parentId,
      ).toBe(state.comments.find((c: { text: string }) => c.text === "A new comment").id);
      expect(state.commentLikes).toHaveLength(1);
    });
  });
  it("moves through available uploaded media", () => {
    render(
      <Gallery
        label="Launch media"
        images={[
          { url: "/a.jpg", alt: "First product" },
          { url: "/b.jpg", alt: "Second product" },
        ]}
      />,
    );
    expect(screen.getByAltText("First product").getAttribute("src")).toBe("/a.jpg");
    fireEvent.click(screen.getByRole("button", { name: "Next image of Launch media" }));
    expect(screen.getByAltText("Second product").getAttribute("src")).toBe("/b.jpg");
    fireEvent.click(screen.getByRole("button", { name: "Previous image of Launch media" }));
    expect(screen.getByAltText("First product").getAttribute("src")).toBe("/a.jpg");
  });
});
