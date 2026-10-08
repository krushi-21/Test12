export type LaunchType = 'business' | 'product' | 'service'

export interface CategoryOption {
  id: string
  name: string
  slug: string
}

export interface LaunchImage {
  url: string
  altText: string
}

export interface FounderSummary {
  id: string
  displayName: string
  role?: string
}

export interface BrandSummary {
  id: string
  slug: string
  name: string
  logoUrl: string
  category: string
  description: string
  tagline?: string
  city?: string
  state?: string
}

export interface LaunchCardData {
  id: string
  slug: string
  title: string
  launchType: LaunchType
  category: string
  summary: string
  story: string
  images: LaunchImage[]
  brand: BrandSummary
  founders: FounderSummary[]
  location?: { city?: string; state?: string }
}

export interface BrandPublic extends BrandSummary {
  founders: FounderSummary[]
  launches: LaunchCardData[]
}

export interface FounderPublic extends FounderSummary {
  bio: string
  city?: string
  state?: string
}
