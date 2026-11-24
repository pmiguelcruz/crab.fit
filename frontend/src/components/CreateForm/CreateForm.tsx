'use client'

import { useState } from 'react'
import { SubmitHandler, useForm, useWatch } from 'react-hook-form'
import { Temporal } from '@js-temporal/polyfill'

import Button from '/src/components/Button/Button'
import CalendarField from '/src/components/CalendarField/CalendarField'
import { default as ErrorAlert } from '/src/components/Error/Error'
import GroupFields, { validGroupNames } from '/src/components/GroupFields/GroupFields'
import SelectField from '/src/components/SelectField/SelectField'
import TextField from '/src/components/TextField/TextField'
import TimeRangeField from '/src/components/TimeRangeField/TimeRangeField'
import { createEvent, EventResponse, GroupEdit } from '/src/config/api'
import { useTranslation } from '/src/i18n/client'
import timezones from '/src/res/timezones.json'
import { referenceWeekStart, serializeTime } from '/src/utils'
import { slotMinutes, SlotSize, slotSizes } from '/src/utils/slotSize'

import ScheduleWindows, { hoursInWindow, TimeWindow } from './components/ScheduleWindows'
import styles from './CreateForm.module.scss'

interface Fields {
  name: string
  /** As `YYYY-MM-DD` or `d` */
  dates: string[]
  time: TimeWindow
  timezone: string
}

const defaultValues: Fields = {
  name: '',
  dates: [],
  time: { start: 9, end: 17 },
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
}

interface CreateFormProps {
  token: string
  onCreated: (event: EventResponse) => void
  onExpired: () => void
}

const CreateForm = ({ token, onCreated, onExpired }: CreateFormProps) => {
  const { t } = useTranslation('home')
  const { t: eventText } = useTranslation('event')

  const {
    register,
    handleSubmit,
    control,
  } = useForm({ defaultValues })

  const dates = useWatch({ control, name: 'dates' })
  const time = useWatch({ control, name: 'time' })
  const [slotSize, setSlotSize] = useState<SlotSize>('quarter_hour')
  const [customize, setCustomize] = useState(false)
  const [windowMode, setWindowMode] = useState<'shared' | 'perDay'>('shared')
  const [windows, setWindows] = useState<Record<string, TimeWindow[]>>({})
  const [groups, setGroups] = useState<GroupEdit[]>([])

  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<React.ReactNode>()

  const onSubmit: SubmitHandler<Fields> = async values => {
    setIsLoading(true)
    setError(undefined)

    const { name, dates, time, timezone } = values

    try {
      if (dates.length === 0) {
        return setError(t('form.errors.no_dates'))
      }
      if (!validGroupNames(groups)) return setError(eventText('teams.invalid'))
      const times: string[] = []
      if (slotSize === 'day') {
        times.push(...new Set(dates))
      } else {
        const interval = slotMinutes(slotSize)
        const isSpecificDates = dates[0].length !== 1
        const weekStart = referenceWeekStart(timezone, 1)
        const zone = Temporal.TimeZone.from(timezone)
        for (const dateStr of new Set(dates)) {
          const date = isSpecificDates ? Temporal.PlainDate.from(dateStr)
            : weekStart.add({ days: Number(dateStr) - 1 })
          const ranges = customize ? windows[windowMode === 'perDay' ? dateStr : 'shared'] ?? [time] : [time]
          const hours = ranges.map(hoursInWindow)
          if (hours.some(range => range.length === 0)) {
            return setError(t('form.errors.same_times'))
          }
          for (const hour of new Set(hours.flat())) {
            for (let minute = 0; minute < 60; minute += interval) {
              const localTime = date.toPlainDateTime({ hour, minute })
              for (const instant of zone.getPossibleInstantsFor(localTime)) {
                times.push(serializeTime(instant.toZonedDateTimeISO(timezone), isSpecificDates))
              }
            }
          }
        }
      }
      if (!times.length) return setError(t('form.errors.no_times'))

      onCreated(await createEvent({ name, times, timezone, slot_size: slotSize, groups }, token))
    } catch (e) {
      if (e instanceof Response && e.status === 401) onExpired()
      else setError(t('form.errors.unknown'))
    } finally {
      setIsLoading(false)
    }
  }

  return <form
    style={{ marginBlockEnd: 30 }}
    onSubmit={handleSubmit(onSubmit)}
    id="create"
  >
    <TextField
      label={t('form.labels.title')}
      type="text"
      maxLength={255}
      {...register('name')}
    />

    <CalendarField
      label={t('form.labels.dates')}
      control={control}
      name="dates"
    />

    <SelectField
      label={t('form.labels.slot_size')}
      name="slot-size"
      value={slotSize}
      options={Object.fromEntries(slotSizes.map(size => [size, t(`form.slot_size.${size}`)]))}
      onChange={e => setSlotSize(e.currentTarget.value as SlotSize)}
    />

    {slotSize !== 'day' && <>
      {customize ? <ScheduleWindows
        dates={dates}
        mode={windowMode}
        onModeChange={setWindowMode}
        windows={windows}
        onChange={(date, ranges) => setWindows(current => ({ ...current, [date]: ranges }))}
        initialWindow={{ ...time, start: time.start % 24 }}
      /> : <TimeRangeField
        label={t('form.labels.times')}
        control={control}
        name="time"
      />}
      <Button isSmall isSecondary aria-expanded={customize} onClick={() => setCustomize(value => !value)}>
        {t(customize ? 'form.windows.simple' : 'form.windows.customize')}
      </Button>

      <SelectField
        label={t('form.labels.timezone')}
        options={timezones}
        required
        {...register('timezone')}
        defaultOption={t('form.timezone.defaultOption')}
      />
    </>}

    <GroupFields value={groups} onChange={setGroups} />
    <ErrorAlert onClose={() => setError(undefined)}>{error}</ErrorAlert>

    <div className={styles.buttonWrapper}>
      <Button
        type="submit"
        isLoading={isLoading}
        disabled={isLoading}
        style={{ width: '100%' }}
      >{t('form.button')}</Button>
    </div>
  </form>
}

export default CreateForm
