import { Temporal } from '@js-temporal/polyfill'

import Button from '/src/components/Button/Button'
import SelectField from '/src/components/SelectField/SelectField'
import ToggleField from '/src/components/ToggleField/ToggleField'
import { useCalendarSettings } from '/src/hooks/useCalendarSettings'
import { useTranslation } from '/src/i18n/client'
import { getWeekdayNames } from '/src/utils'

import styles from '../CreateForm.module.scss'

export interface TimeWindow {
  start: number
  end: number
}

export const hoursInWindow = ({ start, end }: TimeWindow) =>
  Array.from({ length: 24 }, (_, hour) => hour)
    .filter(hour => start <= end ? hour >= start && hour < end : hour >= start || hour < end)

interface Props {
  dates: string[]
  mode: 'shared' | 'perDay'
  onModeChange: (mode: 'shared' | 'perDay') => void
  windows: Record<string, TimeWindow[]>
  onChange: (date: string, windows: TimeWindow[]) => void
  initialWindow: TimeWindow
}

const ScheduleWindows = ({ dates, mode, onModeChange, windows, onChange, initialWindow }: Props) => {
  const { t, i18n } = useTranslation('home')
  const { timeFormat } = useCalendarSettings(i18n.language)
  const weekdays = getWeekdayNames(i18n.language)
  const hours = Object.fromEntries(Array.from({ length: 24 }, (_, hour) => [
    hour,
    Temporal.PlainTime.from({ hour }).toLocaleString(i18n.language, {
      hour: 'numeric', minute: '2-digit', hourCycle: timeFormat === '24h' ? 'h23' : 'h12',
    }),
  ]))

  return <>
    <ToggleField
      name="timeWindowMode"
      options={{ shared: t('form.windows.shared'), perDay: t('form.windows.per_day') }}
      value={mode}
      onChange={onModeChange}
    />
    {(mode === 'perDay' ? [...new Set(dates)].sort() : ['shared']).map(date => {
      const ranges = windows[date] ?? [initialWindow]
      const title = date === 'shared' ? t('form.windows.shared') : date.length === 1
        ? weekdays[Number(date) - 1]
        : Temporal.PlainDate.from(date).toLocaleString(i18n.language, { dateStyle: 'full' })
      return <fieldset key={date} className={styles.windows}>
        <legend>{title}</legend>
        {ranges.map((range, index) => <div className={styles.window} key={index}>
          <SelectField
            label={t('form.windows.start')}
            name={`start-${date}-${index}`}
            options={hours}
            value={range.start}
            isInline
            isSmall
            onChange={e => {
              const start = Number(e.currentTarget.value)
              onChange(date, ranges.map((entry, row) => row === index ? { ...entry, start } : entry))
            }}
          />
          <SelectField
            label={t('form.windows.end')}
            name={`end-${date}-${index}`}
            options={{ ...hours, 24: t('form.windows.end_of_day') }}
            value={range.end}
            isInline
            isSmall
            onChange={e => {
              const end = Number(e.currentTarget.value)
              onChange(date, ranges.map((entry, row) => row === index ? { ...entry, end } : entry))
            }}
          />
          {ranges.length > 1 && <Button isSmall isSecondary onClick={() => {
            onChange(date, ranges.filter((_, row) => row !== index))
          }}>{t('form.windows.remove')}</Button>}
        </div>)}
        <Button isSmall isSecondary onClick={() => {
          onChange(date, [...ranges, { start: 18, end: 21 }])
        }}>{t('form.windows.add')}</Button>
      </fieldset>
    })}
  </>
}

export default ScheduleWindows
