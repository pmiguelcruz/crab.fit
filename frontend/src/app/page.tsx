import { Suspense } from 'react'
import { Trans } from 'react-i18next/TransWithoutContext'
import Link from 'next/link'

import About from '/src/components/About/About'
import Content from '/src/components/Content/Content'
import Footer from '/src/components/Footer/Footer'
import Header from '/src/components/Header/Header'
import { P } from '/src/components/Paragraph/Text'
import Recents from '/src/components/Recents/Recents'
import Section from '/src/components/Section/Section'
import Stats from '/src/components/Stats/Stats'
import { useTranslation } from '/src/i18n/server'

const Page = async () => {
  const { t, i18n } = await useTranslation('home')

  return <>
    <Content>
      <Header isFull />
    </Content>

    <Recents />

    <Section id="about">
      <Content>
        <About title={t('about.name')}>
          <Suspense>
            <Stats />
          </Suspense>

          <P>
            <Trans i18nKey="about.content.p3" t={t} i18n={i18n}>_<a href="https://bengrant.dev" target="_blank" rel="noreferrer noopener author">_</a>_</Trans>
            {' '}Modified by <a href="https://github.com/pmiguelcruz/crab.fit">Pedro Cruz</a>.
          </P>
          <P><Trans i18nKey="about.content.p4" t={t} i18n={i18n}>_<a href="https://github.com/GRA0007/crab.fit" target="_blank" rel="noreferrer noopener">_</a>_<Link href="/privacy" rel="license">_</Link>_</Trans></P>
          <P>{t('about.content.p6')}</P>
          <P>{t('about.content.p5')}</P>
        </About>
      </Content>
    </Section>

    <Footer />
  </>
}

export default Page
