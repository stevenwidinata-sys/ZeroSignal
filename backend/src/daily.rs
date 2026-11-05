//! The "game day" used by everything daily (coin cap, login reward, quests).
//! A day runs from 00:00 to 24:00 WIB (Western Indonesia Time, UTC+7).

use chrono::{DateTime, Duration, NaiveDate, Utc};

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
}
