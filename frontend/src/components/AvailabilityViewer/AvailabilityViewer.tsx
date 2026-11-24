'use client'

import { Fragment, useEffect, useMemo, useState } from 'react'
import { flip, offset, shift, useFloating } from '@floating-ui/react-dom'
import { Temporal } from '@js-temporal/polyfill'

import Button from '/src/components/Button/Button'
import Content from '/src/components/Content/Content'
import DayCalendar, { CalendarDayState } from '/src/components/DayCalendar/DayCalendar'
import Legend from '/src/components/Legend/Legend'
import SelectField from '/src/components/SelectField/SelectField'
import { EventGroup, PersonResponse } from '/src/config/api'
import { usePalette } from '/src/hooks/usePalette'
import { useTranslation } from '/src/i18n/client'
import { useStore } from '/src/stores'
import useSettingsStore from '/src/stores/settingsStore'
import { calculateAvailability, calculateTable, makeClass, relativeTimeFormat } from '/src/utils'

import styles from './AvailabilityViewer.module.scss'
import Skeleton from './components/Skeleton/Skeleton'

interface AvailabilityViewerProps {
  times: string[]
  people: PersonResponse[]
  groups?: EventGroup[]
  datesOnly?: boolean
  table?: ReturnType<typeof calculateTable>
}

const AvailabilityViewer = ({ times, people, groups, datesOnly, table }: AvailabilityViewerProps) => {
  const { t, i18n } = useTranslation('event')

  const highlight = useStore(useSettingsStore, state => state.highlight)
  const [filteredPeople, setFilteredPeople] = useState(people.map(p => p.name))
  const [selectedDay, setSelectedDay] = useState<{ day: string; label: string }>()
  const [tempFocus, setTempFocus] = useState<string>()
  const [focusCount, setFocusCount] = useState<number>()

  const [tooltip, setTooltip] = useState<{
    anchor: HTMLDivElement
    available: string
    date: string
    people: string[]
    tentative: string[]
    overlapping?: boolean
  }>()
  const { refs, floatingStyles } = useFloating({
    middleware: [offset(6), flip(), shift()],
    elements: { reference: tooltip?.anchor },
  })

  // Calculate availabilities
  const { availabilities, min, max, bestTentative } = useMemo(() =>
    calculateAvailability(times, people.filter(p => filteredPeople.includes(p.name))),
  [times, filteredPeople, people])
  const bySlot = useMemo(() => new Map(availabilities.map(slot => [slot.date, slot])), [availabilities])
  const anyTentative = people.some(person => !!person.tentative?.length)

  // Create the colour palette
  const palette = usePalette(Math.max((max - min) + 1, 2))

  // Reselect everyone if the amount of people changes
  useEffect(() => {
    setFilteredPeople(people.map(p => p.name))
  }, [people.length])

  const heatmap = useMemo(() => table?.columns.map((column, x) => <Fragment key={x}>
    {column ? <div className={styles.dateColumn}>
      <div className={styles.dateHeading}>
        {column.header.dateLabel && <span className={styles.dateLabel}>{column.header.dateLabel}</span>}
        <span className={styles.dayLabel}>{column.header.weekdayLabel}</span>
      </div>

      <div
        className={styles.times}
        data-border-left={x === 0 || table.columns.at(x - 1) === null}
        data-border-right={x === table.columns.length - 1 || table.columns.at(x + 1) === null}
      >
        {column.cells.map((cell, y) => {
          if (y === column.cells.length - 1) return null

          if (!cell) return <div
            className={makeClass(styles.timeSpace, styles.grey)}
            key={y}
            title={t('greyed_times')}
          />

          const result = bySlot.get(cell.serialized)
          const peopleHere = result?.people.filter(person => !tempFocus || person === tempFocus) ?? []
          const tentativeHere = result?.tentative.filter(person => !tempFocus || person === tempFocus) ?? []
          const visible = focusCount === undefined || focusCount === peopleHere.length
          const isBest = (peopleHere.length > 0 || tentativeHere.length > 0)
            && (tempFocus || (peopleHere.length === max && tentativeHere.length === bestTentative))
          const color = palette[(tempFocus && peopleHere.length) ? Math.min(max, palette.length - 1) : Math.max(peopleHere.length - min, 0)]

          return <div
            key={y}
            className={makeClass(
              styles.time,
              styles.nonEditable,
              visible && highlight && isBest && styles.highlight,
            )}
            style={{
              backgroundColor: visible ? color.string : 'transparent',
              '--highlight-color': color.highlight,
              ...cell.minute !== 0 && cell.minute !== 30 && { borderTopColor: 'transparent' },
              ...cell.minute === 30 && { borderTopStyle: 'dotted' },
            } as React.CSSProperties}
            aria-label={[
              ...peopleHere,
              ...(tentativeHere.length ? [`${t('tentative.label')}: ${tentativeHere.join(', ')}`] : []),
            ].join(', ')}
            data-tentative={visible && !!tentativeHere.length || undefined}
            data-overlap={cell.overlapping}
            onMouseEnter={e => {
              setTooltip({
                anchor: e.currentTarget,
                available: `${peopleHere.length} / ${filteredPeople.length} ${t('available')}`,
                date: cell.label,
                people: peopleHere,
                tentative: tentativeHere,
                overlapping: cell.overlapping,
              })
            }}
            onClick={() => {
              let clipboardMessage = `${t('group.clipboard_message', { date: cell.label })}:\n${peopleHere.join(', ')}`
              if (tentativeHere.length) clipboardMessage += `\n${t('tentative.label')}: ${tentativeHere.join(', ')}`
              navigator.clipboard?.writeText(clipboardMessage).catch(console.warn)
            }}
            onMouseLeave={() => setTooltip(undefined)}
          />
        })}
      </div>
    </div> : <div className={styles.columnSpacer} />}
  </Fragment>) ?? <Skeleton isSpecificDates={times[0]?.length === 13} />, [
    bySlot,
    table?.columns,
    highlight,
    max,
    bestTentative,
    min,
    t,
    palette,
    tempFocus,
    focusCount,
    filteredPeople,
  ])

  const dayStates = new Map<string, CalendarDayState>()
  if (datesOnly) {
    for (const day of availabilities) {
      const count = tempFocus ? Number(day.people.includes(tempFocus)) : day.people.length
      const tentativeCount = tempFocus ? Number(day.tentative.includes(tempFocus)) : day.tentative.length
      const visible = focusCount === undefined || focusCount === count
      dayStates.set(day.date, {
        count,
        tentativeCount,
        color: visible ? palette[Math.max(count - min, 0)].string : undefined,
        highlight: !!highlight && visible && (count > 0 || tentativeCount > 0)
          && (!!tempFocus || (count === max && tentativeCount === bestTentative)),
        selected: selectedDay?.day === day.date,
      })
    }
  }
  const selectedResult = selectedDay && bySlot.get(selectedDay.day)
  const selectedNames = selectedResult?.people.filter(name => !tempFocus || tempFocus === name) ?? []
  const selectedTentative = selectedResult?.tentative.filter(name => !tempFocus || tempFocus === name) ?? []

  return <>
    <Content>
      <Legend
        min={min}
        max={max}
        total={filteredPeople.length}
        palette={palette}
        onSegmentFocus={setFocusCount}
      />

      <span className={styles.info}>{t(datesOnly ? 'days.group_info' : 'group.info1')}</span>
      {anyTentative && <span className={styles.info}>{t(datesOnly ? 'tentative.days_help' : 'tentative.times_help')}</span>}

      {!!groups?.length && <div className={styles.people} role="group" aria-label={t('teams.responses')}>
        {groups.map(group => {
          const members = people.filter(person => person.group_id === group.id).map(person => person.name)
          const selected = !!members.length
            && filteredPeople.length === members.length && members.every(name => filteredPeople.includes(name))
          return <button
            type="button"
            className={makeClass(styles.person, selected && styles.personSelected)}
            key={group.id}
            disabled={!members.length}
            aria-pressed={selected}
            aria-label={t('teams.group_count', { group: group.name, count: members.length })}
            onClick={() => {
              setTempFocus(undefined)
              setFilteredPeople(selected ? people.map(person => person.name) : members)
            }}
          >{group.name} · {members.length}</button>
        })}
      </div>}

      {people.length > 1 && <>
        <span className={styles.info}>{t('group.info2')}</span>
        <div className={styles.people}>
          <Button isSmall isSecondary disabled={filteredPeople.length === people.length}
            onClick={() => setFilteredPeople(people.map(person => person.name))}>{t('group.all_people')}</Button>
          <Button isSmall isSecondary disabled={filteredPeople.length === 0}
            onClick={() => setFilteredPeople([])}>{t('group.no_people')}</Button>
          <SelectField
            name="person-focus"
            aria-label={t('group.isolate')}
            options={people.map(person => person.name)}
            defaultOption={t('group.choose_person')}
            value={filteredPeople.length === 1 ? filteredPeople[0] : ''}
            isInline
            isSmall
            onChange={e => {
              setTempFocus(undefined)
              const name = e.currentTarget.value
              setFilteredPeople(name ? [name] : people.map(person => person.name))
            }}
          />
        </div>
        <div className={styles.people}>
          {people.map(person =>
            <button
              type="button"
              className={makeClass(
                styles.person,
                filteredPeople.includes(person.name) && styles.personSelected,
              )}
              key={person.name}
              aria-pressed={filteredPeople.includes(person.name)}
              onClick={() => {
                setTempFocus(undefined)
                if (filteredPeople.includes(person.name)) {
                  setFilteredPeople(filteredPeople.filter(n => n !== person.name))
                } else {
                  setFilteredPeople([...filteredPeople, person.name])
                }
              }}
              onMouseOver={() => setTempFocus(person.name)}
              onMouseOut={() => setTempFocus(undefined)}
              title={relativeTimeFormat(Temporal.Instant.fromEpochSeconds(person.created_at), i18n.language)}
            >{person.name}</button>
          )}
        </div>
      </>}
    </Content>

    {datesOnly ? <>
      <DayCalendar
        days={times}
        states={dayStates}
        onSelect={(day, label) => setSelectedDay(previous => previous?.day === day ? undefined : { day, label })}
      />
      {selectedDay && <Content>
        <div role="status">
          <strong>{selectedDay.label}</strong>
          <p>{selectedNames.length ? selectedNames.join(', ') : t('days.nobody')}</p>
          {!!selectedTentative.length && <p>{t('tentative.people', { people: selectedTentative.join(', ') })}</p>}
        </div>
      </Content>}
    </> : <div className={styles.wrapper}>
      <div tabIndex={0} role="region" aria-label={t('group.calendar')} onScroll={() => setTooltip(undefined)}>
        <div className={styles.heatmap}>
          {useMemo(() => <div className={styles.timeLabels}>
            {table?.rows.map((row, i) =>
              <div className={styles.timeSpace} key={i}>
                {row && <label className={styles.timeLabel}>
                  {row.label}
                </label>}
              </div>
            ) ?? null}
          </div>, [table?.rows])}

          {heatmap}
        </div>

        {tooltip && <div
          className={styles.tooltip}
          ref={refs.setFloating}
          style={floatingStyles}
        >
          <h3>{tooltip.available}</h3>
          <span>{tooltip.date}</span>
          {tooltip.overlapping !== undefined && <span>{t(tooltip.overlapping ? 'overlap.inside' : 'overlap.outside')}</span>}
          {!!filteredPeople.length && <div>
            {tooltip.people.map(person => <span key={person}>{person}</span>)}
            {tooltip.tentative.map(person => <span key={person} data-tentative>{t('tentative.person', { name: person })}</span>)}
            {filteredPeople.filter(p => !tooltip.people.includes(p) && !tooltip.tentative.includes(p)).map(person =>
              <span key={person} data-disabled>{person}</span>
            )}
          </div>}
        </div>}
      </div>
    </div>}
  </>
}

export default AvailabilityViewer
