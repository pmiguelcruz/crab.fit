import { Temporal } from '@js-temporal/polyfill'

import { AwakeOverlap, awakeOverlapChecker } from '/src/utils/awakeOverlap'
import { calculateColumns } from '/src/utils/calculateColumns'
import { calculateRows } from '/src/utils/calculateRows'
import { convertTimesToDates } from '/src/utils/convertTimesToDates'

export interface CalculateTableArgs {
  /** As `HHmm-DDMMYYYY` or `HHmm-d` strings */
  times: string[]
  locale: string
  timeFormat: '12h' | '24h'
  timezone: string
  weekStart?: 0 | 1
  interval?: number
  overlay?: AwakeOverlap
}

export const calculateTable = ({ times, locale, timeFormat, timezone, weekStart = 0, interval = 15, overlay }: CalculateTableArgs) => {
  const choices = [...new Set(times)]
  const dates = convertTimesToDates(choices, timezone, weekStart)
  type Slot = { date: Temporal.ZonedDateTime; serialized: string }
  const dateKeys = new Map<string, Map<string, Slot[]>>()
  const repeats = new Map<string, number>()
  dates.forEach((date, index) => {
    const day = date.toPlainDate().toString()
    const clock = date.toPlainTime().toString()
    const slots = dateKeys.get(day) ?? new Map<string, Slot[]>()
    const matches = slots.get(clock) ?? []
    matches.push({ date, serialized: choices[index] })
    if (matches.length > 1) {
      matches.sort((a, b) => Temporal.ZonedDateTime.compare(a.date, b.date))
      repeats.set(clock, Math.max(matches.length, repeats.get(clock) ?? 1))
    }
    slots.set(clock, matches)
    dateKeys.set(day, slots)
  })

  const checkOverlap = overlay && awakeOverlapChecker(overlay, interval)
  const overlapping = checkOverlap && new Set(choices.filter((_, index) => checkOverlap(dates[index].toInstant())))

  const rows = calculateRows(dates.map(date => date.toPlainTime()), repeats, interval)
  const columns = calculateColumns(dates)
  const isSpecificDates = times[0]?.length === 13
  const clockFormat = { timeStyle: 'short', hourCycle: timeFormat === '12h' ? 'h12' : 'h23' } as const

  return {
    overlapCount: overlapping?.size,
    rows: rows.map((row, index) => row && (index === 0 || row.end || row.time.minute === 0
      || interval !== 15 || repeats.has(row.time.toString())) ? {
        label: row.time.toLocaleString(locale, clockFormat),
        string: row.time.toString(),
      } : null),

    columns: columns.map(column => column ? {
      header: {
        dateLabel: isSpecificDates ? column.toLocaleString(locale, { month: 'short', day: 'numeric' }) : undefined,
        weekdayLabel: column.toLocaleString(locale, { weekday: 'short' }),
        string: column.toString(),
      },
      cells: rows.map(row => {
        if (!row || row.end) return null
        const matches = dateKeys.get(column.toString())?.get(row.time.toString())
        const slot = matches?.[row.occurrence]
        if (!slot) return null

        const { date, serialized } = slot
        const dateLabel = date.toLocaleString(locale, isSpecificDates ? { dateStyle: 'long' } : { weekday: 'long' })
        const clock = date.toLocaleString(locale, clockFormat)
        const ambiguity = (matches?.length ?? 0) > 1 ? ` (UTC${date.offset})` : ''
        return {
          serialized,
          minute: date.minute,
          overlapping: overlapping?.has(serialized),
          label: `${dateLabel}, ${clock}${ambiguity}`,
        }
      }),
    } : null),
  }
}

export interface CalculateTableRequest {
  args: CalculateTableArgs
  revision: number
}

export interface CalculateTableReply {
  table: ReturnType<typeof calculateTable>
  revision: number
}
