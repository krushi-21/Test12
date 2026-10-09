export function profilePreviewImageUrl(value: string): string {
  const candidate = value.trim()
  if (!candidate) return ''
  if (candidate.startsWith('/images/')) return /^\/images\/[A-Za-z0-9_-]+\.(?:jpe?g|png|webp|avif)$/iu.test(candidate) ? candidate : ''
  try {
    const parsed = new URL(candidate)
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password ? parsed.href : ''
  } catch { return '' }
}

export function validateProfileImageUrl(value: string, label: string): string {
  const candidate = value.trim()
  if (!candidate) return ''
  if (candidate.length > 2048) throw new Error(`${label} must be at most 2,048 characters.`)
  const safe = profilePreviewImageUrl(candidate)
  if (!safe) throw new Error(`${label} must be an HTTPS URL or a safe /images/ path.`)
  return safe
}

export function parseBusinessGallery(value: string): string[] {
  const entries = value.split(/\r?\n/u).map(item => item.trim()).filter(Boolean)
  if (entries.length > 6) throw new Error('Gallery supports up to 6 image URLs.')
  const urls = entries.map((url, index) => validateProfileImageUrl(url, `Gallery image ${index + 1}`))
  if (new Set(urls).size !== urls.length) throw new Error('Remove duplicate gallery image URLs.')
  return urls
}

export function parseFounderInterests(value: string): string[] {
  const interests = value.split(',').map(item => item.trim()).filter(Boolean)
  if (interests.length > 8) throw new Error('Add no more than 8 founder interests.')
  if (interests.some(item => item.length > 40)) throw new Error('Each founder interest must be at most 40 characters.')
  if (interests.reduce((total, item) => total + item.length, 0) > 240) throw new Error('Keep founder interests within 240 characters total.')
  const normalized = interests.map(item => item.toLocaleLowerCase())
  if (new Set(normalized).size !== normalized.length) throw new Error('Remove duplicate founder interests.')
  return interests
}
