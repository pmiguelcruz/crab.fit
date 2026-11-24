import { isCalendarText, normalizeCalendarUrl, readBoundedText } from '/src/utils/calendarFeed'

const trustedOrigins = () => new Set((process.env.CALENDAR_FEED_ORIGINS ?? '')
  .split(',').filter(value => value.trim()).flatMap(value => {
    try {
      const url = normalizeCalendarUrl(value)
      return url.pathname === '/' && !url.search ? [url.origin] : []
    } catch {
      return []
    }
  }))

const redirects = new Set([301, 302, 303, 307, 308])
let pendingRequests = 0

export async function POST(request: Request) {
  if (request.headers.get('content-type')?.split(';')[0] !== 'application/json') {
    return new Response(null, { status: 415 })
  }

  const origins = trustedOrigins()
  if (!origins.size) return new Response(null, { status: 403 })

  let url: URL
  try {
    const input = JSON.parse(await readBoundedText(request.body, 8192))
    if (typeof input?.url !== 'string') throw new TypeError('Missing URL')
    url = normalizeCalendarUrl(input.url)
  } catch {
    return new Response(null, { status: 400 })
  }

  if (!origins.has(url.origin)) return new Response(null, { status: 403 })
  if (pendingRequests >= 4) return new Response(null, { status: 503 })

  pendingRequests++
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 7000)
  const onAbort = () => controller.abort()
  request.signal.addEventListener('abort', onAbort, { once: true })
  if (request.signal.aborted) onAbort()

  try {
    for (let hops = 0; hops < 4; hops++) {
      if (!origins.has(url.origin)) return new Response(null, { status: 403 })

      const response = await fetch(url, {
        cache: 'no-store',
        redirect: 'manual',
        credentials: 'omit',
        headers: { Accept: 'text/calendar, application/ics, text/plain;q=0.5' },
        signal: controller.signal,
      })
      if (redirects.has(response.status)) {
        const location = response.headers.get('location')
        await response.body?.cancel()
        if (!location) break
        url = normalizeCalendarUrl(new URL(location, url).href)
        continue
      }
      if (!response.ok) {
        await response.body?.cancel()
        break
      }

      const calendar = await readBoundedText(response.body)
      if (!isCalendarText(calendar)) break

      return new Response(calendar, {
        headers: {
          'Cache-Control': 'no-store',
          'Content-Type': 'text/calendar; charset=utf-8',
          'Content-Disposition': 'attachment; filename="calendar.ics"',
          'X-Content-Type-Options': 'nosniff',
        },
      })
    }
  } catch {
    return new Response(null, { status: 502 })
  } finally {
    clearTimeout(timeout)
    request.signal.removeEventListener('abort', onAbort)
    pendingRequests--
  }

  return new Response(null, { status: 502 })
}
