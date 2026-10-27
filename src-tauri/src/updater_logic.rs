#[cfg(test)]
mod tests {
    use super::*;

    fn model() -> Model { Model::new("0.2.0".into(), 1_000) }

    #[test]
    fn versions_use_semver_and_reject_invalid_or_older_offers() {
        assert!(is_newer("0.2.10", "0.2.9"));
        assert!(is_newer("0.2.1", "0.2.1-beta.1"));
        for offer in ["0.2.0", "0.1.9", "0.2.0-beta.1", "invalid"] {
            assert!(!is_newer(offer, "0.2.0"));
        }
        assert!(!is_newer("0.2.1+build.2", "0.2.1+build.1"));
    }

    #[test]
    fn debug_builds_never_check_even_manually() {
        for reason in [Reason::Startup, Reason::Periodic, Reason::Focus, Reason::Manual] {
            assert!(!model().begin(reason, 999_999, true));
        }
    }

    #[test]
    fn startup_and_periodic_checks_wait_for_their_deadlines() {
        let mut m = model();
        assert!(!m.begin(Reason::Startup, 30_999, false));
        assert!(m.begin(Reason::Startup, 31_000, false));
        m.finish_check();
        assert!(!m.begin(Reason::Periodic, 31_000 + SIX_HOURS_MS - 1, false));
        assert!(m.begin(Reason::Periodic, 31_000 + SIX_HOURS_MS, false));
    }

    #[test]
    fn focus_checks_wait_ten_minutes_since_the_last_attempt() {
        let mut m = model();
        assert!(!m.begin(Reason::Focus, 31_000, false));
        assert!(m.begin(Reason::Manual, 100_000, false));
        m.fail("네트워크 오류".into());
        assert!(!m.begin(Reason::Focus, 100_000 + TEN_MINUTES_MS - 1, false));
        assert!(m.begin(Reason::Focus, 100_000 + TEN_MINUTES_MS, false));
    }

    #[test]
    fn only_one_check_or_download_runs_at_a_time() {
        let mut m = model();
        assert!(m.begin(Reason::Manual, 5_000, false));
        assert!(!m.begin(Reason::Manual, 5_001, false));
        assert!(m.offer("0.2.1"));
        m.progress(42);
        assert_eq!(m.snapshot.phase, Phase::Downloading { percent: 42 });
        assert!(!m.begin(Reason::Focus, 5_000 + TEN_MINUTES_MS, false));
        m.prepared("0.2.1".into());
        assert_eq!(m.snapshot.phase, Phase::Ready { version: "0.2.1".into() });
        assert!(!m.snapshot.checking);
    }

    #[test]
    fn prepared_version_is_not_downloaded_again_and_newer_offer_replaces_it() {
        let mut m = model();
        m.begin(Reason::Manual, 5_000, false);
        m.prepared("0.2.1".into());
        m.begin(Reason::Manual, 6_000, false);
        for version in ["0.2.0", "0.2.1", "0.1.0"] { assert!(!m.offer(version)); }
        m.finish_check();
        assert_eq!(m.snapshot.phase, Phase::Ready { version: "0.2.1".into() });
        m.begin(Reason::Manual, 7_000, false);
        assert!(m.offer("0.2.2"));
        m.prepared("0.2.2".into());
        assert_eq!(m.downloaded_version.as_deref(), Some("0.2.2"));
    }

    #[test]
    fn failed_replacement_preserves_the_verified_previous_download() {
        let mut m = model();
        m.begin(Reason::Manual, 5_000, false);
        m.prepared("0.2.1".into());
        m.begin(Reason::Manual, 6_000, false);
        m.offer("0.2.2");
        m.fail("서명 검증 실패".into());
        assert_eq!(m.downloaded_version.as_deref(), Some("0.2.1"));
        assert!(matches!(m.snapshot.phase, Phase::Failed { .. }));
        assert!(m.begin(Reason::Manual, 7_000, false));
        m.finish_check();
        assert_eq!(m.snapshot.phase, Phase::Ready { version: "0.2.1".into() });
    }

    #[test]
    fn progress_is_bounded_and_snapshots_have_increasing_revisions() {
        let mut m = model();
        let revision = m.snapshot.revision;
        m.begin(Reason::Manual, 5_000, false);
        assert!(m.snapshot.revision > revision);
        m.offer("0.2.1");
        m.progress(150);
        assert_eq!(m.snapshot.phase, Phase::Downloading { percent: 100 });
        assert_eq!(m.snapshot.last_checked_at, Some(5_000));
    }

    #[test]
    fn shutdown_blocks_checks_and_late_download_completion() {
        let mut m = model();
        m.begin(Reason::Manual, 5_000, false);
        m.offer("0.2.1");
        m.stop();
        assert!(!m.begin(Reason::Manual, 6_000, false));
        assert!(!m.prepared("0.2.1".into()));
        assert_eq!(m.downloaded_version, None);
    }
}
