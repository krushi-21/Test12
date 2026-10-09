import test from 'node:test'
import assert from 'node:assert/strict'
import { parseBusinessGallery, parseFounderInterests, profilePreviewImageUrl, validateProfileImageUrl } from '../src/profile-validation.ts'

test('profile image validation accepts HTTPS and safe bundled images only', () => {
  assert.equal(profilePreviewImageUrl(' https://images.example.invalid/cover.webp '), 'https://images.example.invalid/cover.webp')
  assert.equal(profilePreviewImageUrl('/images/cover-1.webp'), '/images/cover-1.webp')
  assert.equal(profilePreviewImageUrl('http://images.example.invalid/cover.webp'), '')
  assert.equal(profilePreviewImageUrl('https://user:password@images.example.invalid/cover.webp'), '')
  assert.equal(profilePreviewImageUrl('/images/../private.webp'), '')
  assert.equal(profilePreviewImageUrl('/images/cover.svg'), '')
  assert.throws(() => validateProfileImageUrl(`https://${'a'.repeat(2040)}.invalid/image.webp`, 'Cover image'), /2,048 characters/u)
})

test('business gallery validation enforces six unique safe URLs', () => {
  assert.deepEqual(parseBusinessGallery('https://images.example.invalid/a.webp\n/images/b.jpg'), [
    'https://images.example.invalid/a.webp', '/images/b.jpg'
  ])
  assert.deepEqual(parseBusinessGallery('  \n'), [])
  assert.throws(() => parseBusinessGallery(Array.from({ length: 7 }, (_, index) => `https://images.example.invalid/${index}.webp`).join('\n')), /up to 6/u)
  assert.throws(() => parseBusinessGallery('https://images.example.invalid/a.webp\nhttps://images.example.invalid/a.webp'), /duplicate/u)
  assert.throws(() => parseBusinessGallery('http://images.example.invalid/a.webp'), /HTTPS/u)
})

test('founder interests are trimmed and constrained by count, item size, total length, and uniqueness', () => {
  assert.deepEqual(parseFounderInterests(' Ceramics, slow design, textiles '), ['Ceramics', 'slow design', 'textiles'])
  assert.deepEqual(parseFounderInterests(' , , '), [])
  assert.throws(() => parseFounderInterests('1,2,3,4,5,6,7,8,9'), /no more than 8/u)
  assert.throws(() => parseFounderInterests('x'.repeat(41)), /at most 40/u)
  assert.throws(() => parseFounderInterests(Array.from({ length: 7 }, (_, index) => String(index).repeat(35)).join(', ')), /240 characters/u)
  assert.throws(() => parseFounderInterests('Craft, craft'), /duplicate/u)
})
