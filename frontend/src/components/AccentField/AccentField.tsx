'use client'

import { useEffect } from 'react'

const randomAccent = () => {
  const start = Math.floor(Math.random() * 360)
  const angle = 87 + Math.floor(Math.random() * 7)
  const hue = (offset: number) => (start + offset) % 360
  const stops = [
    [0, '0%'], [28, 'calc(50% - 168px)'], [58, 'calc(50% - 120px)'],
    [90, 'calc(50% - 80px)'], [121, 'calc(50% - 40px)'], [160, '50%'],
    [198, 'calc(50% + 40px)'], [230, 'calc(50% + 80px)'],
    [259, 'calc(50% + 120px)'], [295, 'calc(50% + 168px)'], [330, '100%'],
  ] as const
  const spectrum = stops.map(([offset, stop]) => `hsl(${hue(offset)} 90% 52%) ${stop}`)
  const layers = [
    `radial-gradient(ellipse at 12% 78%, hsl(${hue(282)} 94% 56% / .6), transparent 47%)`,
    `radial-gradient(ellipse at 87% 9%, hsl(${hue(27)} 97% 60% / .65), transparent 39%)`,
    `linear-gradient(${angle}deg, ${spectrum.join(', ')})`,
  ]
  return layers.map(layer => `${layer} var(--accent-placement)`).join(', ')
}

const AccentField = () => {
  useEffect(() => {
    document.documentElement.style.setProperty('--accent-fill', randomAccent())
  }, [])
  return null
}

export default AccentField
