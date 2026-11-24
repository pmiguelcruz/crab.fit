import { Temporal } from '@js-temporal/polyfill'

import { convertTimesToDates, parseSpecificDate, referenceWeekStart, serializeTime } from '/src/utils'

export interface ScheduleDay {
  date: string
  clocks: Temporal.PlainTime[]
  originalTimes: string[]
}

export const readSchedule = (times: string[], timezone: string, weekly: boolean, datesOnly = false): ScheduleDay[] => {
  if (datesOnly) return [...times].sort().map(date => ({ date, clocks: [], originalTimes: [date] }))

  const grouped = new Map<string, ScheduleDay>()
  const localTimes = convertTimesToDates(times, timezone, 1)
  for (const [index, local] of localTimes.entries()) {
    const time = times[index]
    const date = weekly ? String(local.dayOfWeek) : local.toPlainDate().toString()
    const day = grouped.get(date) ?? { date, clocks: [], originalTimes: [] }
    day.clocks.push(local.toPlainTime())
    day.originalTimes.push(time)
    grouped.set(date, day)
  }
  return [...grouped.values()].sort((a, b) => a.date.localeCompare(b.date))
}

export const writeSchedule = (days: { date: string; source?: ScheduleDay }[], originals: ScheduleDay[], timezone: string, weekly: boolean, datesOnly = false, exactSlots = false) => {
  const selected = days.map(day => day.date)
  if (selected.length === 0 || selected.some(date => !date) || new Set(selected).size !== selected.length) {
    throw new Error('Select distinct dates')
  }

  if (days.length === originals.length && days.every(day => day.date === day.source?.date)) return
  if (datesOnly) return selected.sort()
  const week = referenceWeekStart(timezone, 1)
  const zone = Temporal.TimeZone.from(timezone)
  return [...new Set(days.flatMap(({ date, source }) => {
    if (source?.date === date) return source.originalTimes
    const localDate = weekly ? week.add({ days: Number(date) - 1 }) : Temporal.PlainDate.from(date)
    const clocks = source?.clocks ?? originals[0]?.clocks
    if (!clocks?.length) throw new Error('No times to copy')
    if (!exactSlots) {
      return clocks.map(plainTime => serializeTime(localDate.toZonedDateTime({ timeZone: timezone, plainTime }), !weekly))
    }
    const moved = clocks.flatMap(clock => zone.getPossibleInstantsFor(localDate.toPlainDateTime(clock))
      .map(instant => serializeTime(instant.toZonedDateTimeISO(timezone), !weekly)))
    if (!moved.length) throw new Error('No times occur on this date')
    return moved
  }))].sort((a, b) => weekly
    ? a.slice(5).localeCompare(b.slice(5)) || a.localeCompare(b)
    : Temporal.ZonedDateTime.compare(parseSpecificDate(a), parseSpecificDate(b)))
}
