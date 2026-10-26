//! Host validation using the production ReaderSession API, not Android rendering.
//! Copy into crates/rito-core/examples/search_wrap_native.rs and run with:
//! cargo run --locked -p rito-core --example search_wrap_native -- book.epub font.ttf ...
use std::{env, fs};

use rito_core::runtime::{
    ReaderArtifactRequest, ReaderExactSourceRangeRequest, ReaderLayout, ReaderLocator,
    ReaderSearchRequest, ReaderSession, ReaderSpreadMode, ReaderTextPosition,
    ReaderTextRangeRequest, ReaderTextRenderingProfile, RuntimePinnedFontFaceInput,
    RuntimePinnedFontGenericRole, RuntimePinnedFontLanguageTag, RuntimePinnedFontPolicyInput,
};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

fn position(p: ReaderTextPosition) -> Value {
    json!({"blockIndex":p.block_index,"lineIndex":p.line_index,
        "runIndex":p.run_index,"charIndex":p.char_index})
}

fn main() {
    let args: Vec<_> = env::args().skip(1).collect();
    assert!(args.len() >= 2, "usage: search_wrap_native EPUB FONT...");
    let bytes = fs::read(&args[0]).expect("EPUB");
    let policy = RuntimePinnedFontPolicyInput {
        faces: args[1..]
            .iter()
            .enumerate()
            .map(|(index, path)| {
                let bytes = fs::read(path).expect("font");
                RuntimePinnedFontFaceInput {
                    expected_sha256: format!("{:x}", Sha256::digest(&bytes)),
                    bytes,
                    generic_role: RuntimePinnedFontGenericRole::Serif,
                    language: (index > 0)
                        .then(|| RuntimePinnedFontLanguageTag::parse("zh-CN").expect("language")),
                }
            })
            .collect(),
    };
    let mut session = ReaderSession::open_owned_with_pinned_font_policy(71, bytes.clone(), policy)
        .expect("session");
    let artifact = session
        .request_artifact(ReaderArtifactRequest {
            session_id: 71,
            request_id: 1,
            layout: ReaderLayout {
                viewport_width: 411.0,
                viewport_height: 914.0,
                margin_top: 88.76190567016602,
                margin_bottom: 64.0,
                margin_left: 40.0,
                margin_right: 40.0,
                spread_mode: ReaderSpreadMode::Single,
                first_page_alone: true,
                spread_gap: 0.0,
                root_font_size: 22.0,
                line_height_override: Some(1.65),
                line_height_force: true,
                font_family_override: None,
                font_family_force: false,
                render_ratio: 2.625,
            },
            locator: ReaderLocator {
                href: String::new(),
                anchor_id: None,
                source_point: None,
                source_range: None,
                progression: None,
            },
            text_profile: ReaderTextRenderingProfile::PlatformStringRuns,
        })
        .expect("artifact");
    let records: Vec<_> = artifact
        .pages
        .iter()
        .map(|page| {
            session
                .read_page(artifact.artifact_id, page.page_index)
                .expect("page records")
        })
        .collect();
    let cjk = "清晨的微风掠过窗台，书页上的文字随着视线缓缓向前延伸，读者应当能够搜索跨越自动换行的完整句子。";
    let english = "A reader should find this complete sentence even when narrow pages wrap it onto several visual lines.";
    let queries = [
        cjk,
        english,
        "清晨的微风",
        "visual lines.",
        "硬换行前的句子硬换行后的句子",
        "段落分隔控制甲段落分隔控制乙",
    ];
    let mut tests = Vec::new();
    for query in queries {
        let response = session
            .search(ReaderSearchRequest {
                session_id: 71,
                artifact_id: artifact.artifact_id,
                query: query.to_owned(),
                case_sensitive: true,
                whole_word: false,
                limit: 0,
            })
            .expect("search");
        let mut hits = Vec::new();
        for hit in response.results {
            let geometry = session
                .get_text_range_geometry(ReaderTextRangeRequest {
                    session_id: 71,
                    artifact_id: artifact.artifact_id,
                    page_index: hit.page_index,
                    start: hit.start,
                    end: hit.end,
                })
                .expect("search geometry");
            let mut source = Value::Null;
            if let Some(locator) = hit.locator {
                if let Some(range) = locator.source_range {
                    let projected = session
                        .resolve_exact_source_range(ReaderExactSourceRangeRequest {
                            session_id: 71,
                            artifact_id: artifact.artifact_id,
                            href: locator.href.clone(),
                            range: range.clone(),
                            every_page: true,
                        })
                        .expect("source projection");
                    source = json!({"href":locator.href,
                        "start":{"nodePath":range.start.node_path,"textOffset":range.start.text_offset},
                        "end":{"nodePath":range.end.node_path,"textOffset":range.end.text_offset},
                        "status":format!("{:?}",projected.status),
                        "selectedText":projected.selected_text,"rectCount":projected.rects.len()});
                }
            }
            hits.push(json!({"pageIndex":hit.page_index,"start":position(hit.start),
                "end":position(hit.end),"source":source,"rectCount":geometry.rects.len(),
                "rects":geometry.rects.iter().map(|r|json!({"line":r.line_index,
                    "x":r.bounds.x,"y":r.bounds.y,"width":r.bounds.width,"height":r.bounds.height})).collect::<Vec<_>>()}));
        }
        tests.push(
            json!({"query":query,"searchedPageCount":response.searched_page_count,
            "truncated":response.truncated,"results":hits}),
        );
    }
    println!(
        "{}",
        serde_json::to_string_pretty(&json!({
            "epubSha256":format!("{:x}",Sha256::digest(&bytes)),
            "displayListSha256":format!("{:x}",Sha256::digest(&artifact.display_list.bytes)),
            "pages":records.iter().map(|r|json!({"pageIndex":r.page_index,"text":r.text,
                "textLength":r.text_length})).collect::<Vec<_>>(),"tests":tests,
        }))
        .expect("JSON")
    );
}
