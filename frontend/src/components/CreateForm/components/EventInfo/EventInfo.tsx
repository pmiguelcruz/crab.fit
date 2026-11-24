import EventShare from '/src/components/EventShare/EventShare'
import { EventResponse } from '/src/config/api'

import styles from './EventInfo.module.scss'

interface EventInfoProps {
  event: EventResponse
}

const EventInfo = ({ event }: EventInfoProps) => <div className={styles.wrapper}>
  <h2>{event.name}</h2>
  <EventShare event={event} className={styles.info} alternateHelp />
</div>

export default EventInfo
