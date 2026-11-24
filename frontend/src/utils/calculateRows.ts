import { splitArrayBy } from '@giraugh/tools'
import { Temporal } from '@js-temporal/polyfill'

export interface RowTime {
  time: Temporal.PlainTime
  occurrence: number
  end?: boolean
}

/** Calculate a row for each displayed time, retaining repeated local times at a clock change. */
export const calculateRows = (times: Temporal.PlainTime[], repeats: ReadonlyMap<string, number>, interval: number): (RowTime | null)[] => {
  const sorted = [...new Map(times.map(time => [time.toString(), time])).values()].sort(Temporal.PlainTime.compare)
  if (!sorted.length) return []
  const groups = splitArrayBy(sorted, (a, b) => a.until(b).total({ unit: 'minutes' }) > interval)

  return groups.flatMap((group, index) => [
    ...group.flatMap(time => Array.from({ length: repeats.get(time.toString()) ?? 1 }, (_, occurrence) => ({
      time,
      occurrence,
    }))),
    { time: group[group.length - 1].add({ minutes: interval }), occurrence: 0, end: true },
    ...(index < groups.length - 1 ? [null, null] : []),
  ])
}
