interface Person {
  name: string
  availability: string[]
  tentative?: string[]
}

interface Availability {
  date: string
  /** Names of everyone who is available at this date */
  people: string[]
  tentative: string[]
}

interface AvailabilityInfo {
  availabilities: Availability[]
  /** The amount of people available in the date with lowest availability */
  min: number
  /** The amount of people available in the date with highest availability */
  max: number
  bestTentative: number
}

/**
 * Takes an array of dates and an array of people,
 * where each person has a name and availability array, and returns the
 * group availability for each date passed in.
 */
export const calculateAvailability = (dates: string[], people: Person[]): AvailabilityInfo => {
  let min = dates.length ? people.length : 0
  let max = 0
  let bestTentative = 0

  const byDate = new Map(dates.map(date => [date, { date, people: [] as string[], tentative: [] as string[] }]))
  for (const person of people) {
    const firm = new Set(person.availability)
    for (const date of firm) {
      byDate.get(date)?.people.push(person.name)
    }
    for (const date of new Set(person.tentative)) {
      if (!firm.has(date)) byDate.get(date)?.tentative.push(person.name)
    }
  }

  const availabilities: Availability[] = [...byDate.values()]
  for (const { people, tentative } of availabilities) {
    if (people.length < min) {
      min = people.length
    }
    if (people.length > max || (people.length === max && tentative.length > bestTentative)) {
      max = people.length
      bestTentative = tentative.length
    }
  }

  return { availabilities, min, max, bestTentative }
}
