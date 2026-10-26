//! JSON-lines host probe over public ReaderSession APIs. No Android build.
use rito_core::runtime::*;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    env, fs,
    io::{self, BufRead, Write},
};

fn point(v: &Value) -> ReaderTextPoint {
    ReaderTextPoint {
        page_index: 0,
        x: v["x"].as_f64().unwrap(),
        y: v["y"].as_f64().unwrap(),
    }
}
fn rect(r: &ReaderRect) -> Value {
    json!({"x":r.x,"y":r.y,"width":r.width,"height":r.height})
}
fn source(p: &ReaderSourcePoint) -> Value {
    json!({"nodePath":p.node_path,"textOffset":p.text_offset})
}

fn query(
    session: &mut ReaderSession,
    current: &mut Option<u64>,
    serial: &mut u64,
    v: Value,
) -> Result<Value, Box<dyn std::error::Error>> {
    match v["action"].as_str().unwrap() {
        "open" => {
            if let Some(id) = current.take() {
                session.release_artifact(id)?;
            }
            *serial += 1;
            let artifact = session.request_artifact(ReaderArtifactRequest {
                session_id: 77,
                request_id: *serial,
                locator: ReaderLocator {
                    href: v["href"].as_str().unwrap().to_owned(),
                    anchor_id: None,
                    source_point: None,
                    source_range: None,
                    progression: None,
                },
                layout: ReaderLayout {
                    viewport_width: 411.0,
                    viewport_height: 914.0,
                    margin_top: 88.76190567016602,
                    margin_right: 40.0,
                    margin_bottom: 64.0,
                    margin_left: 40.0,
                    spread_mode: ReaderSpreadMode::Single,
                    first_page_alone: true,
                    spread_gap: 0.0,
                    root_font_size: v["size"].as_f64().unwrap(),
                    line_height_override: None,
                    font_family_override: None,
                    line_height_force: false,
                    font_family_force: false,
                    render_ratio: 1.0,
                },
                text_profile: ReaderTextRenderingProfile::PlatformStringRuns,
            })?;
            *current = Some(artifact.artifact_id);
            let page = session.read_page(artifact.artifact_id, 0)?;
            Ok(json!({"artifactId":artifact.artifact_id,"text":page.text,
                "displaySha256":format!("{:x}",Sha256::digest(&artifact.display_list.bytes)),
                "wire":artifact.display_list.bytes,"hits":page.hits.iter().map(|h|
                    json!({"text":h.text,"bounds":rect(&h.bounds)})).collect::<Vec<_>>()}))
        }
        "select" => {
            let artifact_id = current.unwrap();
            let start = session.resolve_text_interaction(ReaderTextInteractionRequest {
                session_id: 77,
                artifact_id,
                query: ReaderTextInteractionQuery::Caret {
                    point: point(&v["anchor"]),
                },
                every_page: false,
            })?;
            let ReaderTextInteractionResult::Caret(caret) = start.result else {
                return Ok(json!({"status":format!("{:?}",start.result)}));
            };
            let response = session.resolve_text_interaction(ReaderTextInteractionRequest {
                session_id: 77,
                artifact_id,
                query: ReaderTextInteractionQuery::RangeToPoint {
                    anchor: caret.address,
                    focus: point(&v["focus"]),
                },
                every_page: false,
            })?;
            let ReaderTextInteractionResult::Selection(selected) = response.result else {
                return Ok(json!({"status":format!("{:?}",response.result)}));
            };
            let s = selected.selection;
            let range = ReaderSourceRange {
                start: s.source_start.clone(),
                end: s.source_end.clone(),
            };
            let target = session.resolve_annotation(ReaderAnnotationRequest {
                session_id: 77,
                query: ReaderAnnotationQuery::Create {
                    href: s.source_start_href,
                    range,
                },
            })?;
            Ok(json!({"status":"selected","text":s.selected_text,
                "start":source(&s.source_start),"end":source(&s.source_end),
                "targetJson":target.target.map(|t|t.json),
                "rects":s.rects.iter().map(|r|rect(&r.bounds)).collect::<Vec<_>>()}))
        }
        "restore" => {
            let target = session.resolve_annotation(ReaderAnnotationRequest {
                session_id: 77,
                query: ReaderAnnotationQuery::Resolve {
                    target_json: v["targetJson"].as_str().unwrap().to_owned(),
                },
            })?;
            let target = target.target.expect("target resolves");
            let result = session.resolve_exact_source_range(ReaderExactSourceRangeRequest {
                session_id: 77,
                artifact_id: current.unwrap(),
                href: target.href,
                range: target.range,
                every_page: true,
            })?;
            Ok(
                json!({"status":format!("{:?}",result.status),"text":result.selected_text,
                "rects":result.rects.iter().map(|r|rect(&r.bounds)).collect::<Vec<_>>()}),
            )
        }
        _ => panic!("unknown action"),
    }
}

fn main() {
    let args: Vec<_> = env::args().skip(1).collect();
    let bytes = fs::read(&args[0]).expect("EPUB");
    let font = fs::read(&args[1]).expect("font");
    let policy = RuntimePinnedFontPolicyInput {
        faces: vec![RuntimePinnedFontFaceInput {
            expected_sha256: format!("{:x}", Sha256::digest(&font)),
            bytes: font,
            generic_role: RuntimePinnedFontGenericRole::Serif,
            language: None,
        }],
    };
    let mut session =
        ReaderSession::open_owned_with_pinned_font_policy(77, bytes, policy).expect("session");
    let (mut current, mut serial) = (None, 0);
    for line in io::stdin().lock().lines() {
        let request = serde_json::from_str(&line.expect("line")).expect("request JSON");
        let output = match query(&mut session, &mut current, &mut serial, request) {
            Ok(value) => value,
            Err(e) => json!({"error":e.to_string()}),
        };
        println!("{}", output);
        io::stdout().flush().expect("flush");
    }
}
