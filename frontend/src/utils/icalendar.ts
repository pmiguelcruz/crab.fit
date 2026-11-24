import { Temporal } from '@js-temporal/polyfill'
import ICAL from 'ical.js'

import { isCalendarText } from './calendarFeed'
import { parseSpecificDate } from './convertTimesToDates'

interface Interval {
  start: number
  end: number
}

export interface CalendarImport {
  calendar: string
  times: string[]
  datesOnly?: boolean
  interval: number
  timezone: string
}

const wallTime = (time: ICAL.Time) => Temporal.PlainDateTime.from({
  year: time.year, month: time.month, day: time.day,
  hour: time.hour, minute: time.minute, second: Math.min(time.second, 59),
}, { overflow: 'reject' })

const installMissingZones = (calendar: ICAL.Component) => {
  // Embedded VTIMEZONEs win. Some exporters use an IANA TZID without a definition.
  ICAL.TimezoneService.reset()
  for (const component of calendar.getAllSubcomponents()) {
    for (const property of component.getAllProperties()) {
      const name = property.getParameter('tzid')
      if (typeof name !== 'string' || ICAL.TimezoneService.has(name) || calendar.getTimeZoneByID(name)) continue
      const zone = new Temporal.TimeZone(name)
      const wrapped = new ICAL.Timezone({ tzid: name })
      wrapped.utcOffset = time => zone.getOffsetNanosecondsFor(wallTime(time).toZonedDateTime(zone).toInstant()) / 1e9
      ICAL.TimezoneService.register(wrapped)
    }
  }
}

// The recurrence iterator expects Time values. Keep the duration of each
// explicit RDATE period and hand its start to the iterator as a date-time.
const extractRdatePeriods = (event: ICAL.Event) => {
  const periods = new Map<string, ICAL.Period>()
  for (const property of event.component.getAllProperties('rdate')) {
    if (property.type !== 'period') continue
    const values = property.getValues() as ICAL.Period[]
    for (const period of values) periods.set(period.start.toString(), period)
    const starts = new ICAL.Property('rdate')
    starts.setValues(values.map(period => period.start))
    const tzid = property.getParameter('tzid')
    if (typeof tzid === 'string') starts.setParameter('tzid', tzid)
    event.component.removeProperty(property)
    event.component.addProperty(starts)
  }
  return periods
}

export class CalendarExpansionLimit extends Error {}

const eventStatus = (event: ICAL.Event) => event.component.getFirstPropertyValue('status')
const isBusy = (event: ICAL.Event, master?: ICAL.Event) => {
  const transparency = event.component.getFirstPropertyValue('transp')
    ?? master?.component.getFirstPropertyValue('transp')
  return eventStatus(event) !== 'CANCELLED' && transparency !== 'TRANSPARENT'
}

export const calendarAvailability = ({ calendar, times, datesOnly, interval, timezone }: CalendarImport) => {
  if (!isCalendarText(calendar)) throw new TypeError('Invalid calendar')
  const parsed = ICAL.parse(calendar.trim())
  const records = typeof parsed[0] === 'string' ? [parsed] : parsed
  const slots = [...new Set(times)].map(time => {
    if (datesOnly) {
      const date = Temporal.PlainDate.from(time)
      return {
        time,
        start: date.toZonedDateTime(timezone).epochMilliseconds,
        end: date.add({ days: 1 }).toZonedDateTime(timezone).epochMilliseconds,
      }
    }
    const start = parseSpecificDate(time).epochMilliseconds
    return { time, start, end: start + interval * 60000 }
  }).sort((a, b) => a.start - b.start)
  if (!slots.length) return []
  const first = slots[0].start
  const last = slots[slots.length - 1].end
  const toEpoch = (time: ICAL.Time) => {
    if (!time) throw new TypeError('Missing calendar date')
    return time.zone === ICAL.Timezone.localTimezone || time.isDate
      ? wallTime(time).toZonedDateTime(timezone).epochMilliseconds
      : time.toUnixTime() * 1000
  }
  const busy: Interval[] = []
  const addBusy = (from: ICAL.Time, to: ICAL.Time) => {
    const start = toEpoch(from)
    const end = toEpoch(to)
    if (end < start) throw new TypeError('Invalid calendar interval')
    if (end > start && end > first && start < last) busy.push({ start, end })
  }

  let steps = 0
  for (const record of records) {
    const root = new ICAL.Component(record)
    if (root.name !== 'vcalendar') throw new TypeError('Invalid calendar')
    installMissingZones(root)

    const components = root.getAllSubcomponents('vevent')
    const overrides = new Map<string, ICAL.Event[]>()
    for (const component of components.filter(item => item.hasProperty('recurrence-id'))) {
      const exception = new ICAL.Event(component, { exceptions: [] })
      const sameEvent = overrides.get(exception.uid) ?? []
      sameEvent.push(exception)
      overrides.set(exception.uid, sameEvent)
    }

    const seen = new Set<string>()
    for (const component of components.filter(item => !item.hasProperty('recurrence-id'))) {
      const preview = new ICAL.Event(component, { exceptions: [] })
      const exceptions = overrides.get(preview.uid) ?? []
      const exceptionById = new Map(exceptions.map(item => [item.recurrenceId.toString(), item]))
      const master = new ICAL.Event(component, { exceptions, strictExceptions: true })
      seen.add(master.uid)
      if (eventStatus(master) === 'CANCELLED') continue

      let horizon = last
      for (const exception of exceptions) {
        if (!isBusy(exception, master)) continue
        addBusy(exception.startDate, exception.endDate)
        if (exception.modifiesFuture()) {
          horizon = Math.max(horizon, last + toEpoch(exception.recurrenceId) - toEpoch(exception.startDate))
        }
      }

      if (!master.isRecurring()) {
        if (isBusy(master)) addBusy(master.startDate, master.endDate)
        continue
      }

      const periods = extractRdatePeriods(master)
      if (!component.hasProperty('rrule')) {
        const firstDate = new ICAL.Property('rdate')
        firstDate.setValue(master.startDate)
        component.addProperty(firstDate)
      }
      const iterator = master.iterator()
      for (let occurrence = iterator.next(); occurrence; occurrence = iterator.next()) {
        if (++steps > 150000) throw new CalendarExpansionLimit('Too many calendar occurrences')
        if (toEpoch(occurrence) >= horizon) break

        // Detached records were included independently, even if moved across the poll range.
        const key = occurrence.toString()
        if (exceptionById.has(key)
          || exceptionById.has(occurrence.convertToZone(ICAL.Timezone.utcTimezone).toString())) continue

        // ICAL.js 2.2 returns a recurrence ID here even though its types expect an event.
        const range = master.findRangeException(occurrence)
        const changed = typeof range === 'string' ? exceptionById.get(range) : range
        if (!isBusy(changed ?? master, master)) continue
        const { startDate, endDate } = master.getOccurrenceDetails(occurrence)
        const period = !changed && periods.get(key)
        addBusy(startDate, period ? period.getEnd() : endDate)
      }
    }

    for (const [uid, exceptions] of overrides) {
      if (seen.has(uid)) continue
      for (const exception of exceptions) {
        if (isBusy(exception)) addBusy(exception.startDate, exception.endDate)
      }
    }

    for (const component of root.getAllSubcomponents('vfreebusy')) {
      for (const property of component.getAllProperties('freebusy')) {
        if (property.getParameter('fbtype') === 'FREE') continue
        for (const period of property.getValues() as ICAL.Period[]) addBusy(period.start, period.getEnd())
      }
    }
  }

  const merged: Interval[] = []
  for (const block of busy.sort((a, b) => a.start - b.start)) {
    const previous = merged.at(-1)
    if (previous && block.start <= previous.end) previous.end = Math.max(previous.end, block.end)
    else merged.push(block)
  }

  let index = 0
  const free = new Set<string>()
  for (const slot of slots) {
    while (index < merged.length && merged[index].end <= slot.start) index++
    if (index === merged.length || merged[index].start >= slot.end) free.add(slot.time)
  }
  return [...new Set(times)].filter(time => free.has(time))
}
