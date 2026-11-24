export const calendarMaxBytes = 2 * 1024 * 1024

export const normalizeCalendarUrl = (value: string) => {
  const url = new URL(value.trim().replace(/^webcal:/i, 'https:'))
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new TypeError('Invalid calendar URL')
  }
  url.hash = ''
  return url
}

export const isCalendarText = (value: string) => /^BEGIN:VCALENDAR[\t ]*(?:\r?\n)/i.test(value.trimStart())

export const readBoundedText = async (body: ReadableStream<Uint8Array> | null, limit = calendarMaxBytes) => {
  if (!body) throw new TypeError('Missing message body')
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let bytes = 0
  let output = ''
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) return output + decoder.decode()
      bytes += value.byteLength
      if (bytes > limit) throw new RangeError('Calendar response too large')
      output += decoder.decode(value, { stream: true })
    }
  } finally {
    await reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
}
