interface Person {
  name: string
  availability: string[]
}

interface Availability {
  date: string
  /** Names of everyone who is available at this date */
  people: string[]
}

interface AvailabilityInfo {
  availabilities: Availability[]
  /** The amount of people available in the date with lowest availability */
  min: number
  /** The amount of people available in the date with highest availability */
  max: number
}

/**
 * Takes an array of dates and an array of people,
 * where each person has a name and availability array, and returns the
 * group availability for each date passed in.
 */
export const calculateAvailability = (dates: string[], people: Person[]): AvailabilityInfo => {
  let min = dates.length ? people.length : 0
  let max = 0

  const byDate = new Map(dates.map(date => [date, [] as string[]]))
  for (const person of people) {
    for (const date of new Set(person.availability)) {
      byDate.get(date)?.push(person.name)
    }
  }

  const availabilities: Availability[] = dates.map(date => {
    const names = byDate.get(date) ?? []
    if (names.length < min) {
      min = names.length
    }
    if (names.length > max) {
      max = names.length
    }
    return { date, people: names }
  })

  return { availabilities, min, max }
}
