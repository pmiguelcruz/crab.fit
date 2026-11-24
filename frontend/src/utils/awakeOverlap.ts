import { Temporal } from '@js-temporal/polyfill'

export interface AwakeOverlap {
  zones: string[]
  start: number
  end: number
}

const dayMinutes = 24 * 60

export const clockMinutes = (value: string) => {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return undefined
  const [hour, minute] = value.split(':').map(Number)
  return hour * 60 + minute
}

export const awakeOverlapChecker = ({ zones, start, end }: AwakeOverlap, interval: number) => {
  const timezones = [...new Set(zones)].map(zone => new Temporal.TimeZone(zone))
  const awakeDuration = (end - start + dayMinutes) % dayMinutes

  return (instant: Temporal.Instant) => {
    const finish = instant.add({ minutes: interval })
    const lastMoment = finish.subtract({ nanoseconds: 1 })

    return timezones.every(zone => {
      const segmentFits = (from: Temporal.Instant, to: Temporal.Instant) => {
        const local = zone.getPlainDateTimeFor(from)
        const localMinutes = local.hour * 60 + local.minute + local.second / 60
        const minutesSinceWake = (localMinutes - start + dayMinutes) % dayMinutes
        const duration = from.until(to).total({ unit: 'minutes' })
        return minutesSinceWake + duration <= awakeDuration
      }

      if (zone.getOffsetNanosecondsFor(instant) === zone.getOffsetNanosecondsFor(lastMoment)) {
        return segmentFits(instant, finish)
      }

      // A clock change jumps the wall time. Check both sides independently.
      const transition = zone.getNextTransition(instant)
      return !!transition && Temporal.Instant.compare(transition, finish) < 0
        && segmentFits(instant, transition) && segmentFits(transition, finish)
    })
  }
}
