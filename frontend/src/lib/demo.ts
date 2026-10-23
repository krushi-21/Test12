// Bundled synthetic fixtures for the static, read-only preview. All records are fictional.
// Placeholder imagery — each business cover and founder portrait is an AI-generated stand-in, not a real photo.
import kasavuCover from "@/assets/covers/kasavu-thread.jpg";
import neelCover from "@/assets/covers/neel-studio.jpg";
import deccanCover from "@/assets/covers/deccan-masala-co.jpg";
import clinicloopCover from "@/assets/covers/clinicloop.jpg";
import vanaCover from "@/assets/covers/vana-botanics.jpg";
import byteCover from "@/assets/covers/byte-bachpan.jpg";
import meeraPhoto from "@/assets/founders/meera-iyer.jpg";
import arjunPhoto from "@/assets/founders/arjun-rathore.jpg";
import sanaPhoto from "@/assets/founders/sana-qureshi.jpg";
import rohanPhoto from "@/assets/founders/rohan-desai.jpg";
import kavyaPhoto from "@/assets/founders/kavya-nair.jpg";
import devPhoto from "@/assets/founders/dev-malhotra.jpg";
export type Mode = "online" | "physical" | "hybrid";
export type Stage = "Coming Soon" | "Launching Today" | "Live" | "Trending" | "Established";

export interface Founder {
  slug: string;
  name: string;
  pronouns?: string;
  city: string;
  bio: string;
  interests: string[];
  initials: string;
  photo?: string;
  publicBrands?: string[];
}

export interface Product {
  name: string;
  priceInr?: number;
  url: string;
}

export interface Business {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  category: string;
  city: string;
  area: string;
  state: string;
  mode: Mode;
  founderSlug: string;
  verified: boolean;
  openNow: boolean;
  priceRange: "₹" | "₹₹" | "₹₹₹";
  rating: number;
  reviews: number;
  likes: number;
  saves: number;
  launchedDaysAgo: number;
  website: string;
  whatsapp?: string;
  phone?: string;
  email?: string;
  hours: string[];
  products: Product[];
  hue: number;
  cover?: string;
  latitude?: number;
  longitude?: number;
}

export interface Launch {
  slug: string;
  title: string;
  summary: string;
  businessSlug: string;
  stage: Stage;
  startsAt: string;
  likes: number;
  saves: number;
  comments: number;
}

export const categories = [
  "Handloom & Textiles",
  "Food & Beverage",
  "Wellness",
  "Home & Decor",
  "Software",
  "Education",
  "Beauty",
  "Crafts",
];

export const cities = ["Bengaluru", "Mumbai", "Jaipur", "Pune", "Kochi", "Delhi", "Hyderabad", "Ahmedabad"];

export const founders: Founder[] = [
  { slug: "meera-iyer", name: "Meera Iyer", pronouns: "she/her", city: "Kochi", initials: "MI", bio: "Third-generation weaver bringing Kasavu into everyday wear.", interests: ["Handloom", "Natural dyes", "Slow fashion"] },
  { slug: "arjun-rathore", name: "Arjun Rathore", pronouns: "he/him", city: "Jaipur", initials: "AR", bio: "Blue pottery revivalist and studio owner.", interests: ["Ceramics", "Design", "Heritage"] },
  { slug: "sana-qureshi", name: "Sana Qureshi", pronouns: "she/her", city: "Hyderabad", initials: "SQ", bio: "Building small-batch spice blends from Deccan family recipes.", interests: ["Food", "Sourcing", "Packaging"] },
  { slug: "rohan-desai", name: "Rohan Desai", city: "Pune", initials: "RD", bio: "Software for neighbourhood clinics. Ex-hospital ops.", interests: ["SaaS", "Healthcare", "UX"] },
  { slug: "kavya-nair", name: "Kavya Nair", pronouns: "she/her", city: "Bengaluru", initials: "KN", bio: "Ayurvedic skincare, formulated in small batches.", interests: ["Wellness", "Botanicals"] },
  { slug: "dev-malhotra", name: "Dev Malhotra", pronouns: "he/him", city: "Delhi", initials: "DM", bio: "Weekend coding bootcamps for school kids.", interests: ["Education", "Robotics"] },
];

const founderPhotos: Record<string, string> = {
  "meera-iyer": meeraPhoto,
  "arjun-rathore": arjunPhoto,
  "sana-qureshi": sanaPhoto,
  "rohan-desai": rohanPhoto,
  "kavya-nair": kavyaPhoto,
  "dev-malhotra": devPhoto,
};
founders.forEach((f) => { const p = founderPhotos[f.slug]; if (p) f.photo = p; });

const week = ["Mon 10–7", "Tue 10–7", "Wed 10–7", "Thu 10–7", "Fri 10–8", "Sat 10–8", "Sun Closed"];

export const businesses: Business[] = [
  { slug: "kasavu-thread", name: "Kasavu Thread", tagline: "Kerala handloom for every day", description: "Handwoven Kasavu sarees, stoles and shirts made with weaver cooperatives around Balaramapuram.", category: "Handloom & Textiles", city: "Kochi", area: "Fort Kochi", state: "Kerala", mode: "hybrid", founderSlug: "meera-iyer", verified: true, openNow: true, priceRange: "₹₹", rating: 4.8, reviews: 126, likes: 2140, saves: 860, launchedDaysAgo: 3, website: "https://example.com/kasavu", whatsapp: "+91 90000 00001", phone: "+91 90000 00001", email: "hello@example.com", hours: week, hue: 40, products: [{ name: "Classic Kasavu saree", priceInr: 6800, url: "https://example.com/kasavu/saree" }, { name: "Gold border stole", priceInr: 1450, url: "https://example.com/kasavu/stole" }, { name: "Mundu shirt", priceInr: 1900, url: "https://example.com/kasavu/shirt" }] },
  { slug: "neel-studio", name: "Neel Studio", tagline: "Jaipur blue pottery, reimagined", description: "Quartz-based blue pottery tableware and tiles, hand-painted in our Amer Road studio.", category: "Crafts", city: "Jaipur", area: "Amer Road", state: "Rajasthan", mode: "physical", founderSlug: "arjun-rathore", verified: true, openNow: false, priceRange: "₹₹₹", rating: 4.6, reviews: 88, likes: 1720, saves: 1020, launchedDaysAgo: 18, website: "https://example.com/neel", phone: "+91 90000 00002", hours: week, hue: 230, products: [{ name: "Dinner plate set", priceInr: 4200, url: "https://example.com/neel/plates" }, { name: "Hand-painted tile", priceInr: 650, url: "https://example.com/neel/tile" }] },
  { slug: "deccan-masala-co", name: "Deccan Masala Co.", tagline: "Family recipes, small batches", description: "Stone-ground spice blends from Hyderabadi kitchens. Biryani, haleem and pickle masalas.", category: "Food & Beverage", city: "Hyderabad", area: "Banjara Hills", state: "Telangana", mode: "online", founderSlug: "sana-qureshi", verified: true, openNow: true, priceRange: "₹", rating: 4.9, reviews: 302, likes: 3410, saves: 1490, launchedDaysAgo: 1, website: "https://example.com/deccan", whatsapp: "+91 90000 00003", email: "orders@example.com", hours: week, hue: 20, products: [{ name: "Biryani masala", priceInr: 240, url: "https://example.com/deccan/biryani" }, { name: "Haleem blend", priceInr: 280, url: "https://example.com/deccan/haleem" }, { name: "Tasting box", priceInr: 899, url: "https://example.com/deccan/box" }] },
  { slug: "clinicloop", name: "ClinicLoop", tagline: "Appointments for neighbourhood clinics", description: "WhatsApp-first booking and reminders for small clinics. Setup in a day.", category: "Software", city: "Pune", area: "Baner", state: "Maharashtra", mode: "online", founderSlug: "rohan-desai", verified: false, openNow: true, priceRange: "₹₹", rating: 4.4, reviews: 41, likes: 980, saves: 410, launchedDaysAgo: 0, website: "https://example.com/clinicloop", email: "demo@example.com", hours: week, hue: 140, products: [{ name: "Starter plan (monthly)", priceInr: 999, url: "https://example.com/clinicloop/pricing" }] },
  { slug: "vana-botanics", name: "Vana Botanics", tagline: "Ayurvedic skincare, honestly made", description: "Cold-processed oils and ubtans using herbs sourced from Western Ghats farms.", category: "Beauty", city: "Bengaluru", area: "Indiranagar", state: "Karnataka", mode: "hybrid", founderSlug: "kavya-nair", verified: true, openNow: true, priceRange: "₹₹", rating: 4.7, reviews: 154, likes: 2560, saves: 1300, launchedDaysAgo: 9, website: "https://example.com/vana", whatsapp: "+91 90000 00005", hours: week, hue: 110, products: [{ name: "Kumkumadi face oil", priceInr: 1250, url: "https://example.com/vana/oil" }, { name: "Ubtan cleanser", priceInr: 540, url: "https://example.com/vana/ubtan" }] },
  { slug: "byte-bachpan", name: "Byte Bachpan", tagline: "Weekend coding for curious kids", description: "Hands-on robotics and coding batches for ages 8–14 in South Delhi.", category: "Education", city: "Delhi", area: "Hauz Khas", state: "Delhi", mode: "physical", founderSlug: "dev-malhotra", verified: true, openNow: false, priceRange: "₹₹", rating: 4.5, reviews: 63, likes: 760, saves: 330, launchedDaysAgo: 45, website: "https://example.com/byte", phone: "+91 90000 00006", hours: week, hue: 280, products: [{ name: "8-week robotics batch", priceInr: 7500, url: "https://example.com/byte/robotics" }] },
];

const businessCovers: Record<string, string> = {
  "kasavu-thread": kasavuCover,
  "neel-studio": neelCover,
  "deccan-masala-co": deccanCover,
  clinicloop: clinicloopCover,
  "vana-botanics": vanaCover,
  "byte-bachpan": byteCover,
};
businesses.forEach((b) => { const c = businessCovers[b.slug]; if (c) b.cover = c; });

export const launches: Launch[] = [
  { slug: "deccan-tasting-box", title: "The Deccan Tasting Box", summary: "Six heirloom blends in one gift-ready box, launching for Diwali.", businessSlug: "deccan-masala-co", stage: "Trending", startsAt: "2026-10-22T09:00:00Z", likes: 812, saves: 340, comments: 56 },
  { slug: "clinicloop-1-0", title: "ClinicLoop 1.0", summary: "WhatsApp booking for clinics — free for the first 100 clinics.", businessSlug: "clinicloop", stage: "Launching Today", startsAt: "2026-10-23T05:30:00Z", likes: 214, saves: 98, comments: 31 },
  { slug: "kasavu-everyday", title: "Kasavu Everyday Collection", summary: "Lightweight handloom shirts and stoles for office wear.", businessSlug: "kasavu-thread", stage: "Live", startsAt: "2026-10-20T04:00:00Z", likes: 640, saves: 290, comments: 44 },
  { slug: "vana-winter-ritual", title: "Winter Ritual Kit", summary: "A three-step Ayurvedic routine for dry Bengaluru winters.", businessSlug: "vana-botanics", stage: "Coming Soon", startsAt: "2026-11-02T04:30:00Z", likes: 180, saves: 210, comments: 12 },
  { slug: "neel-tiles", title: "Neel Heritage Tiles", summary: "Hand-painted blue pottery tiles for kitchens and courtyards.", businessSlug: "neel-studio", stage: "Live", startsAt: "2026-10-05T04:30:00Z", likes: 530, saves: 410, comments: 22 },
  { slug: "byte-robotics", title: "Robotics Winter Batch", summary: "Eight Saturdays, one robot per kid. Seats are limited.", businessSlug: "byte-bachpan", stage: "Established", startsAt: "2026-09-08T04:30:00Z", likes: 300, saves: 120, comments: 18 },
];

export const getBusiness = (slug: string) => businesses.find((b) => b.slug === slug);
export const getFounder = (slug: string) => founders.find((f) => f.slug === slug);
export const getLaunch = (slug: string) => launches.find((l) => l.slug === slug);
export const formatInr = (n: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

// Owner-supplied coordinates (no geocoding).
export const coords: Record<string, [number, number]> = {
  "kasavu-thread": [9.9658, 76.2421],
  "neel-studio": [26.9855, 75.8513],
  "deccan-masala-co": [17.4126, 78.4482],
  clinicloop: [18.559, 73.7868],
  "vana-botanics": [12.9784, 77.6408],
  "byte-bachpan": [28.5494, 77.2001],
};

export const cityCentres: Record<string, [number, number]> = {
  Bengaluru: [12.97, 77.59], Mumbai: [19.08, 72.88], Jaipur: [26.91, 75.79], Pune: [18.52, 73.86],
  Kochi: [9.93, 76.27], Delhi: [28.61, 77.21], Hyderabad: [17.39, 78.49], Ahmedabad: [23.02, 72.57],
};

// Synthetic private analytics for the founder dashboard.
export const analyticsDaily = Array.from({ length: 30 }, (_, i) => ({
  day: `Oct ${i + 1}`,
  visits: Math.round(120 + 80 * Math.sin(i / 3) + i * 9),
  clicks: Math.round(30 + 20 * Math.cos(i / 4) + i * 3),
  saves: Math.round(8 + 6 * Math.sin(i / 2) + i),
}));

export const trafficSources = [
  { source: "Naviraa feed", value: 42 },
  { source: "Search", value: 23 },
  { source: "Shared links", value: 18 },
  { source: "Collections", value: 11 },
  { source: "Direct", value: 6 },
];
