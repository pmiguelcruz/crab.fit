# Upstream issue review

On November 23, 2026, the upstream repository had 56 open issues. This records their status in the fork.

## Implemented in this branch

- The heatmap and its legend use the actual minimum and maximum attendance across the available slots. [#363](https://github.com/GRA0007/crab.fit/issues/363), [#311](https://github.com/GRA0007/crab.fit/issues/311)
- The monthly picker renders every date in a complete Sunday- or Monday-start week. January 31, 2027 was selected in WebKit. [#362](https://github.com/GRA0007/crab.fit/issues/362)
- The create form accepts multiple time windows and separate windows for individual dates and weekdays. [#361](https://github.com/GRA0007/crab.fit/issues/361), [#317](https://github.com/GRA0007/crab.fit/issues/317), [#289](https://github.com/GRA0007/crab.fit/issues/289)
- Timed polls can use 15-, 30-, or 60-minute choices. Existing polls retain their original quarter-hour grid. The API accepts only the stored choices, and both occurrences of a repeated local time remain separately selectable. [#290](https://github.com/GRA0007/crab.fit/issues/290)
- Dates-only polls offer a calendar for specific dates or recurring weekdays, attendance counts, and date receipts. Admin edits and duplication keep the poll type. [#291](https://github.com/GRA0007/crab.fit/issues/291)
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
- The calendar scrolls on both axes and keeps date headings visible. Verified in a 390-pixel-wide WebKit viewport. [#353](https://github.com/GRA0007/crab.fit/issues/353), [#118](https://github.com/GRA0007/crab.fit/issues/118)
- Buttons use a regular CSS shadow. WebKit passed poll creation, participant sign-in, submission, and receipt download. [#300](https://github.com/GRA0007/crab.fit/issues/300)
- Timed polls can compare configurable awake hours across time zones. The overlay marks slots that fit in every selected zone and accounts for clock changes. [#294](https://github.com/GRA0007/crab.fit/issues/294)
- Voters can import iCalendar files and shared export URLs on polls with calendar dates. Export links work directly with CORS or through an opt-in relay for trusted origins. Chromium and WebKit passed link and file import checks with local fixtures. [#245](https://github.com/GRA0007/crab.fit/issues/245)
- Voters can mark dates or time slots as tentative, and receipts preserve that distinction. The best-slot highlight uses tentative responses only to break a tie in confirmed availability. Verified in Chromium and WebKit, including responses saved before the SQLite migration. [#307](https://github.com/GRA0007/crab.fit/issues/307)
- A poll can have named respondent groups. Participants can choose a group when submitting, and results show a count and filter for each group. Admins can rename groups without losing assignments. Chromium and WebKit passed poll creation, group submission, filtering, and rename checks. [#358](https://github.com/GRA0007/crab.fit/issues/358)
- Esperanto is available in the language picker. The fork includes the community translations and Esperanto strings for the new features. WebKit displayed the translated create form, poll, and group results. [#336](https://github.com/GRA0007/crab.fit/issues/336)
- The entire French heading uses a face that supports the accented glyph. Chromium displayed “CRÉER UN” and reported the same font family for the whole heading. [#345](https://github.com/GRA0007/crab.fit/issues/345)

## Code changed, with verification or coverage pending

- The fork distinguishes API outages from missing events and shares the current host. A Chromium fixture verified that retrying a recovered poll reloads it and a missing poll still shows its own error page. The original hosted failures remain unverified. [#356](https://github.com/GRA0007/crab.fit/issues/356), [#328](https://github.com/GRA0007/crab.fit/issues/328)
- A MySQL migration converts the legacy TIMESTAMP columns to DATETIME. Live MySQL migration remains unverified. [#355](https://github.com/GRA0007/crab.fit/issues/355)
- Calendar import uses the true range and checks errors and partial-slot conflicts. A live authenticated Google Calendar test remains open. [#343](https://github.com/GRA0007/crab.fit/issues/343)
- The Docker builder and runtime use the same Debian release and the runtime installs libssl3. A container build and start remain unverified. [#315](https://github.com/GRA0007/crab.fit/issues/315), [#305](https://github.com/GRA0007/crab.fit/issues/305)
- In-memory cleanup preserves participants for active polls. The older hosted data-loss report remains unverified. [#303](https://github.com/GRA0007/crab.fit/issues/303)
- The unpacked Manifest V3 extension can use a self-hosted URL. Verified in Chromium. Firefox, the Android client, and Chrome Web Store publication remain open. [#335](https://github.com/GRA0007/crab.fit/issues/335), [#115](https://github.com/GRA0007/crab.fit/issues/115)

## Open work

- Vote notifications, cross-poll availability sync, and participant email lists. These need shared identities or a delivery service. [#331](https://github.com/GRA0007/crab.fit/issues/331), [#323](https://github.com/GRA0007/crab.fit/issues/323), [#308](https://github.com/GRA0007/crab.fit/issues/308), [#135](https://github.com/GRA0007/crab.fit/issues/135)
- Both reported URLs returned an HTTP response from the local test network. The affected user's connection failure still needs diagnostics from that network. [#354](https://github.com/GRA0007/crab.fit/issues/354)
- F-Droid publication needs the Android project and store submission. [#33](https://github.com/GRA0007/crab.fit/issues/33)
