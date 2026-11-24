import { Temporal } from '@js-temporal/polyfill'

import { parseSpecificDate, serializeTime } from '/src/utils'

export interface ScheduleDay {
  date: string
  clocks: Temporal.PlainTime[]
  originalTimes: string[]
}

// Anchor repeating days to one UTC week so local dates on either side of
// midnight retain their intended weekday and time when edited.
const currentMonday = () => {
  const today = Temporal.Now.plainDateISO('UTC')
  return today.subtract({ days: today.dayOfWeek - 1 })
}

export const readSchedule = (times: string[], timezone: string, weekly: boolean) => {
  const grouped = new Map<string, ScheduleDay>()
  const week = currentMonday()
  for (const time of times) {
    const utc = weekly
      ? week.add({ days: (Number(time.slice(5)) + 6) % 7 }).toZonedDateTime({
        timeZone: 'UTC',
        plainTime: Temporal.PlainTime.from(`${time.slice(0, 2)}:${time.slice(2, 4)}`),
      })
      : parseSpecificDate(time)
    const local = utc.withTimeZone(timezone)
    const date = weekly ? String(local.dayOfWeek) : local.toPlainDate().toString()
    const day = grouped.get(date) ?? { date, clocks: [], originalTimes: [] }
    day.clocks.push(local.toPlainTime())
    day.originalTimes.push(time)
    grouped.set(date, day)
  }
  return [...grouped.values()].sort((a, b) => a.date.localeCompare(b.date))
}

export const writeSchedule = (days: { date: string; source?: ScheduleDay }[], originals: ScheduleDay[], timezone: string, weekly: boolean) => {
  const selected = days.map(day => day.date)
  if (selected.length === 0 || selected.some(date => !date) || new Set(selected).size !== selected.length) {
    throw new Error('Select distinct dates')
  }

  if (days.length === originals.length && days.every(day => day.date === day.source?.date)) return
  const week = currentMonday()
  return [...new Set(days.flatMap(({ date, source }) => {
    if (source?.date === date) return source.originalTimes
    const localDate = weekly ? week.add({ days: Number(date) - 1 }) : Temporal.PlainDate.from(date)
    const clocks = source?.clocks ?? originals[0]?.clocks
    if (!clocks?.length) throw new Error('No times to copy')
    return clocks.map(plainTime => serializeTime(localDate.toZonedDateTime({ timeZone: timezone, plainTime }), !weekly))
  }))].sort((a, b) => weekly
    ? a.slice(5).localeCompare(b.slice(5)) || a.localeCompare(b)
    : Temporal.ZonedDateTime.compare(parseSpecificDate(a), parseSpecificDate(b)))
}
