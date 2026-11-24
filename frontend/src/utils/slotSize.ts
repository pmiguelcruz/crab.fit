export const slotSizes = ['quarter_hour', 'half_hour', 'hour', 'day'] as const

export type SlotSize = typeof slotSizes[number]

const minutesBySize = { quarter_hour: 15, half_hour: 30, hour: 60 } as const

export const slotMinutes = (size?: Exclude<SlotSize, 'day'>) => minutesBySize[size ?? 'quarter_hour']
