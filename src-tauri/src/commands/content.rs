use crate::db::DbPool;
use crate::models::{ContentItem, ContentType};
use rusqlite::params;
use std::{
    fs,
    io::{Cursor, Read},
    path::{Path, PathBuf},
    process::Command,
};
use tauri::{Manager, State};
use zip::ZipArchive;

fn parse_content_type(value: &str) -> ContentType {
    match value {
        "Video" => ContentType::Video,
        "Image" => ContentType::Image,
        "WebApp" => ContentType::WebApp,
        "Ad" => ContentType::Ad,
        "Slideshow" => ContentType::Slideshow,
        "Document" => ContentType::Document,
        "Spreadsheet" => ContentType::Spreadsheet,
        "Presentation" => ContentType::Presentation,
        _ => ContentType::Image,
    }
}

#[tauri::command]
pub async fn get_content_items(pool: State<'_, DbPool>) -> Result<Vec<ContentItem>, String> {
    let pool = pool.inner().clone();
    tokio::task::spawn_blocking(move || {
        let conn = pool.get().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare(
                "SELECT id, name, content_type, file_path, url, duration_secs, tags, metadata_json, created_at
                 FROM content_items ORDER BY created_at DESC",
            )
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map([], |row| {
                let ct_str: String = row.get(2)?;
                let content_type = parse_content_type(&ct_str);

                let tags_str: String = row.get(6).unwrap_or_else(|_| "[]".to_string());
                let tags: Vec<String> = serde_json::from_str(&tags_str).unwrap_or_default();

                let metadata_str: String = row.get(7).unwrap_or_else(|_| "{}".to_string());
                let metadata_json: serde_json::Value = serde_json::from_str(&metadata_str)
                    .unwrap_or_else(|_| serde_json::json!({}));

                let created_at_str: String = row.get(8)?;
                let created_at = chrono::DateTime::parse_from_rfc3339(&created_at_str)
                    .map(|dt| dt.with_timezone(&chrono::Utc))
                    .unwrap_or_else(|_| chrono::Utc::now());

                Ok(ContentItem {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    content_type,
                    file_path: row.get(3)?,
                    url: row.get(4)?,
                    duration_secs: row.get::<_, i32>(5)? as u32,
                    tags,
                    metadata_json,
                    created_at,
                })
            })
            .map_err(|e| e.to_string())?;

        let mut items = Vec::new();
        for item_res in rows {
            items.push(item_res.map_err(|e| e.to_string())?);
        }

        Ok(items)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn add_content_item(
    name: String,
    content_type: String,
    file_path: Option<String>,
    url: Option<String>,
    duration_secs: u32,
    tags: Vec<String>,
    metadata_json: Option<serde_json::Value>,
    pool: State<'_, DbPool>,
) -> Result<ContentItem, String> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now();
    let pool = pool.inner().clone();

    let ct = parse_content_type(&content_type);

    let duration = duration_secs as i32;
    let tags_str = serde_json::to_string(&tags).unwrap_or_else(|_| "[]".to_string());
    let metadata = metadata_json.unwrap_or_else(|| serde_json::json!({}));
    let metadata_str = serde_json::to_string(&metadata).unwrap_or_else(|_| "{}".to_string());

    let id_clone = id.clone();
    let name_clone = name.clone();
    let content_type_clone = content_type.clone();
    let file_path_clone = file_path.clone();
    let url_clone = url.clone();

    tokio::task::spawn_blocking(move || {
        let conn = pool.get().map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT INTO content_items (id, name, content_type, file_path, url, duration_secs, tags, metadata_json, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                id_clone,
                name_clone,
                content_type_clone,
                file_path_clone,
                url_clone,
                duration,
                tags_str,
                metadata_str,
                now.to_rfc3339(),
            ],
        )
        .map_err(|e| e.to_string())?;
        Ok::<(), String>(())
    })
    .await
    .map_err(|e| e.to_string())??;

    Ok(ContentItem {
        id,
        name,
        content_type: ct,
        file_path,
        url,
        duration_secs,
        tags,
        metadata_json: metadata,
        created_at: now,
    })
}

#[tauri::command]
pub async fn delete_content_item(id: String, pool: State<'_, DbPool>) -> Result<(), String> {
    let pool = pool.inner().clone();
    tokio::task::spawn_blocking(move || {
        let conn = pool.get().map_err(|e| e.to_string())?;
        conn.execute(
            "DELETE FROM content_items WHERE id = ?1",
            params![id],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn save_local_content_file(
    filename: String,
    bytes: Vec<u8>,
    app_handle: tauri::AppHandle,
) -> Result<String, String> {
    let file_path = local_content_path(&app_handle, &filename).await?;
    tokio::fs::write(&file_path, &bytes).await.map_err(|e| e.to_string())?;

    Ok(file_path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn save_local_content_file_chunk(
    filename: String,
    bytes: Vec<u8>,
    append: bool,
    app_handle: tauri::AppHandle,
) -> Result<String, String> {
    let file_path = local_content_path(&app_handle, &filename).await?;
    let mut options = tokio::fs::OpenOptions::new();
    options.create(true).write(true);
    if append {
        options.append(true);
    } else {
        options.truncate(true);
    }
    let mut file = options.open(&file_path).await.map_err(|e| e.to_string())?;
    use tokio::io::AsyncWriteExt;
    file.write_all(&bytes).await.map_err(|e| e.to_string())?;
    file.flush().await.map_err(|e| e.to_string())?;
    Ok(file_path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn prepare_presentation_content(file_path: String) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        let source_path = PathBuf::from(file_path);
        if !source_path.is_file() {
            return Err("Presentation file was not saved correctly.".to_string());
        }

        if let Some(pdf_path) = try_convert_presentation_to_pdf(&source_path) {
            return Ok(pdf_path.to_string_lossy().to_string());
        }

        let extension = file_extension(&source_path);
        let title = source_path
            .file_stem()
            .and_then(|value| value.to_str())
            .unwrap_or("Presentation");
        let html = if matches!(extension.as_deref(), Some("pptx" | "ppsx")) {
            let bytes = fs::read(&source_path).map_err(|error| error.to_string())?;
            build_pptx_html(title, bytes).unwrap_or_else(|error| {
                fallback_presentation_html(
                    title,
                    &format!("This presentation could not be parsed automatically: {error}"),
                )
            })
        } else {
            fallback_presentation_html(
                title,
                "Legacy .ppt files need LibreOffice installed on this computer, or please export the deck as .pptx or PDF.",
            )
        };

        let viewer_path = presentation_viewer_path(&source_path);
        fs::write(&viewer_path, html).map_err(|error| error.to_string())?;
        Ok(viewer_path.to_string_lossy().to_string())
    })
    .await
    .map_err(|error| error.to_string())?
}

async fn local_content_path(app_handle: &tauri::AppHandle, filename: &str) -> Result<PathBuf, String> {
    let app_data_dir = app_handle.path().app_data_dir().map_err(|e| e.to_string())?;
    let media_dir = app_data_dir.join("media");
    tokio::fs::create_dir_all(&media_dir).await.map_err(|e| e.to_string())?;
    let safe_name = Path::new(filename)
        .file_name()
        .and_then(|value| value.to_str())
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| "Invalid file name".to_string())?;
    Ok(media_dir.join(safe_name))
}

fn file_extension(path: &Path) -> Option<String> {
    path.extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase())
}

fn presentation_viewer_path(source_path: &Path) -> PathBuf {
    let stem = source_path
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("presentation");
    source_path.with_file_name(format!("{stem}.presentation.html"))
}

fn try_convert_presentation_to_pdf(source_path: &Path) -> Option<PathBuf> {
    let output_dir = source_path.parent()?;
    let stem = source_path.file_stem()?.to_str()?;
    let pdf_path = output_dir.join(format!("{stem}.pdf"));
    let candidates = [
        "soffice",
        "libreoffice",
        "/Applications/LibreOffice.app/Contents/MacOS/soffice",
    ];

    for candidate in candidates {
        let status = Command::new(candidate)
            .arg("--headless")
            .arg("--convert-to")
            .arg("pdf")
            .arg("--outdir")
            .arg(output_dir)
            .arg(source_path)
            .status();
        if matches!(status, Ok(value) if value.success()) && pdf_path.is_file() {
            return Some(pdf_path);
        }
    }

    None
}

fn build_pptx_html(title: &str, bytes: Vec<u8>) -> anyhow::Result<String> {
    let mut archive = ZipArchive::new(Cursor::new(bytes))?;
    let mut slide_paths = Vec::new();
    for index in 0..archive.len() {
        let name = archive.by_index(index)?.name().to_string();
        if name.starts_with("ppt/slides/slide") && name.ends_with(".xml") && !name.contains("/_rels/") {
            slide_paths.push(name);
        }
    }
    slide_paths.sort_by_key(|name| slide_number(name));

    let mut slides = Vec::new();
    for slide_path in slide_paths {
        let slide_xml = read_zip_text(&mut archive, &slide_path).unwrap_or_default();
        let text_blocks = extract_slide_text(&slide_xml);
        let images = extract_slide_images(&mut archive, &slide_path);
        slides.push(render_slide_html(slides.len() + 1, text_blocks, images));
    }

    if slides.is_empty() {
        anyhow::bail!("No slides were found in the PowerPoint file.");
    }

    Ok(render_presentation_html(title, &slides.join("\n")))
}

fn slide_number(name: &str) -> u32 {
    name.rsplit('/')
        .next()
        .unwrap_or_default()
        .trim_start_matches("slide")
        .trim_end_matches(".xml")
        .parse()
        .unwrap_or(0)
}

fn read_zip_text(archive: &mut ZipArchive<Cursor<Vec<u8>>>, path: &str) -> anyhow::Result<String> {
    let mut file = archive.by_name(path)?;
    let mut value = String::new();
    file.read_to_string(&mut value)?;
    Ok(value)
}

fn read_zip_bytes(archive: &mut ZipArchive<Cursor<Vec<u8>>>, path: &str) -> anyhow::Result<Vec<u8>> {
    let mut file = archive.by_name(path)?;
    let mut value = Vec::new();
    file.read_to_end(&mut value)?;
    Ok(value)
}

fn extract_slide_text(slide_xml: &str) -> Vec<String> {
    let mut values = Vec::new();
    let mut remaining = slide_xml;
    while let Some(start) = remaining.find("<a:t") {
        remaining = &remaining[start..];
        let Some(close) = remaining.find('>') else { break };
        remaining = &remaining[close + 1..];
        let Some(end) = remaining.find("</a:t>") else { break };
        let text = decode_xml_entities(&remaining[..end]);
        if !text.trim().is_empty() {
            values.push(text);
        }
        remaining = &remaining[end + "</a:t>".len()..];
    }
    values
}

fn extract_slide_images(archive: &mut ZipArchive<Cursor<Vec<u8>>>, slide_path: &str) -> Vec<(String, String)> {
    let Some(slide_name) = slide_path.rsplit('/').next() else { return Vec::new() };
    let rels_path = format!("ppt/slides/_rels/{slide_name}.rels");
    let rels_xml = read_zip_text(archive, &rels_path).unwrap_or_default();
    let mut images = Vec::new();

    for target in relationship_image_targets(&rels_xml) {
        let media_path = normalize_zip_target("ppt/slides", &target);
        let Ok(bytes) = read_zip_bytes(archive, &media_path) else { continue };
        let mime = media_mime(&media_path);
        images.push((mime.to_string(), base64_encode(&bytes)));
    }

    images
}

fn relationship_image_targets(xml: &str) -> Vec<String> {
    let mut targets = Vec::new();
    let mut remaining = xml;
    while let Some(index) = remaining.find("<Relationship") {
        remaining = &remaining[index..];
        let Some(end) = remaining.find('>') else { break };
        let tag = &remaining[..end];
        if tag.contains("/image") {
            if let Some(target) = xml_attr(tag, "Target") {
                targets.push(target);
            }
        }
        remaining = &remaining[end + 1..];
    }
    targets
}

fn xml_attr(tag: &str, attr: &str) -> Option<String> {
    let pattern = format!("{attr}=\"");
    let start = tag.find(&pattern)? + pattern.len();
    let end = tag[start..].find('"')?;
    Some(tag[start..start + end].to_string())
}

fn normalize_zip_target(base_dir: &str, target: &str) -> String {
    let mut parts: Vec<&str> = base_dir.split('/').filter(|part| !part.is_empty()).collect();
    for segment in target.split('/') {
        match segment {
            "" | "." => {}
            ".." => {
                parts.pop();
            }
            value => parts.push(value),
        }
    }
    parts.join("/")
}

fn media_mime(path: &str) -> &'static str {
    match path.rsplit('.').next().unwrap_or_default().to_ascii_lowercase().as_str() {
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "svg" => "image/svg+xml",
        "webp" => "image/webp",
        _ => "image/png",
    }
}

fn render_slide_html(index: usize, text_blocks: Vec<String>, images: Vec<(String, String)>) -> String {
    let text_html = if text_blocks.is_empty() {
        String::new()
    } else {
        format!(
            "<div class=\"slide-text\">{}</div>",
            text_blocks
                .into_iter()
                .map(|value| format!("<p>{}</p>", escape_html(&value)))
                .collect::<Vec<_>>()
                .join("")
        )
    };
    let image_html = images
        .into_iter()
        .map(|(mime, data)| format!("<img src=\"data:{mime};base64,{data}\" alt=\"\" />"))
        .collect::<Vec<_>>()
        .join("");

    format!(
        "<section class=\"slide\" data-slide=\"{index}\"><div class=\"slide-count\">Slide {index}</div><div class=\"media-grid\">{image_html}</div>{text_html}</section>"
    )
}

fn render_presentation_html(title: &str, slides: &str) -> String {
    let escaped_title = escape_html(title);
    let interval_ms = 7000;
    format!(
        r#"<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>{escaped_title}</title>
<style>
html,body{{margin:0;width:100%;height:100%;background:#050508;color:#f8fafc;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;overflow:hidden}}
.deck{{position:relative;width:100vw;height:100vh;background:radial-gradient(circle at 20% 20%,rgba(59,130,246,.2),transparent 32%),radial-gradient(circle at 80% 20%,rgba(168,85,247,.18),transparent 30%),#050508}}
.slide{{position:absolute;inset:0;display:none;align-items:center;justify-content:center;gap:3vh;padding:6vh 7vw;box-sizing:border-box}}
.slide.active{{display:flex;animation:fade .35s ease-out}}
.media-grid{{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:3vh;width:100%;max-width:88vw;max-height:72vh;place-items:center}}
.media-grid:empty{{display:none}}
.media-grid img{{max-width:100%;max-height:72vh;object-fit:contain;border-radius:22px;box-shadow:0 24px 80px rgba(0,0,0,.45);background:white}}
.slide-text{{max-width:72vw;text-align:center;font-size:clamp(28px,4vw,72px);font-weight:800;line-height:1.1;text-wrap:balance;text-shadow:0 12px 40px rgba(0,0,0,.55)}}
.slide-text p{{margin:.35em 0}}
.slide-count{{position:absolute;right:26px;bottom:22px;border:1px solid rgba(255,255,255,.12);border-radius:999px;background:rgba(15,23,42,.68);padding:8px 14px;font-size:13px;color:rgba(255,255,255,.72);backdrop-filter:blur(14px)}}
.brand{{position:absolute;left:26px;bottom:22px;font-size:13px;color:rgba(255,255,255,.58);letter-spacing:.08em;text-transform:uppercase}}
@keyframes fade{{from{{opacity:0;transform:scale(.985)}}to{{opacity:1;transform:scale(1)}}}}
</style>
</head>
<body>
<main class="deck" aria-label="{escaped_title}">
{slides}
<div class="brand">{escaped_title}</div>
</main>
<script>
const slides=[...document.querySelectorAll('.slide')];
let index=0;
function show(next){{slides.forEach((slide,i)=>slide.classList.toggle('active',i===next));index=next;}}
show(0);
if(slides.length>1) setInterval(()=>show((index+1)%slides.length),{interval_ms});
</script>
</body>
</html>"#
    )
}

fn fallback_presentation_html(title: &str, message: &str) -> String {
    let escaped_title = escape_html(title);
    let escaped_message = escape_html(message);
    render_presentation_html(
        title,
        &format!(
            "<section class=\"slide active\"><div class=\"slide-text\"><p>{escaped_title}</p><p style=\"font-size:clamp(18px,2vw,32px);font-weight:500;color:rgba(255,255,255,.72)\">{escaped_message}</p></div></section>"
        ),
    )
}

fn decode_xml_entities(value: &str) -> String {
    value
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&amp;", "&")
        .replace("&quot;", "\"")
        .replace("&apos;", "'")
}

fn escape_html(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}

fn base64_encode(bytes: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut output = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for chunk in bytes.chunks(3) {
        let b0 = chunk[0];
        let b1 = *chunk.get(1).unwrap_or(&0);
        let b2 = *chunk.get(2).unwrap_or(&0);
        output.push(TABLE[(b0 >> 2) as usize] as char);
        output.push(TABLE[(((b0 & 0b0000_0011) << 4) | (b1 >> 4)) as usize] as char);
        if chunk.len() > 1 {
            output.push(TABLE[(((b1 & 0b0000_1111) << 2) | (b2 >> 6)) as usize] as char);
        } else {
            output.push('=');
        }
        if chunk.len() > 2 {
            output.push(TABLE[(b2 & 0b0011_1111) as usize] as char);
        } else {
            output.push('=');
        }
    }
    output
}
