import { QueryClient } from "@tanstack/react-query";
import { createRouter, rootRouteId } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";

import { routeTree } from "@/routeTree.gen";

// Match routes without running loaders or rendering: loaders may need a server or
// network the test run lacks, and jsdom never loads the stylesheets React waits on.
describe("App routing", () => {
  it.each([
    "/launches",
    "/businesses",
    "/founders",
    "/feed",
    "/explore",
    "/following",
    "/analytics",
    "/map",
    "/upcoming",
    "/trending",
    "/signin",
    "/signup",
    "/verify-email",
    "/forgot-password",
    "/reset-password",
    "/account",
    "/dashboard",
    "/collections",
    "/saved",
    "/notifications",
    "/launches/example",
    "/businesses/example",
    "/founders/example",
    "/dashboard/launch/new",
    "/dashboard/business/new",
    "/c/example",
  ])("matches the canonical frontend path %s", (path) => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });
    expect(router.matchRoutes(path).at(-1)?.routeId).not.toBe(rootRouteId);
  });

  it("matches a page for / instead of falling back to not found", () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });

    const matches = router.matchRoutes("/");

    expect(matches.at(-1)?.routeId).not.toBe(rootRouteId);
  });
});
