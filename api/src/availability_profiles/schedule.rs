use std::collections::{BTreeMap, HashSet};

use chrono::{Datelike, NaiveDate, NaiveTime, Timelike};
use common::SlotSize;
use serde::{Deserialize, Serialize};

const MINUTES_PER_WEEK: i64 = 7 * 24 * 60;

#[derive(Clone, Copy, Debug, Eq, Ord, PartialEq, PartialOrd, Deserialize, Serialize)]
enum Calendar {
    DatedTimes,
    WeeklyTimes,
    Dates,
    Weekdays,
}

#[derive(Clone, Copy, Debug, Eq, Ord, PartialEq, PartialOrd, Deserialize, Serialize)]
pub(super) struct Span {
    calendar: Calendar,
    start: i64,
    end: i64,
}

pub(super) type Choices = BTreeMap<String, Vec<Span>>;

#[derive(Default, Deserialize, Serialize)]
pub(super) struct Preferences {
    confirmed: Vec<Span>,
    tentative: Vec<Span>,
}

pub(super) fn choices(slots: &HashSet<String>, slot_size: Option<SlotSize>) -> Choices {
    slots
        .iter()
        .filter_map(|choice| spans(choice, slot_size).map(|spans| (choice.clone(), spans)))
        .collect()
}

fn spans(choice: &str, slot_size: Option<SlotSize>) -> Option<Vec<Span>> {
    if slot_size == Some(SlotSize::Day) {
        let (calendar, start) = if choice.len() == 1 {
            (Calendar::Weekdays, choice.parse().ok()?)
        } else {
            let date = NaiveDate::parse_from_str(choice, "%Y-%m-%d").ok()?;
            (Calendar::Dates, i64::from(date.num_days_from_ce()))
        };
        return Some(vec![Span {
            calendar,
            start,
            end: start + 1,
        }]);
    }
    let (time, day) = choice.split_once('-')?;
    let time = NaiveTime::parse_from_str(time, "%H%M").ok()?;
    let duration = match slot_size {
        Some(SlotSize::Hour) => 60,
        Some(SlotSize::HalfHour) => 30,
        _ => 15,
    };
    if day.len() == 1 {
        let start =
            day.parse::<i64>().ok()? * 1440 + i64::from(time.num_seconds_from_midnight() / 60);
        let end = start + duration;
        let mut parts = vec![Span {
            calendar: Calendar::WeeklyTimes,
            start,
            end: end.min(MINUTES_PER_WEEK),
        }];
        if end > MINUTES_PER_WEEK {
            parts.push(Span {
                calendar: Calendar::WeeklyTimes,
                start: 0,
                end: end - MINUTES_PER_WEEK,
            });
        }
        Some(parts)
    } else {
        let date = NaiveDate::parse_from_str(day, "%d%m%Y").ok()?;
        let start = date.and_time(time).timestamp().div_euclid(60);
        Some(vec![Span {
            calendar: Calendar::DatedTimes,
            start,
            end: start + duration,
        }])
    }
}

impl Preferences {
    pub(super) fn replace_choices(
        &mut self,
        choices: &Choices,
        confirmed: &[String],
        tentative: &[String],
        reservations: &[Span],
    ) {
        let changed = normalize(choices.values().flatten().copied().collect());
        let changed = subtract(changed, reservations);
        let submitted = |selections: &[String]| {
            selections
                .iter()
                .filter_map(|choice| choices.get(choice))
                .flatten()
                .copied()
                .collect::<Vec<_>>()
        };

        self.confirmed = subtract(std::mem::take(&mut self.confirmed), &changed);
        self.confirmed
            .extend(subtract(submitted(confirmed), reservations));
        self.confirmed = normalize(std::mem::take(&mut self.confirmed));

        self.tentative = subtract(std::mem::take(&mut self.tentative), &changed);
        self.tentative
            .extend(subtract(submitted(tentative), reservations));
        self.tentative = normalize(subtract(
            std::mem::take(&mut self.tentative),
            &self.confirmed,
        ));
    }

    pub(super) fn project(
        &self,
        choices: &Choices,
        reservations: &[Span],
    ) -> (Vec<String>, Vec<String>) {
        let confirmed = subtract(self.confirmed.clone(), reservations);
        let mut selectable = confirmed.clone();
        selectable.extend(subtract(self.tentative.clone(), reservations));
        let selectable = normalize(selectable);
        let mut firm = Vec::new();
        let mut tentative = Vec::new();
        for (choice, spans) in choices {
            if spans.iter().all(|span| covers(&confirmed, *span)) {
                firm.push(choice.clone());
            } else if spans.iter().all(|span| covers(&selectable, *span)) {
                tentative.push(choice.clone());
            }
        }
        (firm, tentative)
    }
}

fn covers(ranges: &[Span], span: Span) -> bool {
    let end = ranges.partition_point(|range| {
        range.calendar < span.calendar
            || (range.calendar == span.calendar && range.start <= span.start)
    });
    end > 0 && ranges[end - 1].calendar == span.calendar && ranges[end - 1].end >= span.end
}

fn normalize(mut ranges: Vec<Span>) -> Vec<Span> {
    ranges.sort_unstable();
    let mut sorted: Vec<Span> = Vec::new();
    for span in ranges {
        if let Some(previous) = sorted
            .last_mut()
            .filter(|last| last.calendar == span.calendar && last.end >= span.start)
        {
            previous.end = previous.end.max(span.end);
        } else {
            sorted.push(span);
        }
    }
    sorted
}

fn subtract(mut ranges: Vec<Span>, removed: &[Span]) -> Vec<Span> {
    for excluded in removed {
        ranges = ranges
            .into_iter()
            .flat_map(|span| {
                if span.calendar != excluded.calendar
                    || span.start >= excluded.end
                    || span.end <= excluded.start
                {
                    return [Some(span), None];
                }
                [
                    (span.start < excluded.start).then_some(Span {
                        end: excluded.start,
                        ..span
                    }),
                    (span.end > excluded.end).then_some(Span {
                        start: excluded.end,
                        ..span
                    }),
                ]
            })
            .flatten()
            .collect();
    }
    ranges
}

#[cfg(test)]
mod tests {
    use super::*;

    fn schedule(items: &[&str], size: SlotSize) -> Choices {
        choices(
            &items.iter().map(|item| (*item).into()).collect(),
            Some(size),
        )
    }

    #[test]
    fn synchronizes_overlapping_utc_choices_with_different_lengths() {
        let hour = schedule(&["1005-24112026"], SlotSize::Hour);
        let short = schedule(
            &["1000-24112026", "1030-24112026", "1045-24112026"],
            SlotSize::QuarterHour,
        );
        let mut availability = Preferences::default();
        availability.replace_choices(&hour, &["1005-24112026".into()], &[], &[]);
        assert_eq!(
            availability.project(&short, &[]).0,
            ["1030-24112026", "1045-24112026"]
        );
        let edits = schedule(&["1030-24112026", "1045-24112026"], SlotSize::QuarterHour);
        availability.replace_choices(
            &edits,
            &["1030-24112026".into()],
            &["1045-24112026".into()],
            &[],
        );
        assert_eq!(availability.project(&hour, &[]).1, ["1005-24112026"]);
        let held = &short["1030-24112026"];
        assert!(availability.project(&hour, held).1.is_empty());
        assert_eq!(availability.project(&hour, &[]).1, ["1005-24112026"]);
    }

    #[test]
    fn carries_weekly_choices_across_midnight_at_the_end_of_the_week() {
        let saturday = schedule(&["2345-6"], SlotSize::HalfHour);
        let sunday = schedule(&["0000-0", "0015-0"], SlotSize::QuarterHour);
        let mut availability = Preferences::default();
        availability.replace_choices(&saturday, &["2345-6".into()], &[], &[]);
        assert_eq!(availability.project(&sunday, &[]).0, ["0000-0"]);
    }
}
