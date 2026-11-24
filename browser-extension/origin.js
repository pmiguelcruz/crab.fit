export const defaultOrigin = 'https://crab.fit'

export const normalizeOrigin = input => {
  const url = new URL(input.trim())
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
      url.pathname !== '/' || url.search || url.hash) {
    throw new Error('Enter the frontend origin, such as https://meet.example.org')
  }
  return url.origin
}

export const settings = (globalThis.browser ?? globalThis.chrome).storage.local
