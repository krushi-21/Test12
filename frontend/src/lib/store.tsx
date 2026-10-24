// Browser-only demo state. Replaced by API calls when the backend is wired up.
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

import { toIst } from "./validation";
import { currentStage } from "./discovery";
import { businesses, founders, launches, type Business, type Founder, type Launch } from "./demo";

export interface DemoUser {
  name: string;
  email: string;
  verified: boolean;
  founderSlug?: string;
}

export interface Collection {
  id: string;
  name: string;
  isPublic: boolean;
  launchSlugs: string[];
}

export interface Notice {
  id: string;
  text: string;
  kind: "launch" | "follow" | "engagement" | "verification" | "ending";
  read: boolean;
  at: string;
  launchSlug?: string;
  businessSlug?: string;
}

export interface Review {
  businessSlug: string;
  overall: number;
  quality: number;
  value: number;
  experience: number;
  recommend: boolean;
  text: string;
}

export type LaunchStatus = "draft" | "published" | "paused" | "archived";
export interface OwnLaunch {
  id: string;
  title: string;
  summary: string;
  businessSlug: string;
  startsAt: string;
  endsAt?: string;
  status: LaunchStatus;
  images: { url: string; alt: string }[];
}

export interface Comment {
  id: string;
  launchSlug: string;
  author: string;
  text: string;
  at: string;
  parentId?: string;
  authorEmail?: string;
  founderSlug?: string;
}

export interface State {
  businessEdits: Business[];
  founderEdits: Founder[];
  deletedBusinesses: string[];
  comments: Comment[];
  ownLaunches: OwnLaunch[];
  user: DemoUser | null;
  follows: string[]; // "founder:slug" | "business:slug" | "category:name"
  likes: string[];
  saves: string[];
  reminders: string[];
  collections: Collection[];
  notifications: Notice[];
  reviews: Review[];
  commentLikes: string[];
  savedPosts: string[];
  savedCollections: string[];
}

export const initial: State = {
  commentLikes: [],
  savedPosts: [],
  savedCollections: [],
  businessEdits: [],
  founderEdits: [],
  deletedBusinesses: [],
  comments: [],
  ownLaunches: [
    {
      id: "kasavu-everyday",
      title: "Kasavu Everyday Collection",
      summary: "Lightweight handloom shirts and stoles for office wear.",
      businessSlug: "kasavu-thread",
      startsAt: "2026-10-20T09:30",
      endsAt: "2026-10-26T21:00",
      status: "published",
      images: [],
    },
    {
      id: "draft-onam",
      title: "Onam 2027 preview",
      summary: "Early look at next year's festive weaves.",
      businessSlug: "kasavu-thread",
      startsAt: "2027-08-01T09:00",
      status: "draft",
      images: [],
    },
  ],
  user: null,
  follows: ["business:deccan-masala-co", "category:Handloom & Textiles"],
  likes: [],
  saves: [],
  reminders: [],
  collections: [
    {
      id: "diwali-gifts",
      name: "Diwali gifting",
      isPublic: true,
      launchSlugs: ["deccan-tasting-box", "kasavu-everyday"],
    },
  ],
  notifications: [
    {
      id: "n1",
      text: "ClinicLoop 1.0 is launching today",
      kind: "launch",
      read: false,
      at: "2026-10-23T05:30:00Z",
      launchSlug: "clinicloop-1-0",
    },
    {
      id: "n2",
      text: "Deccan Masala Co. is trending this week",
      kind: "engagement",
      read: false,
      at: "2026-10-22T12:00:00Z",
      businessSlug: "deccan-masala-co",
    },
    {
      id: "n3",
      text: "Kasavu Everyday Collection ends in 3 days",
      kind: "ending",
      read: true,
      at: "2026-10-21T08:00:00Z",
      launchSlug: "kasavu-everyday",
    },
  ],
  reviews: [],
};

const KEY = "naviraa-demo-v1";

interface Ctx extends State {
  signIn: (user: DemoUser) => void;
  storageError: string;
  set: (fn: (s: State) => State) => void;
  toggle: (
    field:
      | "follows"
      | "likes"
      | "saves"
      | "reminders"
      | "commentLikes"
      | "savedPosts"
      | "savedCollections",
    id: string,
  ) => void;
  notify: (text: string, kind?: Notice["kind"]) => void;
}

const StoreCtx = createContext<Ctx | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>(initial);
  const [storageError, setStorageError] = useState("");
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        if (
          !saved ||
          typeof saved !== "object" ||
          Object.entries(initial).some(
            ([key, value]) =>
              Array.isArray(value) && saved[key] !== undefined && !Array.isArray(saved[key]),
          )
        )
          throw new Error("Invalid preview state");
        setState({ ...initial, ...saved });
      }
    } catch {
      setStorageError(
        "Saved preview data could not be restored. Your session starts with sample data.",
      );
    }
    setReady(true);
  }, []);
  useEffect(() => {
    if (ready) {
      try {
        localStorage.setItem(KEY, JSON.stringify(state));
        setStorageError("");
      } catch {
        setStorageError(
          "Your browser could not save these changes. Free up browser storage before leaving this page.",
        );
      }
    }
  }, [state, ready]);

  const signIn = (user: DemoUser) =>
    setState((s) => (s.user?.email === user.email ? { ...s, user } : { ...initial, user }));
  const set = (fn: (s: State) => State) => setState(fn);
  const toggle: Ctx["toggle"] = (field, id) =>
    setState((s) => ({
      ...s,
      [field]: s[field].includes(id) ? s[field].filter((x) => x !== id) : [...s[field], id],
    }));
  const notify: Ctx["notify"] = (text, kind = "engagement") =>
    setState((s) => {
      if (s.notifications.some((n) => n.text === text)) return s; // dedupe
      return {
        ...s,
        notifications: [
          { id: crypto.randomUUID(), text, kind, read: false, at: new Date().toISOString() },
          ...s.notifications,
        ],
      };
    });

  return (
    <StoreCtx.Provider value={{ ...state, signIn, storageError, set, toggle, notify }}>
      {children}
    </StoreCtx.Provider>
  );
}

export function useStore() {
  const c = useContext(StoreCtx);
  if (!c) throw new Error("useStore outside StoreProvider");
  return c;
}

/** Fixture data merged with preview edits; UI consumers keep their existing props. */
export function useDemo() {
  const store = useStore();
  const allBusinesses = [
    ...businesses.map((b) => store.businessEdits.find((x) => x.slug === b.slug) ?? b),
    ...store.businessEdits.filter((b) => !businesses.some((x) => x.slug === b.slug)),
  ].filter((b) => !store.deletedBusinesses.includes(b.slug));
  const allFounders = [
    ...founders.map((f) => store.founderEdits.find((x) => x.slug === f.slug) ?? f),
    ...store.founderEdits.filter((f) => !founders.some((x) => x.slug === f.slug)),
  ];
  const asLaunch = (l: OwnLaunch): Launch => ({
    slug: l.id,
    title: l.title,
    summary: l.summary,
    businessSlug: l.businessSlug,
    startsAt: toIst(l.startsAt),
    stage: new Date(toIst(l.startsAt)).getTime() > Date.now() ? "Coming Soon" : "Live",
    likes: 0,
    saves: 0,
    comments: 0,
  });
  const allLaunches = [
    ...launches.map((l) => {
      const edit = store.ownLaunches.find((x) => x.id === l.slug);
      return edit
        ? edit.status === "published"
          ? { ...l, ...asLaunch(edit) }
          : null
        : { ...l, stage: currentStage(l) };
    }),
    ...store.ownLaunches
      .filter((l) => l.status === "published" && !launches.some((x) => x.slug === l.id))
      .map(asLaunch),
  ].filter((l): l is Launch => l !== null && allBusinesses.some((b) => b.slug === l.businessSlug));
  return {
    businesses: allBusinesses,
    founders: allFounders,
    launches: allLaunches,
    getBusiness: (slug: string) => allBusinesses.find((b) => b.slug === slug),
    getFounder: (slug: string) => allFounders.find((f) => f.slug === slug),
    getLaunch: (slug: string) => allLaunches.find((l) => l.slug === slug),
  };
}
