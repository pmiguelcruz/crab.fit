'use client'

import { type FormEvent, useRef, useState } from 'react'

import Button from '/src/components/Button/Button'
import Error from '/src/components/Error/Error'
import SelectField from '/src/components/SelectField/SelectField'
import TextField from '/src/components/TextField/TextField'
import { editEvent, EventResponse } from '/src/config/api'
import { useTranslation } from '/src/i18n/client'
import { getWeekdayNames } from '/src/utils'

import styles from './admin.module.scss'
import { readSchedule, type ScheduleDay, writeSchedule } from './schedule'

interface Props {
  event: EventResponse
  token: string
  onSaved: (event: EventResponse) => void
  onCancel: () => void
  onExpired: () => void
}

const EventEditor = ({ event, token, onSaved, onCancel, onExpired }: Props) => {
  const { t, i18n } = useTranslation('admin')
  const weekly = event.times[0]?.length === 6
  const [originals] = useState(() => {
    try {
      return readSchedule(event.times, event.timezone, weekly)
    } catch {
      return []
    }
  })
  const [days, setDays] = useState(() => originals.map((source, id) => ({ id, date: source.date, source } as {
    id: number; date: string; source?: ScheduleDay
  })))
  const nextId = useRef(days.length)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const weekdays = Object.fromEntries(getWeekdayNames(i18n.language).map((day, index) => [index + 1, day]))

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const name = String(new FormData(e.currentTarget).get('title') ?? '').trim()
    setError('')
    if (!name) return setError(t('title_required'))

    let times
    try {
      if (originals.length) times = writeSchedule(days, originals, event.timezone, weekly)
    } catch {
      return setError(t('dates_error'))
    }

    setBusy(true)
    try {
      onSaved(await editEvent(event.id, { name, times }, token))
    } catch (e) {
      if (e instanceof Response && e.status === 401) onExpired()
      else setError(t('save_error'))
    } finally {
      setBusy(false)
    }
  }

  return <form onSubmit={submit}>
    <fieldset className={styles.editor} disabled={busy}>
      <legend>{t('edit_event')}</legend>
      <TextField label={t('title')} name="title" defaultValue={event.name} required maxLength={255} />
      <p>{t('dates_timezone', { timezone: event.timezone })}</p>
      {originals.length === 0 && <p>{t('schedule_unavailable')}</p>}
      {days.map((day, index) => {
        const field = {
          label: t(weekly ? 'weekday_number' : 'date_number', { number: index + 1 }),
          name: `date-${day.id}`,
          value: day.date,
          isInline: true,
          required: true,
          onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
            const date = e.currentTarget.value
            setDays(values => values.map(value => value.id === day.id ? { ...value, date } : value))
          },
        }
        return <div className={styles.dateRow} key={day.id}>
          {weekly ? <SelectField {...field} options={weekdays} defaultOption={t('choose_weekday')} />
            : <TextField {...field} type="date" />}
          <Button isSmall isSecondary aria-label={t('remove_date', { number: index + 1 })} onClick={() => {
            setDays(values => values.filter(value => value.id !== day.id))
          }}>{t('remove')}</Button>
        </div>
      })}
      {originals.length > 0 && <Button isSmall isSecondary disabled={weekly && days.length >= 7} onClick={() => {
        const id = nextId.current++
        setDays(values => [...values, { id, date: '' }])
      }}>{t(weekly ? 'add_weekday' : 'add_date')}</Button>}
      <Error onClose={() => setError('')}>{error}</Error>
      <div className={styles.actions}>
        <Button type="submit" isSmall isLoading={busy}>{t('save')}</Button>
        <Button isSmall isSecondary onClick={onCancel}>{t('cancel')}</Button>
      </div>
    </fieldset>
  </form>
}

export default EventEditor
