import { defaultOrigin, normalizeOrigin, settings } from './origin.js'

const frame = document.querySelector('iframe')
let origin = defaultOrigin
try {
  const saved = await settings.get('origin')
  if (saved.origin) origin = normalizeOrigin(saved.origin)
} catch (error) {
  console.warn('Could not read the Crab Fit extension settings', error)
}
frame.src = new URL('/create', origin).href
