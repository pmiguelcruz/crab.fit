import { Temporal } from '@js-temporal/polyfill'

/**
 * Take times as strings in UTC and convert to ZonedDateTime objects in the timezone supplied
 * @param times An array of strings in `HHmm-d` or `HHmm-DDMMYYYY` format
 * @param timezone The target timezone
 * @param weekStart Sunday (0) or Monday (1) for recurring times
 */
export const convertTimesToDates = (times: string[], timezone: string, weekStart: 0 | 1 = 0): Temporal.ZonedDateTime[] => {
  if (times[0]?.length === 13) return times.map(time => parseSpecificDate(time).withTimeZone(timezone))

  const utcStart = referenceWeekStart(timezone, weekStart).toZonedDateTime(timezone).withTimeZone('UTC')
  return times.map(time => parseWeekdayDate(time, utcStart).withTimeZone(timezone))
}

/** Use a full local week when this week's clock change shifts a recurring slot. */
export const referenceWeekStart = (timezone: string, weekStart: 0 | 1) => {
  const today = Temporal.Now.plainDateISO(timezone)
  const firstDay = today.subtract({ days: (today.dayOfWeek - weekStart + 7) % 7 })
  const nextWeek = firstDay.add({ weeks: 1 })
  const duration = nextWeek.toZonedDateTime(timezone).epochMilliseconds
    - firstDay.toZonedDateTime(timezone).epochMilliseconds
  return duration === 7 * 24 * 60 * 60 * 1000 ? firstDay : nextWeek
}

// Parse from UTC `HHmm-DDMMYYYY` format into a ZonedDateTime in UTC
export const parseSpecificDate = (str: string): Temporal.ZonedDateTime => {
  if (str.length !== 13) {
    throw new Error('String must be in HHmm-DDMMYYYY format')
  }

  // Extract values
  const [hour, minute] = [Number(str.substring(0, 2)), Number(str.substring(2, 4))]
  const [day, month, year] = [Number(str.substring(5, 7)), Number(str.substring(7, 9)), Number(str.substring(9))]

  // Construct PlainDateTime
  return Temporal.ZonedDateTime.from({
    hour, minute, day, month, year,
    timeZone: 'UTC',
  })
}

// Find the first occurrence of the UTC slot at or after the local week's start.
const parseWeekdayDate = (str: string, utcStart: Temporal.ZonedDateTime): Temporal.ZonedDateTime => {
  const weekday = Number(str.slice(5))
  const days = (weekday - utcStart.dayOfWeek + 7) % 7
  const date = utcStart.add({ days }).with({
    hour: Number(str.slice(0, 2)),
    minute: Number(str.slice(2, 4)),
    second: 0,
    millisecond: 0,
    microsecond: 0,
    nanosecond: 0,
  })
  return Temporal.ZonedDateTime.compare(date, utcStart) < 0 ? date.add({ weeks: 1 }) : date
}
