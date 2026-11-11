//! The "game day" used by everything daily (coin cap, login reward, quests).
//! A day runs from 00:00 to 24:00 WIB (Western Indonesia Time, UTC+7).

use chrono::{DateTime, Datelike, Duration, NaiveDate, Utc};

/// WIB is a fixed UTC+7 offset (no daylight saving).
pub const WIB_OFFSET_HOURS: i64 = 7;

/// The WIB calendar date at `now`.
pub fn wib_date(now: DateTime<Utc>) -> NaiveDate {
    (now + Duration::hours(WIB_OFFSET_HOURS)).date_naive()
}

/// The moment (in UTC) a WIB date starts.
pub fn wib_day_start(date: NaiveDate) -> DateTime<Utc> {
    date.and_hms_opt(0, 0, 0).expect("midnight is valid").and_utc()
        - Duration::hours(WIB_OFFSET_HOURS)
}

/// Start of the current WIB day, in UTC.
pub fn today_start(now: DateTime<Utc>) -> DateTime<Utc> {
    wib_day_start(wib_date(now))
}

/// Monday (WIB) of the week containing `now`. Weeks run Monday 00:00 WIB
/// to the next Monday 00:00 WIB.
pub fn week_monday(now: DateTime<Utc>) -> NaiveDate {
    let d = wib_date(now);
    d - Duration::days(i64::from(d.weekday().num_days_from_monday()))
}

/// Start of the current WIB week, in UTC.
pub fn week_start(now: DateTime<Utc>) -> DateTime<Utc> {
    wib_day_start(week_monday(now))
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    fn utc(y: i32, m: u32, d: u32, h: u32, min: u32) -> DateTime<Utc> {
        Utc.with_ymd_and_hms(y, m, d, h, min, 0).unwrap()
    }

    #[test]
    fn wib_day_flips_at_17_00_utc() {
        let d = NaiveDate::from_ymd_opt(2026, 11, 6).unwrap();
        assert_eq!(wib_date(utc(2026, 11, 5, 16, 59)), d.pred_opt().unwrap());
        assert_eq!(wib_date(utc(2026, 11, 5, 17, 0)), d);
        assert_eq!(wib_date(utc(2026, 11, 6, 16, 59)), d);
        assert_eq!(wib_date(utc(2026, 11, 6, 17, 0)), d.succ_opt().unwrap());
    }

    #[test]
    fn day_start_is_midnight_wib() {
        let d = NaiveDate::from_ymd_opt(2026, 11, 6).unwrap();
        assert_eq!(wib_day_start(d), utc(2026, 11, 5, 17, 0));
        assert_eq!(today_start(utc(2026, 11, 6, 3, 30)), utc(2026, 11, 5, 17, 0));
        assert_eq!(today_start(utc(2026, 11, 5, 17, 0)), utc(2026, 11, 5, 17, 0));
    }

    #[test]
    fn weeks_start_monday_midnight_wib() {
        // 2026-11-09 is a Monday. Monday 00:00 WIB = Sunday 17:00 UTC.
        let mon = NaiveDate::from_ymd_opt(2026, 11, 9).unwrap();
        assert_eq!(week_monday(utc(2026, 11, 8, 17, 0)), mon);
        assert_eq!(week_monday(utc(2026, 11, 8, 16, 59)), mon - Duration::days(7));
        assert_eq!(week_monday(utc(2026, 11, 15, 16, 59)), mon);
        assert_eq!(week_start(utc(2026, 11, 11, 9, 0)), utc(2026, 11, 8, 17, 0));
    }
}
