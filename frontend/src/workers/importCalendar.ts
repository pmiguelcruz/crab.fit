import { calendarAvailability, CalendarExpansionLimit, CalendarImport } from '/src/utils/icalendar'

self.onmessage = ({ data }: MessageEvent<CalendarImport>) => {
  try {
    self.postMessage({ availability: calendarAvailability(data) })
  } catch (error) {
    self.postMessage({ error: error instanceof CalendarExpansionLimit ? 'limit' : 'invalid' })
  }
}
