use serde::Serialize;

pub const TEN_MINUTES_MS: u64 = 10 * 60 * 1_000;
pub const SIX_HOURS_MS: u64 = 6 * 60 * 60 * 1_000;
const STARTUP_DELAY_MS: u64 = 30_000;

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(tag = "status", rename_all = "lowercase")]
pub enum Phase {
    Idle,
    Downloading { percent: u8 },
    Ready { version: String },
    Failed { message: String },
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub current_version: String,
    pub last_checked_at: Option<u64>,
    pub checking: bool,
    pub revision: u64,
    #[serde(flatten)]
    pub phase: Phase,
}

#[derive(Clone, Copy)]
pub enum Reason { Startup, Periodic, Focus, Manual }

pub fn is_newer(candidate: &str, current: &str) -> bool {
    match (semver::Version::parse(candidate), semver::Version::parse(current)) {
        (Ok(candidate), Ok(current)) => candidate.cmp_precedence(&current).is_gt(),
        _ => false,
    }
}

pub struct Model {
    pub snapshot: Snapshot,
    pub downloaded_version: Option<String>,
    pub stopped: bool,
    started_at: u64,
}

impl Model {
    pub fn new(current_version: String, started_at: u64) -> Self {
        Self {
            snapshot: Snapshot { current_version, last_checked_at: None, checking: false, revision: 0, phase: Phase::Idle },
            downloaded_version: None,
            stopped: false,
            started_at,
        }
    }

    pub fn begin(&mut self, reason: Reason, now: u64, debug: bool) -> bool {
        if debug || self.stopped || self.snapshot.checking { return false; }
        let elapsed = now.saturating_sub(self.snapshot.last_checked_at.unwrap_or(self.started_at));
        let due = match reason {
            Reason::Manual => true,
            Reason::Startup => self.snapshot.last_checked_at.is_none() && elapsed >= STARTUP_DELAY_MS,
            Reason::Focus => elapsed >= TEN_MINUTES_MS,
            Reason::Periodic => elapsed >= if self.snapshot.last_checked_at.is_some() { SIX_HOURS_MS } else { STARTUP_DELAY_MS },
        };
        if !due { return false; }
        self.snapshot.checking = true;
        self.snapshot.last_checked_at = Some(now);
        self.restore_phase();
        self.snapshot.revision += 1;
        true
    }

    pub fn offer(&mut self, version: &str) -> bool {
        if self.stopped || !self.snapshot.checking || !is_newer(version, &self.snapshot.current_version)
            || self.downloaded_version.as_deref().is_some_and(|ready| !is_newer(version, ready)) {
            return false;
        }
        self.snapshot.phase = Phase::Downloading { percent: 0 };
        self.snapshot.revision += 1;
        true
    }

    pub fn progress(&mut self, percent: u8) -> bool {
        if self.stopped || !matches!(self.snapshot.phase, Phase::Downloading { .. }) { return false; }
        let phase = Phase::Downloading { percent: percent.min(100) };
        if self.snapshot.phase == phase { return false; }
        self.snapshot.phase = phase;
        self.snapshot.revision += 1;
        true
    }

    pub fn prepared(&mut self, version: String) -> bool {
        if self.stopped { return false; }
        self.downloaded_version = Some(version);
        self.finish_check();
        true
    }

    fn restore_phase(&mut self) {
        self.snapshot.phase = self.downloaded_version.clone().map_or(Phase::Idle, |version| Phase::Ready { version });
    }

    pub fn finish_check(&mut self) {
        if self.stopped { return; }
        self.snapshot.checking = false;
        self.restore_phase();
        self.snapshot.revision += 1;
    }

    pub fn fail(&mut self, message: String) {
        if self.stopped { return; }
        self.snapshot.checking = false;
        self.snapshot.phase = Phase::Failed { message };
        self.snapshot.revision += 1;
    }

    pub fn stop(&mut self) {
        self.stopped = true;
        self.snapshot.checking = false;
    }
}

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
