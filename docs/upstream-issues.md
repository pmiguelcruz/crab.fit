# Upstream issue review

On November 23, 2026, the upstream repository had 56 open issues. This records their status in the fork.

## Implemented in this branch

- The heatmap and its legend use the actual minimum and maximum attendance across the available slots. [#363](https://github.com/GRA0007/crab.fit/issues/363), [#311](https://github.com/GRA0007/crab.fit/issues/311)
- The monthly picker renders every date in a complete Sunday- or Monday-start week. January 31, 2027 was selected in WebKit. [#362](https://github.com/GRA0007/crab.fit/issues/362)
- The create form accepts multiple time windows and separate windows for individual dates and weekdays. [#361](https://github.com/GRA0007/crab.fit/issues/361), [#317](https://github.com/GRA0007/crab.fit/issues/317), [#289](https://github.com/GRA0007/crab.fit/issues/289)
- The About section no longer displays the Android download button. Play Store availability is governed separately. [#360](https://github.com/GRA0007/crab.fit/issues/360)
- The README links to the upstream hosted site and the privacy page links to the current Vercel notice. [#357](https://github.com/GRA0007/crab.fit/issues/357), [#342](https://github.com/GRA0007/crab.fit/issues/342)
- Event creation rejects invalid dates, weekdays, times, mixed formats, and unsupported time zones. [#352](https://github.com/GRA0007/crab.fit/issues/352)
- Recurring polls display each day once and honor the selected first day of the week. [#349](https://github.com/GRA0007/crab.fit/issues/349), [#339](https://github.com/GRA0007/crab.fit/issues/339), [#304](https://github.com/GRA0007/crab.fit/issues/304), [#321](https://github.com/GRA0007/crab.fit/issues/321), [#298](https://github.com/GRA0007/crab.fit/issues/298)
- An admin can remove participants. A signed-in participant can remove their own response. [#346](https://github.com/GRA0007/crab.fit/issues/346), [#320](https://github.com/GRA0007/crab.fit/issues/320)
- The pinned API dependencies build on current Rust and SQLite can initialize its foreign key on a fresh database. [#340](https://github.com/GRA0007/crab.fit/issues/340), [#296](https://github.com/GRA0007/crab.fit/issues/296)
- Participants sign in to a single event, submit explicitly, see confirmation, and can download a receipt. [#334](https://github.com/GRA0007/crab.fit/issues/334), [#314](https://github.com/GRA0007/crab.fit/issues/314)
- A PIN-authorized admin can rename polls and add, move, or remove dates while retaining the event URL. [#332](https://github.com/GRA0007/crab.fit/issues/332)
- Share links use the served origin. The API accepts a configured frontend origin and listening address. [#329](https://github.com/GRA0007/crab.fit/issues/329), [#306](https://github.com/GRA0007/crab.fit/issues/306), [#297](https://github.com/GRA0007/crab.fit/issues/297), [#295](https://github.com/GRA0007/crab.fit/issues/295)
- Group filters can show everyone, no one, or one participant. New settings use the language defaults. [#324](https://github.com/GRA0007/crab.fit/issues/324), [#322](https://github.com/GRA0007/crab.fit/issues/322)
- The SQL adaptor documentation explains when migrations run and how to verify an upgrade on a copy. [#319](https://github.com/GRA0007/crab.fit/issues/319)
- Admin duplication creates a new event link with the same schedule and no participant responses. [#288](https://github.com/GRA0007/crab.fit/issues/288)

## Code changed, with verification or coverage pending

- The fork distinguishes API failure from a missing event and shares the correct host. The original hosted reports remain unverified. [#356](https://github.com/GRA0007/crab.fit/issues/356), [#328](https://github.com/GRA0007/crab.fit/issues/328)
- A MySQL migration converts the legacy TIMESTAMP columns to DATETIME. Live MySQL migration remains unverified. [#355](https://github.com/GRA0007/crab.fit/issues/355)
- The calendar has a bounded two-axis scroll region with sticky date headings. Physical mobile-device testing remains open. [#353](https://github.com/GRA0007/crab.fit/issues/353), [#118](https://github.com/GRA0007/crab.fit/issues/118)
- Accented heading text uses the fallback face. Buttons use a regular CSS shadow in place of the Safari-sensitive 3D layer. [#345](https://github.com/GRA0007/crab.fit/issues/345), [#300](https://github.com/GRA0007/crab.fit/issues/300)
- Calendar import uses the true range and checks errors and partial-slot conflicts. A live authenticated Google Calendar test remains open. [#343](https://github.com/GRA0007/crab.fit/issues/343)
- The Docker builder and runtime use the same Debian release and the runtime installs libssl3. A container build and start remain unverified. [#315](https://github.com/GRA0007/crab.fit/issues/315), [#305](https://github.com/GRA0007/crab.fit/issues/305)
- In-memory cleanup preserves participants for active polls. The older hosted data-loss report remains unverified. [#303](https://github.com/GRA0007/crab.fit/issues/303)

## Open work

- Respondent groups, tentative participation, time-zone overlap display, date-only polling, and configurable slot lengths. [#358](https://github.com/GRA0007/crab.fit/issues/358), [#307](https://github.com/GRA0007/crab.fit/issues/307), [#294](https://github.com/GRA0007/crab.fit/issues/294), [#291](https://github.com/GRA0007/crab.fit/issues/291), [#290](https://github.com/GRA0007/crab.fit/issues/290)
- Vote notifications, cross-poll availability sync, and participant email lists. These need shared identities or a delivery service. [#331](https://github.com/GRA0007/crab.fit/issues/331), [#323](https://github.com/GRA0007/crab.fit/issues/323), [#308](https://github.com/GRA0007/crab.fit/issues/308), [#135](https://github.com/GRA0007/crab.fit/issues/135)
- Calendar-file import and import from iCalendar or CalDAV URLs. [#245](https://github.com/GRA0007/crab.fit/issues/245)
- The external connection failure needs a reproducible case or diagnostics from that deployment. [#354](https://github.com/GRA0007/crab.fit/issues/354)
- Esperanto translation files are absent from the upstream checkout. [#336](https://github.com/GRA0007/crab.fit/issues/336)
- Self-hosted URLs in the browser and Android clients, Chrome Web Store availability, and F-Droid publication. Those client and distribution changes remain open. [#335](https://github.com/GRA0007/crab.fit/issues/335), [#115](https://github.com/GRA0007/crab.fit/issues/115), [#33](https://github.com/GRA0007/crab.fit/issues/33)
