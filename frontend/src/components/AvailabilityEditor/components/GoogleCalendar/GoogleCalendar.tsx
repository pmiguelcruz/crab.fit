import { useEffect, useMemo, useRef, useState } from 'react'
import { Temporal } from '@js-temporal/polyfill'

import Button from '/src/components/Button/Button'
import ErrorAlert from '/src/components/Error/Error'
import { useTranslation } from '/src/i18n/client'
import GoogleIcon from '/src/res/GoogleIcon'
import { allowUrlToWrap, parseSpecificDate } from '/src/utils'

import styles from './GoogleCalendar.module.scss'

const [clientId, apiKey] = [process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID, process.env.NEXT_PUBLIC_GOOGLE_API_KEY]

const scriptLoads = new Map<string, Promise<void>>()
let calendarInitialization: Promise<void> | undefined

const loadScript = (src: string) => {
  const existing = scriptLoads.get(src)
  if (existing) return existing
  const load = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = src
    script.async = true
    const fail = () => {
      window.clearTimeout(timeout)
      script.remove()
      reject(new Error('Could not load Google Calendar'))
    }
    const timeout = window.setTimeout(fail, 15000)
    script.onload = () => {
      window.clearTimeout(timeout)
      resolve()
    }
    script.onerror = fail
    document.head.append(script)
  }).catch(error => {
    scriptLoads.delete(src)
    throw error
  })
  scriptLoads.set(src, load)
  return load
}

const loadCalendarClient = (key: string) => {
  calendarInitialization ??= loadScript('https://apis.google.com/js/api.js')
    .then(() => new Promise<void>((resolve, reject) => {
      const fail = () => reject(new Error('Could not initialize Google Calendar'))
      gapi.load('client', {
        callback: () => {
          // Discovery is public. Apply the configured key to Calendar requests after loading it.
          gapi.client.init({
            discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest'],
          }).then(() => {
            gapi.client.setApiKey(key)
          }).then(() => resolve(), reject)
        },
        onerror: fail,
        timeout: 10000,
        ontimeout: fail,
      })
    })).catch(error => {
      calendarInitialization = undefined
      throw error
    })
  return calendarInitialization
}

interface Calendar {
  id: string
  name: string
  description?: string
  color?: string
  isChecked: boolean
}

const listCalendars = async (isActive: () => boolean) => {
  const calendars = new Map<string, Calendar>()
  const cursors = new Set<string>()
  let pageToken: string | undefined
  do {
    const { result } = await gapi.client.calendar.calendarList.list({
      minAccessRole: 'freeBusyReader',
      pageToken,
    })
    if (!isActive()) return []
    for (const item of result.items ?? []) {
      calendars.set(item.id, {
        id: item.id,
        name: item.summary,
        description: item.description,
        color: item.backgroundColor,
        isChecked: item.primary === true,
      })
    }
    pageToken = result.nextPageToken
    if (pageToken) {
      if (cursors.has(pageToken)) throw new Error('Google repeated a calendar list page')
      cursors.add(pageToken)
    }
  } while (pageToken)
  return Array.from(calendars.values())
}

const calendarsPerFreeBusyRequest = 50

const login = (
  callback: (tokenResponse: google.accounts.oauth2.TokenResponse) => void,
  onError: () => void,
) => {
  if (!clientId) return

  const client = google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: 'https://www.googleapis.com/auth/calendar.readonly',
    callback,
    error_callback: onError,
  })
  if (gapi?.client?.getToken()) {
    // Skip dialog for existing session
    client.requestAccessToken({ prompt: '' })
  } else {
    client.requestAccessToken()
  }
}

interface GoogleCalendarProps {
  timezone: string
  timeStart: Temporal.ZonedDateTime
  timeEnd: Temporal.ZonedDateTime
  interval: number
  times: string[]
  onImport: (availability: string[]) => void
}

const GoogleCalendar = ({ timezone, timeStart, timeEnd, times, interval, onImport }: GoogleCalendarProps) => {
  if (!clientId || !apiKey) return null

  const { t } = useTranslation('event')

  // Prevent Google scripts from loading until button pressed
  const [libraries, setLibraries] = useState<'idle' | 'loading' | 'ready'>('idle')
  const [authorizing, setAuthorizing] = useState(false)
  const [calendars, setCalendars] = useState<Calendar[]>()
  const [error, setError] = useState('')
  const activeRequest = useRef<symbol | null>(null)

  useEffect(() => () => { activeRequest.current = null }, [])

  const authorize = () => {
    const attempt = Symbol()
    const isActive = () => activeRequest.current === attempt
    activeRequest.current = attempt
    setAuthorizing(true)
    const finish = () => {
      activeRequest.current = null
      setAuthorizing(false)
    }
    const failed = () => {
      if (!isActive()) return
      setError(t('you.integration.google_sign_in_failed'))
      finish()
    }
    try {
      // Google opens the consent popup synchronously from the button's click.
      login(async response => {
        if (!isActive()) return
        if (response.error !== undefined || !response.access_token) return failed()
        try {
          gapi.client.setToken({ access_token: response.access_token })
          const entries = await listCalendars(isActive)
          if (!isActive()) return
          setCalendars(entries)
          finish()
        } catch {
          failed()
        }
      }, failed)
    } catch {
      failed()
    }
  }

  const close = () => {
    gapi.client.setToken(null)
    setCalendars(undefined)
    setError('')
  }

  const start = () => {
    setError('')
    if (libraries === 'ready') {
      authorize()
      return
    }
    setLibraries('loading')
    Promise.all([
      loadScript('https://accounts.google.com/gsi/client'),
      loadCalendarClient(apiKey),
    ]).then(() => setLibraries('ready'), () => {
      setError(t('you.integration.google_sign_in_failed'))
      setLibraries('idle')
    })
  }

  // Process times so they can be checked quickly
  const epochTimes = useMemo(() => times.map(t => parseSpecificDate(t).epochMilliseconds), [times])

  const [isLoadingAvailability, setIsLoadingAvailability] = useState(false)
  const selected = calendars?.filter(calendar => calendar.isChecked)
  const importAvailability = async () => {
    if (!selected?.length || isLoadingAvailability) return

    const attempt = Symbol()
    const isActive = () => activeRequest.current === attempt
    activeRequest.current = attempt
    setError('')
    setIsLoadingAvailability(true)
    try {
      const timeMin = timeStart.toInstant().toString()
      const timeMax = timeEnd.toInstant().toString()
      const busy: { start: number; end: number }[] = []
      for (let index = 0; index < selected.length; index += calendarsPerFreeBusyRequest) {
        const items = selected.slice(index, index + calendarsPerFreeBusyRequest).map(({ id }) => ({ id }))
        const { result } = await gapi.client.calendar.freebusy.query({
          timeMin,
          timeMax,
          timeZone: timezone,
          calendarExpansionMax: calendarsPerFreeBusyRequest,
          items,
        })
        if (!isActive()) return
        for (const { id } of items) {
          const calendar = result.calendars?.[id]
          if (!calendar || calendar.errors?.length) throw new Error('Calendar data unavailable')
          for (const period of calendar.busy ?? []) {
            const start = Date.parse(period.start)
            const end = Date.parse(period.end)
            if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
              throw new Error('Calendar data unavailable')
            }
            if (end > start) busy.push({ start, end })
          }
        }
      }
      const durationMs = interval * 60 * 1000
      onImport(times.filter((_, i) => !busy.some(period =>
        epochTimes[i] < period.end && epochTimes[i] + durationMs > period.start,
      )))
    } catch {
      if (isActive()) setError(t('you.integration.failed'))
    } finally {
      if (isActive()) {
        activeRequest.current = null
        setIsLoadingAvailability(false)
      }
    }
  }

  return <>
    <ErrorAlert onClose={() => setError('')}>{error}</ErrorAlert>
    {!calendars && <Button
      onClick={start}
      isLoading={libraries === 'loading' || authorizing}
      disabled={libraries === 'loading' || authorizing}
      surfaceColor="#4286F5"
      shadowColor="#3367BD"
      icon={<GoogleIcon aria-hidden="true" />}
    >
      {t(libraries === 'ready' ? 'you.integration.google_continue' : 'you.google_cal')}
    </Button>}

    {calendars && <div className={styles.wrapper}>
      <p className={styles.title}>
        <GoogleIcon className={styles.icon} />
        <strong>{t('you.google_cal')}</strong>
        (<button
          className={styles.linkButton}
          type="button"
          disabled={isLoadingAvailability}
          onClick={close}
        >{t('you.integration.logout')}</button>)
      </p>

      <div className={styles.options}>
        {!calendars.every(c => c.isChecked) && <button
          className={styles.linkButton}
          type="button"
          disabled={isLoadingAvailability}
          onClick={() => setCalendars(calendars.map(c => ({ ...c, isChecked: true })))}
        >{t('you.select_all')}</button>}
        {calendars.every(c => c.isChecked) && <button
          className={styles.linkButton}
          type="button"
          disabled={isLoadingAvailability}
          onClick={() => setCalendars(calendars.map(c => ({ ...c, isChecked: false })))}
        >{t('you.select_none')}</button>}
      </div>

      {calendars.map(calendar => <div key={calendar.id} className={styles.item}>
        <input
          type="checkbox"
          id={calendar.id}
          style={{ accentColor: calendar.color }}
          checked={calendar.isChecked}
          disabled={isLoadingAvailability}
          onChange={() => setCalendars(calendars.map(c => c.id === calendar.id ? { ...c, isChecked: !c.isChecked } : c))}
        />
        <label className={styles.name} htmlFor={calendar.id} title={calendar.description}>{allowUrlToWrap(calendar.name)}</label>
      </div>)}

      <div className={styles.info}>{t('you.integration.info')}</div>
      <Button
        isSmall
        isLoading={isLoadingAvailability}
        disabled={isLoadingAvailability || !selected?.length}
        onClick={importAvailability}
      >{t('you.integration.button')}</Button>
    </div>}

  </>
}

export default GoogleCalendar
