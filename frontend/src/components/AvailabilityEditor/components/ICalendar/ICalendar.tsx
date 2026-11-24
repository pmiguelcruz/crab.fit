import { FormEvent, useEffect, useId, useRef, useState } from 'react'
import { CalendarDays } from 'lucide-react'

import Button from '/src/components/Button/Button'
import ErrorAlert from '/src/components/Error/Error'
import TextField from '/src/components/TextField/TextField'
import ToggleField from '/src/components/ToggleField/ToggleField'
import { useTranslation } from '/src/i18n/client'
import { calendarMaxBytes, isCalendarText, normalizeCalendarUrl, readBoundedText } from '/src/utils/calendarFeed'
import type { CalendarImport } from '/src/utils/icalendar'

import styles from './ICalendar.module.scss'

const fetchCalendar = async (url: URL, signal: AbortSignal) => {
  try {
    const response = await fetch(url, { credentials: 'omit', referrerPolicy: 'no-referrer', signal })
    if (!response.ok) throw new Error('Calendar URL unavailable')
    const calendar = await readBoundedText(response.body)
    if (!isCalendarText(calendar)) throw new TypeError('Invalid calendar')
    return calendar
  } catch (error) {
    if (signal.aborted || error instanceof RangeError) throw error
    const response = await fetch('/api/calendar-feed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: url.href }),
      signal,
    })
    if (!response.ok) throw new Error('Calendar URL unavailable')
    return readBoundedText(response.body)
  }
}

const importInWorker = (input: CalendarImport, signal: AbortSignal) => new Promise<string[]>((resolve, reject) => {
  const worker = new Worker(new URL('/src/workers/importCalendar', import.meta.url))
  const dispose = () => {
    worker.terminate()
    signal.removeEventListener('abort', onCancel)
  }
  const onCancel = () => {
    dispose()
    reject(new DOMException('Calendar import stopped', 'AbortError'))
  }
  if (signal.aborted) return onCancel()
  signal.addEventListener('abort', onCancel, { once: true })
  worker.onmessage = ({ data }: MessageEvent<{ availability?: string[]; error?: 'limit' | 'invalid' }>) => {
    dispose()
    if (data.availability) resolve(data.availability)
    else reject(data.error === 'limit' ? new RangeError('Calendar recurrence limit') : new TypeError('Invalid calendar'))
  }
  worker.onerror = () => {
    dispose()
    reject(new TypeError('Calendar could not be read'))
  }
  worker.postMessage(input)
})

interface Props extends Omit<CalendarImport, 'calendar'> {
  onImport: (availability: string[]) => void
}

const ICalendar = ({ times, datesOnly, interval, timezone, onImport }: Props) => {
  const { t } = useTranslation('event')
  const id = useId()
  const [open, setOpen] = useState(false)
  const [source, setSource] = useState<'file' | 'url'>('file')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [imported, setImported] = useState<number>()
  const active = useRef<AbortController>()

  const cancel = () => {
    const current = active.current
    active.current = undefined
    current?.abort()
  }
  useEffect(() => cancel, [])

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (active.current) return
    const values = new FormData(event.currentTarget)
    const controller = new AbortController()
    active.current = controller
    const timeout = setTimeout(() => controller.abort(), 15000)
    setBusy(true)
    setError('')
    setImported(undefined)

    try {
      let calendar: string
      if (source === 'file') {
        const file = values.get(`${id}-file`)
        if (!(file instanceof File) || !file.size) throw new TypeError('Missing file')
        if (file.size > calendarMaxBytes) throw new RangeError('Calendar file too large')
        calendar = await file.text()
      } else {
        let url: URL
        try {
          url = normalizeCalendarUrl(String(values.get(`${id}-url`) ?? ''))
        } catch {
          setError(t('you.icalendar.invalid_url'))
          return
        }
        calendar = await fetchCalendar(url, controller.signal)
      }

      const available = await importInWorker({ calendar, times, datesOnly, interval, timezone }, controller.signal)
      if (active.current !== controller) return
      onImport(available)
      setImported(available.length)
    } catch (reason) {
      if (active.current !== controller) return
      setError(t(controller.signal.aborted ? 'you.icalendar.timeout'
        : reason instanceof RangeError ? 'you.icalendar.limit'
          : reason instanceof TypeError ? 'you.icalendar.invalid_file'
            : 'you.icalendar.url_failed'))
    } finally {
      clearTimeout(timeout)
      if (active.current === controller) {
        active.current = undefined
        setBusy(false)
      }
    }
  }

  return open ? <form className={styles.panel} onSubmit={submit}>
    <h3>{t('you.icalendar.title')}</h3>
    <ToggleField name={`${id}-source`} options={{
      file: t('you.icalendar.file'), url: t('you.icalendar.url'),
    }} value={source} onChange={value => {
      if (busy) return
      setSource(value)
      setError('')
    }} />
    {source === 'file' ? <TextField
      name={`${id}-file`}
      type="file"
      label={t('you.icalendar.choose_file')}
      disabled={busy}
      accept=".ics,.ical,.ifb,text/calendar,application/ics"
      required
    /> : <TextField
      name={`${id}-url`}
      type="url"
      label={t('you.icalendar.calendar_url')}
      description={t('you.icalendar.url_description')}
      disabled={busy}
      required
    />}
    <p className={styles.description}>{t(datesOnly ? 'you.icalendar.day_info' : 'you.integration.info')}</p>
    {imported !== undefined && <p role="status">{t('you.icalendar.imported', { count: imported })}</p>}
    <ErrorAlert onClose={() => setError('')}>{error}</ErrorAlert>
    <div className={styles.actions}>
      <Button type="submit" isSmall isLoading={busy} disabled={busy}>{t('you.integration.button')}</Button>
      <Button isSmall isSecondary onClick={() => {
        cancel()
        setBusy(false)
        setError('')
        setImported(undefined)
        setOpen(false)
      }}>{t('you.integration.close')}</Button>
    </div>
  </form> : <Button icon={<CalendarDays aria-hidden="true" />} onClick={() => setOpen(true)}>
    {t('you.icalendar.title')}
  </Button>
}

export default ICalendar
