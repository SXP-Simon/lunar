use std::{
    alloc::{GlobalAlloc, Layout, System},
    collections::{BTreeMap, BTreeSet},
    env,
    error::Error,
    fs,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, AtomicUsize, Ordering},
        Arc,
    },
    thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

use memory_stats::memory_stats;
use rito_core::runtime::{
    ReaderAdjacentAvailabilityV1, ReaderAdjacentDirectionV1, ReaderAdjacentRequestV1,
    ReaderArtifactRequestV1, ReaderArtifactV1, ReaderBackgroundHandoffV1,
    ReaderBackgroundRequestV1, ReaderBackgroundStateV1, ReaderForegroundHandoffV1, ReaderLayoutV1,
    ReaderLocatorV1, ReaderSemanticNodeV1, ReaderSessionV1, ReaderSpreadModeV1,
    ReaderTextRenderingProfileV1, ReaderWorkBudgetV1, RuntimePinnedFontFaceInput,
    RuntimePinnedFontGenericRole, RuntimePinnedFontLanguageTag, RuntimePinnedFontPolicyInput,
};
#[cfg(feature = "current")]
use rito_core_current as rito_core;
#[cfg(feature = "reference")]
use rito_core_reference as rito_core;
use serde::Serialize;
use sha2::{Digest, Sha256};

static LIVE_BYTES: AtomicUsize = AtomicUsize::new(0);
static PEAK_LIVE_BYTES: AtomicUsize = AtomicUsize::new(0);
static ALLOCATION_CALLS: AtomicUsize = AtomicUsize::new(0);
static DEALLOCATION_CALLS: AtomicUsize = AtomicUsize::new(0);
static REALLOCATION_CALLS: AtomicUsize = AtomicUsize::new(0);
static ACQUIRED_BYTES: AtomicUsize = AtomicUsize::new(0);
static RELEASED_BYTES: AtomicUsize = AtomicUsize::new(0);

struct TrackingAllocator;

#[global_allocator]
static GLOBAL: TrackingAllocator = TrackingAllocator;

impl TrackingAllocator {
    fn acquire(size: usize) {
        ALLOCATION_CALLS.fetch_add(1, Ordering::Relaxed);
        ACQUIRED_BYTES.fetch_add(size, Ordering::Relaxed);
        let live = LIVE_BYTES.fetch_add(size, Ordering::Relaxed) + size;
        PEAK_LIVE_BYTES.fetch_max(live, Ordering::Relaxed);
    }

    fn release(size: usize) {
        DEALLOCATION_CALLS.fetch_add(1, Ordering::Relaxed);
        RELEASED_BYTES.fetch_add(size, Ordering::Relaxed);
        LIVE_BYTES.fetch_sub(size, Ordering::Relaxed);
    }
}

unsafe impl GlobalAlloc for TrackingAllocator {
    unsafe fn alloc(&self, layout: Layout) -> *mut u8 {
        let pointer = unsafe { System.alloc(layout) };
        if !pointer.is_null() {
            Self::acquire(layout.size());
        }
        pointer
    }

    unsafe fn alloc_zeroed(&self, layout: Layout) -> *mut u8 {
        let pointer = unsafe { System.alloc_zeroed(layout) };
        if !pointer.is_null() {
            Self::acquire(layout.size());
        }
        pointer
    }

    unsafe fn dealloc(&self, pointer: *mut u8, layout: Layout) {
        unsafe { System.dealloc(pointer, layout) };
        Self::release(layout.size());
    }

    unsafe fn realloc(&self, pointer: *mut u8, layout: Layout, new_size: usize) -> *mut u8 {
        let replacement = unsafe { System.realloc(pointer, layout, new_size) };
        if replacement.is_null() {
            return replacement;
        }
        REALLOCATION_CALLS.fetch_add(1, Ordering::Relaxed);
        match new_size.cmp(&layout.size()) {
            std::cmp::Ordering::Greater => {
                let growth = new_size - layout.size();
                ACQUIRED_BYTES.fetch_add(growth, Ordering::Relaxed);
                let live = LIVE_BYTES.fetch_add(growth, Ordering::Relaxed) + growth;
                PEAK_LIVE_BYTES.fetch_max(live, Ordering::Relaxed);
            }
            std::cmp::Ordering::Less => {
                let reduction = layout.size() - new_size;
                RELEASED_BYTES.fetch_add(reduction, Ordering::Relaxed);
                LIVE_BYTES.fetch_sub(reduction, Ordering::Relaxed);
            }
            std::cmp::Ordering::Equal => {}
        }
        replacement
    }
}

#[derive(Clone, Copy)]
struct AllocatorSnapshot {
    live_bytes: usize,
    peak_live_bytes: usize,
    allocation_calls: usize,
    deallocation_calls: usize,
    reallocation_calls: usize,
    acquired_bytes: usize,
    released_bytes: usize,
}

impl AllocatorSnapshot {
    fn capture() -> Self {
        Self {
            live_bytes: LIVE_BYTES.load(Ordering::Relaxed),
            peak_live_bytes: PEAK_LIVE_BYTES.load(Ordering::Relaxed),
            allocation_calls: ALLOCATION_CALLS.load(Ordering::Relaxed),
            deallocation_calls: DEALLOCATION_CALLS.load(Ordering::Relaxed),
            reallocation_calls: REALLOCATION_CALLS.load(Ordering::Relaxed),
            acquired_bytes: ACQUIRED_BYTES.load(Ordering::Relaxed),
            released_bytes: RELEASED_BYTES.load(Ordering::Relaxed),
        }
    }
}

struct WorkingSetSampler {
    stop: Arc<AtomicBool>,
    peak: Arc<AtomicUsize>,
    samples: Arc<AtomicUsize>,
    handle: Option<thread::JoinHandle<()>>,
}

impl WorkingSetSampler {
    fn start(interval: Duration) -> Self {
        let stop = Arc::new(AtomicBool::new(false));
        let peak = Arc::new(AtomicUsize::new(
            memory_stats().map_or(0, |stats| stats.physical_mem),
        ));
        let samples = Arc::new(AtomicUsize::new(0));
        let thread_stop = Arc::clone(&stop);
        let thread_peak = Arc::clone(&peak);
        let thread_samples = Arc::clone(&samples);
        let handle = thread::spawn(move || {
            while !thread_stop.load(Ordering::Relaxed) {
                if let Some(stats) = memory_stats() {
                    thread_peak.fetch_max(stats.physical_mem, Ordering::Relaxed);
                    thread_samples.fetch_add(1, Ordering::Relaxed);
                }
                thread::sleep(interval);
            }
        });
        Self {
            stop,
            peak,
            samples,
            handle: Some(handle),
        }
    }

    fn peak(&self) -> usize {
        self.peak.load(Ordering::Relaxed)
    }

    fn samples(&self) -> usize {
        self.samples.load(Ordering::Relaxed)
    }

    fn stop(&mut self) {
        self.stop.store(true, Ordering::Relaxed);
        if let Some(handle) = self.handle.take() {
            let _ = handle.join();
        }
    }
}

impl Drop for WorkingSetSampler {
    fn drop(&mut self) {
        self.stop();
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProbeConfig {
    epub_path: String,
    epub_bytes: u64,
    epub_sha256: String,
    font_path: String,
    font_bytes: u64,
    font_sha256: String,
    viewport_width: f64,
    viewport_height: f64,
    margin_top: f64,
    margin_right: f64,
    margin_bottom: f64,
    margin_left: f64,
    root_font_size: f64,
    line_height: f64,
    spread_mode: String,
    work_nodes_per_quantum: u32,
    local_page_cap: u32,
    source_revision: String,
    source_path: String,
    device_parameter_source: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct MemoryPoint {
    name: String,
    elapsed_ms: u128,
    allocator_live_bytes: i128,
    allocator_peak_live_bytes: i128,
    allocation_calls: usize,
    deallocation_calls: usize,
    reallocation_calls: usize,
    acquired_bytes: usize,
    released_bytes: usize,
    working_set_bytes: Option<usize>,
    private_bytes: Option<usize>,
    sampled_peak_working_set_bytes: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct StageMeasurement {
    name: String,
    elapsed_ms: u128,
    allocator_live_change_bytes: i128,
    allocator_peak_live_bytes: i128,
    allocation_calls: usize,
    deallocation_calls: usize,
    reallocation_calls: usize,
    acquired_bytes: usize,
    released_bytes: usize,
}

struct MeasurementContext {
    started: Instant,
    baseline: AllocatorSnapshot,
    points: Vec<MemoryPoint>,
}

impl MeasurementContext {
    fn new() -> Self {
        PEAK_LIVE_BYTES.store(LIVE_BYTES.load(Ordering::Relaxed), Ordering::Relaxed);
        Self {
            started: Instant::now(),
            baseline: AllocatorSnapshot::capture(),
            points: Vec::with_capacity(16),
        }
    }

    fn point(&mut self, name: &str, sampler: &WorkingSetSampler) {
        let name = name.to_owned();
        let process = memory_stats();
        let current = AllocatorSnapshot::capture();
        self.points.push(MemoryPoint {
            name,
            elapsed_ms: self.started.elapsed().as_millis(),
            allocator_live_bytes: signed_diff(current.live_bytes, self.baseline.live_bytes),
            allocator_peak_live_bytes: signed_diff(
                current.peak_live_bytes,
                self.baseline.live_bytes,
            ),
            allocation_calls: current.allocation_calls - self.baseline.allocation_calls,
            deallocation_calls: current.deallocation_calls - self.baseline.deallocation_calls,
            reallocation_calls: current.reallocation_calls - self.baseline.reallocation_calls,
            acquired_bytes: current.acquired_bytes - self.baseline.acquired_bytes,
            released_bytes: current.released_bytes - self.baseline.released_bytes,
            working_set_bytes: process.map(|stats| stats.physical_mem),
            private_bytes: process.map(|stats| stats.virtual_mem),
            sampled_peak_working_set_bytes: sampler.peak(),
        });
    }
}

struct StageStart {
    started: Instant,
    allocator: AllocatorSnapshot,
}

impl StageStart {
    fn begin() -> Self {
        PEAK_LIVE_BYTES.store(LIVE_BYTES.load(Ordering::Relaxed), Ordering::Relaxed);
        Self {
            started: Instant::now(),
            allocator: AllocatorSnapshot::capture(),
        }
    }

    fn finish(self, name: &str, baseline_live_bytes: usize) -> StageMeasurement {
        let current = AllocatorSnapshot::capture();
        StageMeasurement {
            name: name.to_owned(),
            elapsed_ms: self.started.elapsed().as_millis(),
            allocator_live_change_bytes: signed_diff(current.live_bytes, self.allocator.live_bytes),
            allocator_peak_live_bytes: signed_diff(current.peak_live_bytes, baseline_live_bytes),
            allocation_calls: current.allocation_calls - self.allocator.allocation_calls,
            deallocation_calls: current.deallocation_calls - self.allocator.deallocation_calls,
            reallocation_calls: current.reallocation_calls - self.allocator.reallocation_calls,
            acquired_bytes: current.acquired_bytes - self.allocator.acquired_bytes,
            released_bytes: current.released_bytes - self.allocator.released_bytes,
        }
    }
}

#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
struct ArtifactTotals {
    artifact_count: u64,
    page_count: u64,
    display_command_count: u64,
    display_list_bytes: u64,
    hit_count: u64,
    semantic_node_count: u64,
    text_run_count: u64,
    text_utf8_bytes: u64,
    text_utf16_units: u64,
    resource_reference_count: u64,
    font_reference_count: u64,
}

impl ArtifactTotals {
    fn add(&mut self, artifact: &ReaderArtifactV1) {
        self.artifact_count += 1;
        self.page_count += artifact.pages.len() as u64;
        self.display_command_count += u64::from(artifact.display_list.command_count);
        self.display_list_bytes += artifact.display_list.bytes.len() as u64;
        self.resource_reference_count += artifact.resources.len() as u64;
        self.font_reference_count += artifact.fonts.len() as u64;
        for page in &artifact.pages {
            self.hit_count += page.hits.len() as u64;
            self.semantic_node_count += count_semantics(&page.semantics) as u64;
            self.text_run_count += page.text_runs.len() as u64;
            self.text_utf8_bytes += page.text.len() as u64;
            self.text_utf16_units += page.text.encode_utf16().count() as u64;
        }
    }
}

#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
struct ChapterTotals {
    href: String,
    first_book_page_index: Option<u32>,
    last_book_page_index: Option<u32>,
    #[serde(flatten)]
    totals: ArtifactTotals,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PaginationReport {
    initial_href: String,
    spine_item_count: usize,
    background_call_count: u32,
    background_states: Vec<String>,
    final_book_page_count: u32,
    traversal_terminal_state: String,
    initial_artifact: ArtifactTotals,
    publication: ArtifactTotals,
    chapters: Vec<ChapterTotals>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProbeReport {
    schema_version: u32,
    generated_at_unix_seconds: u64,
    platform: String,
    allocator: String,
    working_set_sample_interval_ms: u64,
    working_set_sample_count: usize,
    config: ProbeConfig,
    stages: Vec<StageMeasurement>,
    memory_points: Vec<MemoryPoint>,
    pagination: PaginationReport,
}

struct Args {
    epub_path: PathBuf,
    output_path: Option<PathBuf>,
    font_path: PathBuf,
    source_revision: String,
    source_path: String,
    width: f64,
    height: f64,
    margin_top: f64,
    margin_right: f64,
    margin_bottom: f64,
    margin_left: f64,
}

impl Args {
    fn parse() -> Result<Self, Box<dyn Error>> {
        let mut values = env::args().skip(1);
        let epub_path = values.next().map(PathBuf::from).ok_or(
            "usage: rito-memory-probe <book.epub> [--output report.json] [layout options]",
        )?;
        let default_font = default_font_path();
        let mut args = Self {
            epub_path,
            output_path: None,
            font_path: default_font,
            source_revision: "unknown".to_owned(),
            source_path: default_source_path().to_owned(),
            width: 1080.0 / 2.75,
            height: 2400.0 / 2.75,
            margin_top: 84.0,
            margin_right: 24.0,
            margin_bottom: 56.0,
            margin_left: 24.0,
        };
        while let Some(flag) = values.next() {
            let value = values
                .next()
                .ok_or_else(|| format!("missing value for {flag}"))?;
            match flag.as_str() {
                "--output" => args.output_path = Some(PathBuf::from(value)),
                "--font" => args.font_path = PathBuf::from(value),
                "--source-revision" => args.source_revision = value,
                "--source-path" => args.source_path = value,
                "--width" => args.width = parse_number(&flag, &value)?,
                "--height" => args.height = parse_number(&flag, &value)?,
                "--margin-top" => args.margin_top = parse_number(&flag, &value)?,
                "--margin-right" => args.margin_right = parse_number(&flag, &value)?,
                "--margin-bottom" => args.margin_bottom = parse_number(&flag, &value)?,
                "--margin-left" => args.margin_left = parse_number(&flag, &value)?,
                _ => return Err(format!("unknown option: {flag}").into()),
            }
        }
        Ok(args)
    }
}

fn main() -> Result<(), Box<dyn Error>> {
    let args = Args::parse()?;
    let mut sampler = WorkingSetSampler::start(Duration::from_millis(5));
    let mut measurement = MeasurementContext::new();
    let mut stages = Vec::with_capacity(8);
    measurement.point("baseline", &sampler);

    let stage = StageStart::begin();
    let epub_bytes = fs::read(&args.epub_path)?;
    let epub_sha256 = sha256_hex(&epub_bytes);
    let epub_len = epub_bytes.len() as u64;
    stages.push(stage.finish("readEpub", measurement.baseline.live_bytes));
    measurement.point("afterEpubRead", &sampler);

    let stage = StageStart::begin();
    let font_bytes = fs::read(&args.font_path)?;
    let font_sha256 = sha256_hex(&font_bytes);
    let font_len = font_bytes.len() as u64;
    stages.push(stage.finish("readPinnedFont", measurement.baseline.live_bytes));
    measurement.point("afterPinnedFontRead", &sampler);

    let policy = RuntimePinnedFontPolicyInput {
        faces: vec![RuntimePinnedFontFaceInput {
            bytes: font_bytes,
            expected_sha256: font_sha256.clone(),
            generic_role: RuntimePinnedFontGenericRole::Serif,
            language: Some(RuntimePinnedFontLanguageTag::parse("und")?),
        }],
    };
    let stage = StageStart::begin();
    let mut session = ReaderSessionV1::open_owned_with_pinned_font_policy(1, epub_bytes, policy)?;
    stages.push(stage.finish("openSession", measurement.baseline.live_bytes));
    measurement.point("afterSessionOpen", &sampler);

    let publication = session.publication_v1();
    let initial_href = publication
        .spine
        .iter()
        .find(|item| item.linear_index.is_some())
        .or_else(|| publication.spine.first())
        .ok_or("EPUB contains no spine items")?
        .href
        .clone();
    let spine_item_count = publication.spine.len();
    let layout = ReaderLayoutV1 {
        viewport_width: args.width,
        viewport_height: args.height,
        margin_top: args.margin_top,
        margin_right: args.margin_right,
        margin_bottom: args.margin_bottom,
        margin_left: args.margin_left,
        spread_mode: ReaderSpreadModeV1::Single,
        first_page_alone: false,
        spread_gap: 0.0,
        root_font_size: 18.0,
        line_height_override: Some(1.65),
        font_family_override: Some("LunarWenKai".to_owned()),
    };
    let work = ReaderWorkBudgetV1 {
        max_top_level_nodes_per_quantum: 64,
        max_foreground_quanta: 8,
        local_page_cap: 16,
    };
    let request = ReaderArtifactRequestV1 {
        session_id: 1,
        request_id: 1,
        layout: layout.clone(),
        locator: ReaderLocatorV1 {
            href: initial_href.clone(),
            anchor_id: None,
            source_point: None,
            source_range: None,
            progression: None,
        },
        work,
        text_profile: ReaderTextRenderingProfileV1::PlatformStringRuns,
    };
    let stage = StageStart::begin();
    let first = session.request_artifact(request)?;
    session.adopt_foreground_candidate(ReaderForegroundHandoffV1 {
        session_id: 1,
        expected_visible_artifact_id: None,
        candidate_artifact_id: first.artifact_id,
    })?;
    stages.push(stage.finish("buildInitialArtifact", measurement.baseline.live_bytes));
    let mut initial_totals = ArtifactTotals::default();
    initial_totals.add(&first);
    let mut visible_artifact_id = first.artifact_id;
    measurement.point("initialArtifactPayloadLive", &sampler);
    drop(first);
    measurement.point("afterInitialArtifactPayloadDrop", &sampler);

    let stage = StageStart::begin();
    let mut background_call_count = 0u32;
    let mut background_states = Vec::new();
    let mut publication_artifact = None;
    let mut final_book_page_count = None;
    loop {
        background_call_count += 1;
        if background_call_count > 4096 {
            return Err("background pagination exceeded 4096 calls".into());
        }
        let mut advance = session.advance_background_once(ReaderBackgroundRequestV1 {
            session_id: 1,
            expected_visible_artifact_id: visible_artifact_id,
            max_top_level_nodes_per_quantum: 64,
        })?;
        background_states.push(format!("{:?}", advance.state));
        if let Some(candidate) = advance.artifact.take() {
            if advance.moves_visible_content {
                session.release_artifact(candidate.artifact_id)?;
            } else {
                let candidate_id = candidate.artifact_id;
                final_book_page_count = candidate.book_page_count.or(final_book_page_count);
                session.adopt_background_candidate(ReaderBackgroundHandoffV1 {
                    session_id: 1,
                    expected_visible_artifact_id: visible_artifact_id,
                    candidate_artifact_id: candidate_id,
                })?;
                session.release_artifact(visible_artifact_id)?;
                visible_artifact_id = candidate_id;
                publication_artifact = Some(candidate);
            }
        }
        if advance.state == ReaderBackgroundStateV1::Complete {
            break;
        }
    }
    stages.push(stage.finish("paginateWholeBook", measurement.baseline.live_bytes));

    let mut publication_totals = ArtifactTotals::default();
    let mut chapter_totals = BTreeMap::<String, ChapterTotals>::new();
    let mut seen_book_pages = BTreeSet::new();
    let current = publication_artifact.ok_or("background pagination produced no artifact")?;
    final_book_page_count = current.book_page_count.or(final_book_page_count);
    add_publication_artifact(
        &mut publication_totals,
        &mut chapter_totals,
        &mut seen_book_pages,
        &current,
    );
    let mut previous_state = current.navigation.previous;
    drop(current);
    measurement.point("afterWholeBookPagination", &sampler);

    let stage = StageStart::begin();
    let mut request_id = 2u64;
    let mut next_traversal_checkpoint = 500usize;
    while previous_state != ReaderAdjacentAvailabilityV1::Terminal {
        if previous_state == ReaderAdjacentAvailabilityV1::Blocked {
            return Err("publication reverse traversal reached a blocked page".into());
        }
        let previous = session.request_adjacent(ReaderAdjacentRequestV1 {
            session_id: 1,
            request_id,
            from_artifact_id: visible_artifact_id,
            direction: ReaderAdjacentDirectionV1::Previous,
            work,
        })?;
        request_id += 1;
        let previous_id = previous.artifact_id;
        session.adopt_foreground_candidate(ReaderForegroundHandoffV1 {
            session_id: 1,
            expected_visible_artifact_id: Some(visible_artifact_id),
            candidate_artifact_id: previous_id,
        })?;
        session.release_artifact(visible_artifact_id)?;
        visible_artifact_id = previous_id;
        previous_state = previous.navigation.previous;
        add_publication_artifact(
            &mut publication_totals,
            &mut chapter_totals,
            &mut seen_book_pages,
            &previous,
        );
        record_traversal_checkpoints(
            &mut measurement,
            &sampler,
            seen_book_pages.len(),
            &mut next_traversal_checkpoint,
        );
        drop(previous);
    }

    let mut next_state = ReaderAdjacentAvailabilityV1::Available;
    while next_state != ReaderAdjacentAvailabilityV1::Terminal {
        if next_state == ReaderAdjacentAvailabilityV1::Blocked {
            return Err("publication traversal reached a blocked page".into());
        }
        let next = session.request_adjacent(ReaderAdjacentRequestV1 {
            session_id: 1,
            request_id,
            from_artifact_id: visible_artifact_id,
            direction: ReaderAdjacentDirectionV1::Next,
            work,
        })?;
        request_id += 1;
        let next_id = next.artifact_id;
        session.adopt_foreground_candidate(ReaderForegroundHandoffV1 {
            session_id: 1,
            expected_visible_artifact_id: Some(visible_artifact_id),
            candidate_artifact_id: next_id,
        })?;
        session.release_artifact(visible_artifact_id)?;
        visible_artifact_id = next_id;
        next_state = next.navigation.next;
        add_publication_artifact(
            &mut publication_totals,
            &mut chapter_totals,
            &mut seen_book_pages,
            &next,
        );
        record_traversal_checkpoints(
            &mut measurement,
            &sampler,
            seen_book_pages.len(),
            &mut next_traversal_checkpoint,
        );
        drop(next);
        if request_id > u64::from(final_book_page_count.unwrap_or(0)) * 2 + 16 {
            return Err("publication traversal exceeded reported page count".into());
        }
    }
    stages.push(stage.finish("traversePublication", measurement.baseline.live_bytes));
    measurement.point("afterPublicationTraversal", &sampler);

    let stage = StageStart::begin();
    session.release_artifact(visible_artifact_id)?;
    stages.push(stage.finish("releaseVisibleArtifact", measurement.baseline.live_bytes));
    measurement.point("afterVisibleArtifactRelease", &sampler);

    let stage = StageStart::begin();
    session.dispose()?;
    stages.push(stage.finish("disposeSession", measurement.baseline.live_bytes));
    measurement.point("afterSessionDispose", &sampler);
    sampler.stop();

    let report = ProbeReport {
        schema_version: 1,
        generated_at_unix_seconds: SystemTime::now().duration_since(UNIX_EPOCH)?.as_secs(),
        platform: env::consts::OS.to_owned(),
        allocator: "instrumented std::alloc::System".to_owned(),
        working_set_sample_interval_ms: 5,
        working_set_sample_count: sampler.samples(),
        config: ProbeConfig {
            epub_path: absolute_display(&args.epub_path),
            epub_bytes: epub_len,
            epub_sha256,
            font_path: absolute_display(&args.font_path),
            font_bytes: font_len,
            font_sha256,
            viewport_width: args.width,
            viewport_height: args.height,
            margin_top: args.margin_top,
            margin_right: args.margin_right,
            margin_bottom: args.margin_bottom,
            margin_left: args.margin_left,
            root_font_size: 18.0,
            line_height: 1.65,
            spread_mode: "single".to_owned(),
            work_nodes_per_quantum: 64,
            local_page_cap: 16,
            source_revision: args.source_revision,
            source_path: args.source_path,
            device_parameter_source:
                "ADB: fuxi 1080x2400 at 440 dpi, rotation 0, status bar 121 px, navigation bar 44 px"
                    .to_owned(),
        },
        stages,
        memory_points: measurement.points,
        pagination: PaginationReport {
            initial_href,
            spine_item_count,
            background_call_count,
            background_states,
            final_book_page_count: final_book_page_count
                .ok_or("publication artifact omitted book page count")?,
            traversal_terminal_state: format!("{next_state:?}"),
            initial_artifact: initial_totals,
            publication: publication_totals,
            chapters: sorted_chapters(chapter_totals),
        },
    };
    let json = serde_json::to_string_pretty(&report)?;
    if let Some(path) = args.output_path {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::write(&path, json)?;
        eprintln!("wrote {}", path.display());
    } else {
        println!("{json}");
    }
    Ok(())
}

fn add_publication_artifact(
    totals: &mut ArtifactTotals,
    chapters: &mut BTreeMap<String, ChapterTotals>,
    seen_book_pages: &mut BTreeSet<u32>,
    artifact: &ReaderArtifactV1,
) {
    let Some(book_page_index) = artifact.book_page_index else {
        return;
    };
    if !seen_book_pages.insert(book_page_index) {
        return;
    }
    totals.add(artifact);
    let chapter = chapters
        .entry(artifact.locator.href.clone())
        .or_insert_with(|| ChapterTotals {
            href: artifact.locator.href.clone(),
            ..ChapterTotals::default()
        });
    chapter.first_book_page_index = Some(
        chapter
            .first_book_page_index
            .map_or(book_page_index, |current| current.min(book_page_index)),
    );
    chapter.last_book_page_index = Some(
        chapter
            .last_book_page_index
            .map_or(book_page_index, |current| current.max(book_page_index)),
    );
    chapter.totals.add(artifact);
}

fn sorted_chapters(chapters: BTreeMap<String, ChapterTotals>) -> Vec<ChapterTotals> {
    let mut chapters = chapters.into_values().collect::<Vec<_>>();
    chapters.sort_by_key(|chapter| chapter.first_book_page_index);
    chapters
}

fn record_traversal_checkpoints(
    measurement: &mut MeasurementContext,
    sampler: &WorkingSetSampler,
    visited_pages: usize,
    next_checkpoint: &mut usize,
) {
    while visited_pages >= *next_checkpoint {
        measurement.point(&format!("afterVisiting{}Pages", *next_checkpoint), sampler);
        *next_checkpoint += 500;
    }
}

fn count_semantics(nodes: &[ReaderSemanticNodeV1]) -> usize {
    nodes
        .iter()
        .map(|node| 1 + count_semantics(&node.children))
        .sum()
}

fn parse_number(flag: &str, value: &str) -> Result<f64, Box<dyn Error>> {
    let parsed: f64 = value
        .parse()
        .map_err(|_| format!("invalid number for {flag}: {value}"))?;
    if !parsed.is_finite() || parsed < 0.0 {
        return Err(format!("{flag} must be a finite non-negative number").into());
    }
    Ok(parsed)
}

fn sha256_hex(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

fn signed_diff(value: usize, baseline: usize) -> i128 {
    value as i128 - baseline as i128
}

fn absolute_display(path: &Path) -> String {
    path.canonicalize()
        .unwrap_or_else(|_| path.to_path_buf())
        .display()
        .to_string()
}

#[cfg(all(feature = "current", feature = "reference"))]
compile_error!("enable exactly one of the current or reference features");

#[cfg(not(any(feature = "current", feature = "reference")))]
compile_error!("enable one of the current or reference features");

#[cfg(feature = "current")]
const fn default_source_path() -> &'static str {
    "modules/rito-rn/native/rito/crates/rito-core"
}

#[cfg(feature = "current")]
fn default_font_path() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../../assets/fonts/LXGWWenKai-Regular.ttf")
}

#[cfg(feature = "reference")]
const fn default_source_path() -> &'static str {
    "lib/Rito/crates/rito-core"
}

#[cfg(feature = "reference")]
fn default_font_path() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../../../assets/fonts/LXGWWenKai-Regular.ttf")
}
