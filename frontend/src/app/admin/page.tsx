import { Metadata } from 'next'

import Content from '/src/components/Content/Content'
import Header from '/src/components/Header/Header'

import EventManager from './EventManager'

export const metadata: Metadata = {
  title: 'Manage Crab Fits',
  robots: { index: false, follow: false },
}

const Page = () => <>
  <Content><Header isSmall /></Content>
  <EventManager />
</>

export default Page
