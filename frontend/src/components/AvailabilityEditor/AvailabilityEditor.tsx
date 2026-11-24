import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Temporal } from '@js-temporal/polyfill'

import Button from '/src/components/Button/Button'
import Content from '/src/components/Content/Content'
import DayCalendar from '/src/components/DayCalendar/DayCalendar'
import { usePalette } from '/src/hooks/usePalette'
import { useTranslation } from '/src/i18n/client'
import { calculateTable, makeClass, parseSpecificDate } from '/src/utils'

import styles from './AvailabilityEditor.module.scss'
import GoogleCalendar from './components/GoogleCalendar/GoogleCalendar'
import ICalendar from './components/ICalendar/ICalendar'
import RecentEvents from './components/RecentEvents/RecentEvents'
import viewerStyles from '../AvailabilityViewer/AvailabilityViewer.module.scss'
import Skeleton from '../AvailabilityViewer/components/Skeleton/Skeleton'

interface AvailabilityEditorProps {
  eventId?: string
  times: string[]
  timezone: string
  datesOnly?: boolean
  interval?: number
  value: string[]
  tentative?: string[]
  onChange: (value: string[]) => void
  onChangeTentative?: (value: string[]) => void
  table?: ReturnType<typeof calculateTable>
}

const empty: string[] = []

const AvailabilityEditor = ({ eventId, times, timezone, datesOnly, interval = 15, value = empty, tentative = empty, onChange, onChangeTentative, table }: AvailabilityEditorProps) => {
  const { t } = useTranslation('event')
  const [markTentative, setMarkTentative] = useState(false)
  const active = markTentative ? tentative : value
  const setActive = markTentative && onChangeTentative ? onChangeTentative : onChange
  const availableSet = useMemo(() => new Set(value), [value])
  const tentativeSet = useMemo(() => new Set(tentative), [tentative])
  const activeSet = markTentative ? tentativeSet : availableSet

  // Ref and state required to rerender but also access static version in callbacks
  const selectingRef = useRef<string[]>([])
  const [selecting, _setSelecting] = useState<string[]>([])
  const setSelecting = useCallback((v: string[]) => {
    selectingRef.current = v
    _setSelecting(v)
  }, [])

  const startPos = useRef({ x: 0, y: 0 })
  const mode = useRef<'add' | 'remove'>()

  const dateBounds = useMemo(() => {
    if (datesOnly || times[0]?.length !== 13) return
    const dates = times.map(parseSpecificDate).sort(Temporal.ZonedDateTime.compare)
    return { start: dates[0], end: dates[dates.length - 1].add({ minutes: interval }) }
  }, [datesOnly, interval, times])

  // Create the colour palette
  const palette = usePalette(2)

  // Selection control
  const selectAll = useCallback(() => setActive(times), [setActive, times])
  const selectNone = useCallback(() => setActive([]), [setActive])
  const selectInvert = useCallback(() => setActive(times.filter(time => !activeSet.has(time))), [setActive, times, activeSet])
  const toggle = (slot: string) => setActive(activeSet.has(slot) ? active.filter(time => time !== slot) : [...active, slot])

  // Selection keyboard shortcuts
  useEffect(() => {
    const handleKeydown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && e.target.closest('input, textarea, select, [contenteditable="true"]')) return
      if ((e.metaKey || e.ctrlKey) && (e.key === 'a' || e.key === 'i')) {
        e.preventDefault()
        if (e.shiftKey && e.key === 'a') selectNone()
        else if (e.key === 'a') selectAll()
        else selectInvert()
      }
    }

    document.addEventListener('keydown', handleKeydown)
    return () => document.removeEventListener('keydown', handleKeydown)
  }, [selectAll, selectNone, selectInvert])

  return <>
    <Content isCentered>
      {onChangeTentative && <div className={styles.selectionControls} role="group" aria-label={t('tentative.mode')}>
        <Button isSmall isSecondary={markTentative} aria-pressed={!markTentative} onClick={() => setMarkTentative(false)}>
          {t('tentative.firm')}
        </Button>
        <Button isSmall isSecondary={!markTentative} aria-pressed={markTentative} onClick={() => setMarkTentative(true)}>
          {t('tentative.label')}
        </Button>
      </div>}
      <div className={styles.selectionControls}>
        <Button isSmall onClick={selectAll} title="Ctrl + A (⌘ A)">{t('you.select_all')}</Button>
        <Button isSmall onClick={selectNone} title="Ctrl + Shift + A (⌘ ⇧ A)">{t('you.select_none')}</Button>
        <Button isSmall onClick={selectInvert} title="Ctrl + I (⌘ I)">{t('you.select_invert')}</Button>
      </div>
    </Content>
    {(dateBounds || (datesOnly && times[0]?.length === 10)) && <Content>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        {dateBounds && <GoogleCalendar
          timezone={timezone}
          timeStart={dateBounds.start}
          timeEnd={dateBounds.end}
          interval={interval}
          times={times}
          onImport={onChange}
        />}
        <ICalendar
          times={times}
          datesOnly={datesOnly}
          timezone={timezone}
          interval={interval}
          onImport={onChange}
        />
        <RecentEvents
          eventId={eventId}
          times={times}
          onImport={onChange}
        />
      </div>
    </Content>}

    {datesOnly ? <DayCalendar
      days={times}
      states={new Map(times.map(day => [day, {
        selected: activeSet.has(day),
        marked: availableSet.has(day) ? 'firm' : tentativeSet.has(day) ? 'tentative' : undefined,
      }]))}
      onSelect={toggle}
    /> : <div className={viewerStyles.wrapper}>
      <div tabIndex={0} role="region" aria-label={t('group.calendar')}>
        <div className={viewerStyles.heatmap}>
          <div className={viewerStyles.timeLabels}>
            {table?.rows.map((row, i) =>
              <div className={viewerStyles.timeSpace} key={i}>
                {row && <label className={viewerStyles.timeLabel}>
                  {row.label}
                </label>}
              </div>
            ) ?? null}
          </div>

          {table?.columns.map((column, x) => <Fragment key={x}>
            {column ? <div className={viewerStyles.dateColumn}>
              <div className={viewerStyles.dateHeading}>
                {column.header.dateLabel && <span className={viewerStyles.dateLabel}>{column.header.dateLabel}</span>}
                <span className={viewerStyles.dayLabel}>{column.header.weekdayLabel}</span>
              </div>

              <div
                className={viewerStyles.times}
                data-border-left={x === 0 || table.columns.at(x - 1) === null}
                data-border-right={x === table.columns.length - 1 || table.columns.at(x + 1) === null}
              >
                {column.cells.map((cell, y) => {
                  if (y === column.cells.length - 1) return null

                  if (!cell) return <div
                    className={makeClass(viewerStyles.timeSpace, viewerStyles.grey)}
                    key={y}
                    title={t('greyed_times')}
                  />

                  const slot = cell.serialized
                  const preview = selecting.includes(slot) ? mode.current : undefined
                  const isSelected = preview ? preview === 'add' : activeSet.has(slot)
                  const firm = markTentative ? preview !== 'add' && availableSet.has(slot) : isSelected
                  const possible = markTentative ? isSelected : preview !== 'add' && tentativeSet.has(slot)
                  const status = firm ? t('tentative.firm') : possible ? t('tentative.label') : t('tentative.unmarked')

                  return <button
                    type="button"
                    key={y}
                    aria-label={`${cell.label}, ${status}`}
                    aria-pressed={isSelected}
                    title={cell.overlapping === undefined ? cell.label : `${cell.label} · ${t(cell.overlapping ? 'overlap.inside' : 'overlap.outside')}`}
                    data-overlap={cell.overlapping}
                    data-tentative={possible || undefined}
                    className={makeClass(viewerStyles.time, styles.timeButton, selecting.length === 0 && viewerStyles.editable)}
                    style={{
                      touchAction: 'none',
                      backgroundColor: firm || possible ? palette[1].string : palette[0].string,
                      '--hover-color': firm || possible ? palette[0].highlight : palette[1].highlight,
                      ...cell.minute !== 0 && cell.minute !== 30 && { borderTopColor: 'transparent' },
                      ...cell.minute === 30 && { borderTopStyle: 'dotted' },
                    } as React.CSSProperties}
                    onClick={e => { if (e.detail === 0) toggle(slot) }}
                    onPointerDown={e => {
                      if (e.button !== 0) return
                      e.preventDefault()
                      startPos.current = { x, y }
                      mode.current = activeSet.has(slot) ? 'remove' : 'add'
                      setSelecting([slot])
                      e.currentTarget.releasePointerCapture(e.pointerId)

                      document.addEventListener('pointerup', () => {
                        if (mode.current === 'add') {
                          setActive([...active, ...selectingRef.current])
                        } else if (mode.current === 'remove') {
                          setActive(active.filter(time => !selectingRef.current.includes(time)))
                        }
                        setSelecting([])
                        mode.current = undefined
                      }, { once: true })
                    }}
                    onPointerEnter={() => {
                      if (mode.current) {
                        const found = []
                        for (let cy = Math.min(startPos.current.y, y); cy < Math.max(startPos.current.y, y) + 1; cy++) {
                          for (let cx = Math.min(startPos.current.x, x); cx < Math.max(startPos.current.x, x) + 1; cx++) {
                            found.push({ y: cy, x: cx })
                          }
                        }
                        setSelecting(found.flatMap(d => {
                          const serialized = table.columns[d.x]?.cells[d.y]?.serialized
                          if (serialized && times.includes(serialized)) {
                            return [serialized]
                          }
                          return []
                        }))
                      }
                    }}
                  />
                })}
              </div>
            </div> : <div className={viewerStyles.columnSpacer} />}
          </Fragment>) ?? <Skeleton isSpecificDates={times[0]?.length === 13} />}
        </div>
      </div>
    </div>}
  </>
}

export default AvailabilityEditor
