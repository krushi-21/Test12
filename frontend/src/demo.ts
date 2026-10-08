import type { BrandPublic, CategoryOption, FounderPublic, LaunchCardData } from './types'

export const DEMO_CATEGORIES: CategoryOption[] = [
  ['home-living', 'Home & Living'],
  ['food-beverage', 'Food & Beverage'],
  ['beauty-care', 'Beauty & Personal Care'],
  ['fashion-accessories', 'Fashion & Accessories'],
  ['community', 'Community & Social'],
  ['arts-crafts', 'Arts & Crafts'],
].map(([id, name]) => ({ id, name, slug: id }))

const sampleImage = (url: string, altText: string) => ({ url, altText })

export const DEMO_LAUNCHES: LaunchCardData[] = [
  {
    id: 'sample-launch-kala', slug: 'kala-clay-monsoon-objects', title: 'Objects that bring the monsoon home', launchType: 'product',
    category: 'Home & Living', summary: 'Hand-thrown pieces inspired by the first rain on red earth.',
    story: 'A fictional Jaipur ceramics studio introduces a small collection of hand-finished home objects. Every business, person, place, story, and interaction shown here is synthetic sample content.',
    images: [sampleImage('/images/launch-craft.webp', 'Synthetic sample image of a craftsperson shaping a terracotta vessel')],
    brand: { id: 'sample-brand-kala', slug: 'kala-clay-studio', name: 'Kala Clay Studio', logoUrl: '/images/launch-craft.webp', category: 'Home & Living', description: 'A fictional ceramics studio making small-batch objects for everyday rituals.', tagline: 'Clay, made personal.', city: 'Jaipur', state: 'Rajasthan' },
    founders: [{ id: 'sample-founder-ananya', displayName: 'Ananya Mehta', role: 'Fictional founder' }], location: { city: 'Jaipur', state: 'Rajasthan' },
  },
  {
    id: 'sample-launch-mitti', slug: 'mitti-and-more-cold-pressed', title: 'A little more goodness in every jar', launchType: 'business',
    category: 'Food & Beverage', summary: 'Fictional pantry staples, sourced close to home.',
    story: 'This sample story describes an imaginary pantry brand working with fictional farms across Maharashtra. It is not a real product or business claim.',
    images: [sampleImage('/images/launch-saffron.jpg', 'Synthetic sample image of small-batch pantry products')],
    brand: { id: 'sample-brand-mitti', slug: 'mitti-and-more', name: 'Mitti & More', logoUrl: '/images/launch-saffron.jpg', category: 'Food & Beverage', description: 'A fictional pantry brand for the synthetic preview.', tagline: 'Good things grow close.', city: 'Pune', state: 'Maharashtra' },
    founders: [{ id: 'sample-founder-devika', displayName: 'Devika Rao', role: 'Fictional founder' }], location: { city: 'Pune', state: 'Maharashtra' },
  },
  {
    id: 'sample-launch-nila', slug: 'nila-botanics-skin-oil', title: 'The quiet ritual of a good skin day', launchType: 'product',
    category: 'Beauty & Personal Care', summary: 'Plant-led skin oils made for the everyday, not the algorithm.',
    story: 'An imaginary skincare studio in Kochi introduces a fictional botanical collection. No products are for sale in this preview.',
    images: [
      sampleImage('/images/launch-derma.jpg', 'Synthetic sample image of botanical oils and fresh herbs'),
      sampleImage('/images/launch-atelier.jpg', 'Synthetic sample image of skincare products displayed on studio shelves'),
    ],
    brand: { id: 'sample-brand-nila', slug: 'nila-botanics', name: 'Nila Botanics', logoUrl: '/images/launch-derma.jpg', category: 'Beauty & Personal Care', description: 'A fictional, small-batch skincare studio in the demo collection.', tagline: 'A softer kind of skincare.', city: 'Kochi', state: 'Kerala' },
    founders: [{ id: 'sample-founder-meher', displayName: 'Meher Iqbal', role: 'Fictional founder' }], location: { city: 'Kochi', state: 'Kerala' },
  },
  {
    id: 'sample-launch-rangrez', slug: 'rangrez-repairable-textiles', title: 'Wear it often. Keep it longer.', launchType: 'product',
    category: 'Fashion & Accessories', summary: 'Everyday cotton pieces with repair patches in the box.',
    story: 'This fictional Ahmedabad textile studio is part of the synthetic demo only. Its products, makers, and launch details are illustrative.',
    images: [sampleImage('/images/launch-textile.jpg', 'Synthetic sample image of hands stitching a botanical textile design')],
    brand: { id: 'sample-brand-rangrez', slug: 'rangrez-studio', name: 'Rangrez Studio', logoUrl: '/images/launch-textile.jpg', category: 'Fashion & Accessories', description: 'A fictional textile studio exploring repair and everyday wear.', tagline: 'Made to be mended.', city: 'Ahmedabad', state: 'Gujarat' },
    founders: [{ id: 'sample-founder-priya', displayName: 'Priya Shah', role: 'Fictional founder' }], location: { city: 'Ahmedabad', state: 'Gujarat' },
  },
  {
    id: 'sample-launch-aangan', slug: 'aangan-community-gardens', title: 'A small patch of green, shared by all', launchType: 'service',
    category: 'Community & Social', summary: 'Imaginary neighbourhood garden kits and weekend growing circles.',
    story: 'A fictional Bengaluru community project imagines ways neighbours might grow together. This is not a real service.',
    images: [sampleImage('/images/launch-home.jpg', 'Synthetic sample image of seasonal produce at a neighbourhood market')],
    brand: { id: 'sample-brand-aangan', slug: 'aangan-grows', name: 'Aangan Grows', logoUrl: '/images/launch-home.jpg', category: 'Community & Social', description: 'A fictional community-gardening idea for the preview.', tagline: 'Grow where you are.', city: 'Bengaluru', state: 'Karnataka' },
    founders: [{ id: 'sample-founder-rizwan', displayName: 'Rizwan Ali', role: 'Fictional co-founder' }, { id: 'sample-founder-kavya', displayName: 'Kavya Sen', role: 'Fictional co-founder' }], location: { city: 'Bengaluru', state: 'Karnataka' },
  },
  {
    id: 'sample-launch-karigar', slug: 'karigar-market-maker-tools', title: 'A better way to find your next maker', launchType: 'service',
    category: 'Arts & Crafts', summary: 'A fictional discovery directory for independent makers and studios.',
    story: 'This imaginary directory is a synthetic example and has no real listings, users, or contact destinations.',
    images: [sampleImage('/images/launch-craft.webp', 'Synthetic sample image of artisans shaping objects by hand')],
    brand: { id: 'sample-brand-karigar', slug: 'karigar-market', name: 'Karigar Market', logoUrl: '/images/launch-craft.webp', category: 'Arts & Crafts', description: 'A fictional discovery directory in the local demo collection.', tagline: 'Find the hands behind the work.', city: 'Jaipur', state: 'Rajasthan' },
    founders: [{ id: 'sample-founder-ananya', displayName: 'Ananya Mehta', role: 'Fictional founder' }], location: { city: 'Jaipur', state: 'Rajasthan' },
  },
]

// Explicit local presentation orders only. These sample views contain fixture slugs, not scores or behavior measurements.
export const DEMO_LEADERBOARD_SLUGS = {
  weekly: ['kala-clay-monsoon-objects', 'mitti-and-more-cold-pressed', 'nila-botanics-skin-oil', 'rangrez-repairable-textiles'],
  monthly: ['aangan-community-gardens', 'rangrez-repairable-textiles', 'kala-clay-monsoon-objects', 'karigar-market-maker-tools', 'mitti-and-more-cold-pressed', 'nila-botanics-skin-oil'],
} as const

export const DEMO_FOUNDERS: FounderPublic[] = Array.from(new Map(DEMO_LAUNCHES.flatMap((launch) => launch.founders).map((founder) => [founder.id, founder])).values()).map((founder) => ({
  ...founder,
  bio: 'Fictional profile text used only as synthetic sample content in this non-production demo.',
  city: DEMO_LAUNCHES.find((launch) => launch.founders.some((item) => item.id === founder.id))?.location?.city,
  state: DEMO_LAUNCHES.find((launch) => launch.founders.some((item) => item.id === founder.id))?.location?.state,
}))

export const DEMO_PUBLIC_BRANDS: BrandPublic[] = Array.from(new Map(DEMO_LAUNCHES.map((launch) => [launch.brand.id, launch.brand])).values()).map((brand) => ({
  ...brand,
  founders: Array.from(new Map(DEMO_LAUNCHES.filter((launch) => launch.brand.id === brand.id).flatMap((launch) => launch.founders).map((founder) => [founder.id, founder])).values()),
  launches: DEMO_LAUNCHES.filter((launch) => launch.brand.id === brand.id),
}))
