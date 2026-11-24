# Crab Fit Frontend

This is the frontend for Crab Fit, written in TypeScript and SCSS, using Next.js app router.

## Environment

Default environment variables are provided in `.env.local`. This should work out of the box while developing with the API. To change or add variables, create a `.env` file which will override any values in `.env.local`.

## Using VSCode

If you're using VSCode to edit the frontend, be sure to open the `frontend` folder specifically as your workspace, so you can select the workspace typescript version. This will give you type safety for css modules using the [typescript-plugin-css-modules](https://github.com/mrmckeb/typescript-plugin-css-modules) package.

## Translations

Translation files are located in `frontend/src/i18n/locales`. If you need to add any new strings, make sure you only edit the resources in the `en` folder. Any changes to the other languages including translation of new strings and deletion of removed strings are handled by Transifex.

## Temporal API

Crab Fit uses the new Temporal API for all date/time calculations and comparisons. Because this API is not yet supported by any browsers, the [@temporal-js/polyfill](https://github.com/js-temporal/temporal-polyfill) library is used, with the intention to remove this eventually once support is stable in all major browsers.

Note that much of the Temporal logic is run only when necessary, as the polyfill being used is not optimised and will slow down the frontend otherwise.

## Importing iCalendar availability

Open **Your availability → Import iCalendar** on a poll with calendar dates.
Choose an exported `.ics`, `.ical`, or `.ifb` file, or paste a shared HTTP,
HTTPS, or webcal export link. Import replaces the availability draft. A timed
choice is available when no busy period overlaps it. In a dates-only poll, any
busy period during a day leaves that day unselected. Submit the reviewed draft
to save it.

The browser parses calendar data and computes availability. Shared links load
directly when the calendar host allows cross-origin requests. For a self-hosted
calendar server that serves exports without CORS, set the frontend server's
`CALENDAR_FEED_ORIGINS` to a comma-separated list of exact calendar origins.
For example:

```env
CALENDAR_FEED_ORIGINS=https://calendar.example.org
```

The relay accepts shared export links from those origins and checks redirects
against the same list. It makes anonymous requests to the calendar host. The
import accepts calendar data up to 2 MiB.
