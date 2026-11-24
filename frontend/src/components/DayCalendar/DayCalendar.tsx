import { useState } from 'react'
import { Temporal } from '@js-temporal/polyfill'

import Content from '/src/components/Content/Content'
import SelectField from '/src/components/SelectField/SelectField'
import { useCalendarSettings } from '/src/hooks/useCalendarSettings'
import { useTranslation } from '/src/i18n/client'
import { getWeekdayNames } from '/src/utils'

import styles from './DayCalendar.module.scss'

export interface CalendarDayState {
  count?: number
  color?: string
  highlight?: boolean
  selected?: boolean
}

interface Props {
  days: string[]
  states: ReadonlyMap<string, CalendarDayState>
  onSelect: (day: string, label: string) => void
}

const DayCalendar = ({ days, states, onSelect }: Props) => {
  const { t, i18n } = useTranslation('event')
  const { weekStart } = useCalendarSettings(i18n.language)
  const weekdayOrder = weekStart ? [1, 2, 3, 4, 5, 6, 7] : [7, 1, 2, 3, 4, 5, 6]
  const weekdays = getWeekdayNames(i18n.language)
  const shortWeekdays = getWeekdayNames(i18n.language, 'short')
  const weekly = days[0]?.length === 1
  const months = weekly ? [] : [...new Set(days.map(day => day.slice(0, 7)))].sort()
  const [selectedMonth, setSelectedMonth] = useState('')
  const monthId = months.includes(selectedMonth) ? selectedMonth : months[0]
  const activeDays = new Set(days)
  const monthLabels = Object.fromEntries(months.map(month => [
    month,
    Temporal.PlainDate.from(`${month}-01`).toLocaleString(i18n.language, { month: 'long', year: 'numeric' }),
  ]))

  const dayButton = (day: string, label: string, shortLabel: string, enabled = true) => {
    const state = states.get(day)
    const description = state?.count === undefined ? label : t('days.count', { date: label, count: state.count })
    return <button
      type="button"
      key={day}
      aria-label={description}
      aria-pressed={enabled ? !!state?.selected : undefined}
      disabled={!enabled}
      className={styles.day}
      data-count={state?.count !== undefined || undefined}
      data-highlight={state?.highlight || undefined}
      style={{ backgroundColor: state?.color }}
      onClick={() => onSelect(day, label)}
    >
      <span>{shortLabel}</span>
      {state?.count !== undefined && <small>{state.count}</small>}
    </button>
  }

  let calendar
  if (weekly) {
    calendar = weekdayOrder.map(day => dayButton(String(day), weekdays[day - 1], shortWeekdays[day - 1], activeDays.has(String(day))))
  } else if (monthId) {
    const first = Temporal.PlainDate.from(`${monthId}-01`)
    const lead = (first.dayOfWeek - weekStart + 7) % 7
    const count = Math.ceil((lead + first.daysInMonth) / 7) * 7
    calendar = Array.from({ length: count }, (_, index) => {
      const date = first.add({ days: index - lead })
      const key = date.toString()
      if (date.month !== first.month) return <span key={key} />
      return dayButton(key, date.toLocaleString(i18n.language, { dateStyle: 'full' }),
        date.toLocaleString(i18n.language, { day: 'numeric' }), activeDays.has(key))
    })
  }

  return <Content>
    <section className={styles.calendar} aria-label={t('days.calendar')}>
      {months.length > 1 ? <SelectField
        label={t('days.month')}
        name="poll-month"
        options={monthLabels}
        value={monthId}
        isInline
        onChange={e => setSelectedMonth(e.currentTarget.value)}
      /> : monthId && <h3>{monthLabels[monthId]}</h3>}
      {!weekly && <div className={styles.grid} aria-hidden="true">
        {weekdayOrder.map(day => <span className={styles.weekday} key={day}>{shortWeekdays[day - 1]}</span>)}
      </div>}
      <div className={styles.grid}>{calendar}</div>
    </section>
  </Content>
}

export default DayCalendar
