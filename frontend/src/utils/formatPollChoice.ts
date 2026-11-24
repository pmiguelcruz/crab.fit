import { Temporal } from '@js-temporal/polyfill'

import { type EventResponse } from '/src/config/api'
import { convertTimesToDates } from '/src/utils/convertTimesToDates'
import { getWeekdayNames } from '/src/utils/getWeekdayNames'
import { slotMinutes } from '/src/utils/slotSize'

export const formatPollChoice = (
  event: EventResponse,
  choice: string,
  locale: string,
  timezone = event.timezone,
) => {
  if (event.slot_size === 'day') {
    return choice.length === 1
      ? getWeekdayNames(locale)[Number(choice) - 1]
      : Temporal.PlainDate.from(choice).toLocaleString(locale, { dateStyle: 'full' })
  }
  const time = convertTimesToDates([choice], timezone)[0]
  const end = time.add({ minutes: slotMinutes(event.slot_size) })
  const date = time.toLocaleString(locale, choice.length === 6 ? { weekday: 'long' } : { dateStyle: 'long' })
  const zone = Temporal.TimeZone.from(timezone)
  const showOffset = zone.getPossibleInstantsFor(time.toPlainDateTime()).length > 1
    || zone.getPossibleInstantsFor(end.toPlainDateTime()).length > 1 || time.offset !== end.offset
  const clock = (instant: Temporal.ZonedDateTime) => instant.toLocaleString(locale, { timeStyle: 'short' })
    + (showOffset ? ` (UTC${instant.offset})` : '')
  return `${date} · ${clock(time)}–${clock(end)}`
}
