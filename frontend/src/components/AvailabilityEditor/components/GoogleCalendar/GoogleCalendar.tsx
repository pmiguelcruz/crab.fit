import { useCallback, useEffect, useMemo, useState } from 'react'
import Script from 'next/script'
import { Temporal } from '@js-temporal/polyfill'

import Button from '/src/components/Button/Button'
import ErrorAlert from '/src/components/Error/Error'
import { useTranslation } from '/src/i18n/client'
import GoogleIcon from '/src/res/GoogleIcon'
import { allowUrlToWrap, parseSpecificDate } from '/src/utils'

import styles from './GoogleCalendar.module.scss'

const [clientId, apiKey] = [process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID, process.env.NEXT_PUBLIC_GOOGLE_API_KEY]

interface Calendar {
  id: string
  name: string
  description?: string
  color?: string
  isChecked: boolean
}

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
  const [canLoad, setCanLoad] = useState(false)
  const [identityReady, setIdentityReady] = useState(false)
  const [calendarReady, setCalendarReady] = useState(false)
  const [calendars, setCalendars] = useState<Calendar[]>()
  const [error, setError] = useState('')

  const fail = useCallback(() => {
    setError(t('you.integration.failed'))
    setCanLoad(false)
  }, [t])

  const loadCalendar = () => {
    if (calendarReady) return
    gapi.load('client', {
      callback: () => {
        gapi.client.init({
          apiKey,
          discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest'],
        }).then(() => setCalendarReady(true)).catch(fail)
      },
      onerror: fail,
      timeout: 10000,
      ontimeout: fail,
    })
  }

  useEffect(() => {
    if (!canLoad) {
      setCalendars(undefined)
      return
    }
    if (!identityReady || !calendarReady) return

    let active = true
    const failWhileActive = () => { if (active) fail() }
    try {
      login(async response => {
        if (!active) return
        if (response.error !== undefined || !response.access_token) return failWhileActive()
        try {
          gapi.client.setToken({ access_token: response.access_token })
          const { result } = await gapi.client.calendar.calendarList.list({ minAccessRole: 'freeBusyReader' })
          if (active) {
            setCalendars(result.items?.map(item => ({
              id: item.id,
              name: item.summary,
              description: item.description,
              color: item.backgroundColor,
              isChecked: item.primary === true,
            })) ?? [])
          }
        } catch {
          failWhileActive()
        }
      }, failWhileActive)
    } catch {
      failWhileActive()
    }
    return () => { active = false }
  }, [calendarReady, canLoad, fail, identityReady])

  // Process times so they can be checked quickly
  const epochTimes = useMemo(() => times.map(t => parseSpecificDate(t).epochMilliseconds), [times])

  const [isLoadingAvailability, setIsLoadingAvailability] = useState(false)
  const importAvailability = async () => {
    const selected = calendars?.filter(calendar => calendar.isChecked)
    if (!selected?.length) return

    setError('')
    setIsLoadingAvailability(true)
    try {
      const { result } = await gapi.client.calendar.freebusy.query({
        timeMin: timeStart.toInstant().toString(),
        timeMax: timeEnd.toInstant().toString(),
        timeZone: timezone,
        items: selected.map(calendar => ({ id: calendar.id })),
      })
      const busy = selected.flatMap(({ id }) => {
        const calendar = result.calendars?.[id]
        if (!calendar || calendar.errors?.length) throw new Error('Calendar data unavailable')
        return (calendar.busy ?? []).map(period => {
          const start = Date.parse(period.start)
          const end = Date.parse(period.end)
          if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
            throw new Error('Calendar data unavailable')
          }
          return { start, end }
        })
      })
      const durationMs = interval * 60 * 1000
      onImport(times.filter((_, i) => !busy.some(period =>
        epochTimes[i] < period.end && epochTimes[i] + durationMs > period.start,
      )))
    } catch {
      setError(t('you.integration.failed'))
    } finally {
      setIsLoadingAvailability(false)
    }
  }

  return <>
    <ErrorAlert onClose={() => setError('')}>{error}</ErrorAlert>
    {!calendars && <Button
      onClick={() => {
        setError('')
        setCanLoad(!canLoad)
      }}
      isLoading={canLoad}
      surfaceColor="#4286F5"
      shadowColor="#3367BD"
      icon={<GoogleIcon aria-hidden="true" />}
    >
      {t('you.google_cal')}
    </Button>}

    {calendars && <div className={styles.wrapper}>
      <p className={styles.title}>
        <GoogleIcon className={styles.icon} />
        <strong>{t('you.google_cal')}</strong>
        (<button
          className={styles.linkButton}
          type="button"
          onClick={() => setCanLoad(false)}
        >{t('you.integration.logout')}</button>)
      </p>

      <div className={styles.options}>
        {!calendars.every(c => c.isChecked) && <button
          className={styles.linkButton}
          type="button"
          onClick={() => setCalendars(calendars.map(c => ({ ...c, isChecked: true })))}
        >{t('you.select_all')}</button>}
        {calendars.every(c => c.isChecked) && <button
          className={styles.linkButton}
          type="button"
          onClick={() => setCalendars(calendars.map(c => ({ ...c, isChecked: false })))}
        >{t('you.select_none')}</button>}
      </div>

      {calendars.map(calendar => <div key={calendar.id} className={styles.item}>
        <input
          type="checkbox"
          id={calendar.id}
          style={{ accentColor: calendar.color }}
          checked={calendar.isChecked}
          onChange={() => setCalendars(calendars.map(c => c.id === calendar.id ? { ...c, isChecked: !c.isChecked } : c))}
        />
        <label className={styles.name} htmlFor={calendar.id} title={calendar.description}>{allowUrlToWrap(calendar.name)}</label>
      </div>)}

      <div className={styles.info}>{t('you.integration.info')}</div>
      <Button
        isSmall
        isLoading={isLoadingAvailability}
        disabled={isLoadingAvailability}
        onClick={() => importAvailability()}
      >{t('you.integration.button')}</Button>
    </div>}

    {/* Load google api scripts */}
    {canLoad && <>
      <Script
        src="https://accounts.google.com/gsi/client"
        onError={fail}
        onReady={() => setIdentityReady(true)}
      />
      <Script
        src="https://apis.google.com/js/api.js"
        onError={fail}
        onReady={loadCalendar}
      />
    </>}
  </>
}

export default GoogleCalendar
