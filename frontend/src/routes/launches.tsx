import { useDemo } from "@/lib/store";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { LaunchCard, PageHeading } from "@/components/site";
import { type Stage } from "@/lib/demo";

export const Route = createFileRoute("/launches")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "Launches — Naviraa" },
      {
        name: "description",
        content:
          "New products, services and businesses launching across India, from coming soon to established.",
      },
      { property: "og:title", content: "Launches — Naviraa" },
      {
        property: "og:description",
        content: "New products, services and businesses launching across India.",
      },
    ],
  }),
  component: Launches,
});

const stages: (Stage | "All")[] = [
  "All",
  "Coming Soon",
  "Launching Today",
  "Live",
  "Trending",
  "Established",
];

function Launches() {
  const { businesses, founders, launches } = useDemo();
  const [stage, setStage] = useState<Stage | "All">("All");
  const list = stage === "All" ? launches : launches.filter((l) => l.stage === stage);
  return (
    <>
      <PageHeading eyebrow="Launches" title="Fresh from Indian founders">
        Follow every launch from the countdown to its anniversary.
      </PageHeading>
      <div className="mx-auto max-w-6xl px-4">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/upcoming"
            className="mr-2 rounded-full border border-primary px-4 py-2 text-sm font-medium text-primary"
          >
            Calendar & reminders →
          </Link>
          {stages.map((s) => (
            <button
              key={s}
              onClick={() => setStage(s)}
              className={`rounded-full px-4 py-2 text-sm font-medium ${stage === s ? "bg-foreground text-background" : "bg-card text-muted-foreground hover:text-foreground"}`}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((l) => (
            <LaunchCard key={l.slug} launch={l} />
          ))}
        </div>
        {list.length === 0 && (
          <p className="mt-8 text-muted-foreground">No launches in this stage yet.</p>
        )}
      </div>
    </>
  );
}
