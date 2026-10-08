import { z } from 'zod';

const requiredText = (max = 300) => z.string().trim().min(1).max(max);
const optionalText = (max = 300) => z.preprocess(value => value === '' ? undefined : value, z.string().trim().max(max).optional());
export const httpsUrl = z.preprocess(value => value === '' ? undefined : value,
  z.string().trim().url().max(2048).refine(value => {
    try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password; } catch { return false; }
  }, 'Use a valid HTTPS URL without embedded credentials.').optional());
const assetUrl = z.preprocess(value => value === '' ? undefined : value, z.string().trim().url().max(2048).refine(value => {
  try { const u = new URL(value); return ['https:', 'http:'].includes(u.protocol) && !u.username && !u.password; } catch { return false; }
}, 'Use a URL returned by the upload endpoint.').optional());
const requiredHttpsUrl = z.string().trim().min(1).url().max(2048).refine(value => {
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password; } catch { return false; }
}, 'Use a valid HTTPS URL without embedded credentials.');
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.').refine(value => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, 'Enter a real calendar date.');
const rangeText = z.string().trim().min(2).max(80).refine(v => !/^(?:₹|INR)?\s*[\d,.]+(?:\s*(?:lakh|crore|cr))?$/i.test(v), 'Enter a range, not an exact amount.');
const timeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use 24-hour HH:MM time.');
const hourSlot = z.union([z.literal('closed'), z.object({ open: timeOfDay, close: timeOfDay }).strict().refine(slot => slot.close > slot.open, 'Closing time must be after opening time.')]);
const openingHours = z.object({ mon: hourSlot.optional(), tue: hourSlot.optional(), wed: hourSlot.optional(), thu: hourSlot.optional(), fri: hourSlot.optional(), sat: hourSlot.optional(), sun: hourSlot.optional() }).strict().optional();

export const registerSchema = z.object({ displayName: requiredText(80), email: z.string().trim().email().max(254), password: z.string().min(12).max(128) });
export const loginSchema = z.object({ email: z.string().trim().email().max(254), password: z.string().min(1).max(128) });
export const tokenSchema = z.object({ token: z.string().min(32).max(256) });
export const resetPasswordSchema = z.object({ token: z.string().min(32).max(256), password: z.string().min(12).max(128) });

export const financialSchema = z.object({
  revenueRange: rangeText.optional(), revenuePeriod: optionalText(40), revenuePublic: z.boolean().optional(),
  fundingRaisedRange: rangeText.optional(), fundingDate: dateOnly.optional(), fundingType: optionalText(40), fundingPublic: z.boolean().optional(),
  openToFunding: z.boolean().optional(), openToFundingPublic: z.boolean().optional()
}).partial();
export const founderProfileSchema = z.object({
  displayName: requiredText(80).optional(), avatarUrl: assetUrl, bio: optionalText(500), city: optionalText(80), state: optionalText(80),
  role: optionalText(80), instagramUrl: httpsUrl, publicProfile: z.boolean().optional(), publicBrandIds: z.array(z.string().uuid()).max(50).optional(), financial: financialSchema.optional()
});

export const brandFieldsSchema = z.object({
  name: requiredText(100).optional(), logoUrl: assetUrl, description: requiredText(1000).optional(), category: requiredText(80).optional(),
  websiteUrl: httpsUrl, instagramUrl: httpsUrl, whatsappUrl: httpsUrl, tagline: optionalText(160), city: optionalText(80), state: optionalText(80),
  area: optionalText(100), address: optionalText(300), latitude: z.number().min(-90).max(90).nullable().optional(), longitude: z.number().min(-180).max(180).nullable().optional(),
  openingHours, contactPhone: z.string().trim().regex(/^\+?[0-9 ()-]{7,25}$/).optional(),
  contactEmail: z.string().trim().email().max(254).optional(), quoteUrl: httpsUrl, demoUrl: httpsUrl, storeUrl: httpsUrl,
  businessMode: z.enum(['online', 'physical', 'hybrid']).optional(),
  foundedYear: z.number().int().min(1800).max(new Date().getFullYear()).optional()
});

export const productSchema = z.object({
  name: requiredText(100), description: requiredText(240),
  priceInrPaise: z.number().int().min(0).max(100_000_000_000).nullable().optional(),
  imageUrl: assetUrl, buyUrl: requiredHttpsUrl
});
export const productPatchSchema = productSchema.partial();

const launchImageSchema = z.object({ url: assetUrl, altText: z.string().trim().min(5, 'Add meaningful alt text.').max(250) });
export const launchFieldsSchema = z.object({
  title: requiredText(120).optional(), launchType: z.enum(['business', 'product', 'service']).optional(), category: requiredText(80).optional(),
  summary: requiredText(500).optional(), story: requiredText(5000).optional(), images: z.array(launchImageSchema).min(1).max(5).optional(),
  brandId: z.string().uuid().optional(), founderIds: z.array(z.string().uuid()).min(1).max(10).optional(),
  launchDate: dateOnly.optional(), launchAt: z.string().datetime({ offset: true }).optional(), endsAt: z.string().datetime({ offset: true }).optional(),
  availabilityNote: optionalText(250), priceInrPaise: z.number().int().min(0).max(100_000_000_000).optional(),
  websiteUrl: httpsUrl, instagramUrl: httpsUrl, whatsappUrl: httpsUrl, leaderboardOptOut: z.boolean().optional()
}).superRefine((launch, ctx) => {
  if (launch.launchAt && launch.endsAt && Date.parse(launch.endsAt) <= Date.parse(launch.launchAt)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['endsAt'], message: 'Ending time must follow the scheduled launch time.' });
  }
});

export const publishScheduleSchema = z.object({
  publishAt: z.string().datetime({ offset: true })
}).strict();

export const reportSchema = z.object({
  subjectType: z.enum(['launch', 'brand', 'founder']), subjectId: z.string().uuid(),
  reason: z.enum(['spam', 'misleading', 'intellectual_property', 'unsafe', 'harassment', 'other']), details: optionalText(1000)
});
export const moderationActionSchema = z.object({ action: z.enum(['dismiss', 'request_changes', 'pause', 'remove', 'restore']), reason: z.string().trim().min(3).max(1000) });
export const holdActionSchema = z.object({ action: z.enum(['hold', 'reinstate']), reason: z.string().trim().min(3).max(1000) });
export const appealSchema = z.object({ subjectType: z.enum(['launch', 'brand', 'founder']), subjectId: z.string().uuid(), reason: z.string().trim().min(3).max(1000) });

export function parseBody(schema, value) { return schema.safeParse(value); }
