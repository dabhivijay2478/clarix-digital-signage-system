use crate::{db::DbPool, models::{ContentItem, ContentType}, state::AppCore};
use rusqlite::params;
use std::{
    fs,
    path::{Path, PathBuf},
    process::Command,
};
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

pub fn get_content_items(pool: &DbPool) -> Result<Vec<ContentItem>, String> {
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
}

pub fn add_content_item(
    core: &AppCore,
    name: String,
    content_type: String,
    file_path: Option<String>,
    url: Option<String>,
    duration_secs: u32,
    tags: Vec<String>,
    metadata_json: Option<serde_json::Value>,
) -> Result<ContentItem, String> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now();
    let conn = core.pool.get().map_err(|e| e.to_string())?;

    let ct = parse_content_type(&content_type);
    let duration = duration_secs as i32;
    let tags_str = serde_json::to_string(&tags).unwrap_or_else(|_| "[]".to_string());
    let metadata = metadata_json.unwrap_or_else(|| serde_json::json!({}));
    let metadata_str = serde_json::to_string(&metadata).unwrap_or_else(|_| "{}".to_string());

    conn.execute(
        "INSERT INTO content_items (id, name, content_type, file_path, url, duration_secs, tags, metadata_json, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![id, name, content_type, file_path, url, duration, tags_str, metadata_str, now.to_rfc3339()],
    )
    .map_err(|e| e.to_string())?;

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

pub fn delete_content_item(core: &AppCore, id: String) -> Result<(), String> {
    let conn = core.pool.get().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM content_items WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn update_content_duration(core: &AppCore, id: String, duration_secs: i32) -> Result<(), String> {
    let conn = core.pool.get().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE content_items SET duration_secs = ?1 WHERE id = ?2",
        params![duration_secs, id],
    )
    .map_err(|e| e.to_string())?;
    let _ = crate::lan::server::publish_revision(&core.pool, &core.events);
    Ok(())
}

/// Resolve the base directory used for storing local media, preferring the
/// user-configured content library path saved in `device_settings`.
pub fn content_base_dir(core: &AppCore) -> Result<PathBuf, String> {
    let default_dir = core.config_dir.clone();
    let conn = core.pool.get().map_err(|e| e.to_string())?;
    let custom_path: Option<String> = conn
        .query_row(
            "SELECT content_library_path FROM device_settings WHERE singleton = 1",
            [],
            |row| row.get(0),
        )
        .ok()
        .flatten();
    Ok(custom_path
        .filter(|p| !p.is_empty())
        .map(PathBuf::from)
        .unwrap_or(default_dir))
}

fn local_content_path(base_dir: &Path, filename: &str) -> Result<PathBuf, String> {
    let media_dir = base_dir.join("media");
    fs::create_dir_all(&media_dir).map_err(|e| e.to_string())?;
    let safe_name = Path::new(filename)
        .file_name()
        .and_then(|value| value.to_str())
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| "Invalid file name".to_string())?;
    Ok(media_dir.join(safe_name))
}

#[derive(Debug, Clone, PartialEq)]
pub struct ContentStorageInfo {
    pub path: String,
    pub used_bytes: u64,
    pub free_bytes: u64,
    pub total_bytes: u64,
}

/// Copy a picked file into the content library media directory.
/// Large files are copied in 512 KB chunks so the UI can report progress.
pub fn import_content_file(
    core: &AppCore,
    source_path: &Path,
) -> Result<(String, ImportError), String> {
    let base_dir = content_base_dir(core)?;
    let file_name = source_path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("upload.bin");
    let file_path = local_content_path(&base_dir, file_name)?;
    fs::copy(source_path, &file_path).map_err(|e| e.to_string())?;
    Ok((
        file_path.to_string_lossy().to_string(),
        ImportError::None,
    ))
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum ImportError {
    None,
}

pub fn save_local_content_file(
    core: &AppCore,
    filename: String,
    bytes: Vec<u8>,
) -> Result<String, String> {
    let base_dir = content_base_dir(core)?;
    let file_path = local_content_path(&base_dir, &filename)?;
    fs::write(&file_path, &bytes).map_err(|e| e.to_string())?;
    Ok(file_path.to_string_lossy().to_string())
}

pub fn get_content_storage(core: &AppCore) -> Result<ContentStorageInfo, String> {
    let base_dir = content_base_dir(core)?;
    let media_dir = base_dir.join("media");

    let total_bytes = media_disk_total(&base_dir);
    let free_bytes = media_disk_avail(&base_dir);
    let used_bytes = dir_size(&media_dir);

    Ok(ContentStorageInfo {
        path: base_dir.to_string_lossy().to_string(),
        used_bytes,
        free_bytes,
        total_bytes,
    })
}

/// Point the content library at a user-picked folder (native folder dialog
/// resolved by the UI layer before calling this).
pub fn set_content_directory(core: &AppCore, path_str: String) -> Result<ContentStorageInfo, String> {
    {
        let conn = core.pool.get().map_err(|e| e.to_string())?;
        conn.execute(
            "UPDATE device_settings SET content_library_path = ?1 WHERE singleton = 1",
            params![path_str],
        )
        .map_err(|e| e.to_string())?;
    }

    let base_dir = PathBuf::from(&path_str);
    let media_dir = base_dir.join("media");
    fs::create_dir_all(&media_dir).map_err(|e| e.to_string())?;

    let total_bytes = media_disk_total(&base_dir);
    let free_bytes = media_disk_avail(&base_dir);
    let used_bytes = dir_size(&media_dir);

    Ok(ContentStorageInfo {
        path: path_str,
        used_bytes,
        free_bytes,
        total_bytes,
    })
}

fn media_disk_total(path: &Path) -> u64 {
    fs2::total_space(path).unwrap_or(0)
}

fn media_disk_avail(path: &Path) -> u64 {
    fs2::available_space(path).unwrap_or(0)
}

fn dir_size(path: &Path) -> u64 {
    let mut total = 0u64;
    if let Ok(rd) = fs::read_dir(path) {
        for entry in rd.flatten() {
            if let Ok(meta) = entry.metadata() {
                if meta.is_file() {
                    total += meta.len();
                } else if meta.is_dir() {
                    total += dir_size(&entry.path());
                }
            }
        }
    }
    total
}

pub fn prepare_presentation_content(file_path: String) -> Result<String, String> {
    let source_path = PathBuf::from(&file_path);
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

fn build_pptx_html(_title: &str, bytes: Vec<u8>) -> anyhow::Result<String> {
    let mut archive = ZipArchive::new(std::io::Cursor::new(bytes))?;
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

    let image_count = slides.iter().filter(|slide| slide.contains("<img")).count();
    let _ = image_count;
    Ok(slides.join("\n"))
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

fn read_zip_text(archive: &mut ZipArchive<std::io::Cursor<Vec<u8>>>, path: &str) -> anyhow::Result<String> {
    let mut file = archive.by_name(path)?;
    let mut value = String::new();
    file.read_to_string(&mut value)?;
    Ok(value)
}

use std::io::Read;

fn read_zip_bytes(archive: &mut ZipArchive<std::io::Cursor<Vec<u8>>>, path: &str) -> anyhow::Result<Vec<u8>> {
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

fn extract_slide_images(archive: &mut ZipArchive<std::io::Cursor<Vec<u8>>>, slide_path: &str) -> Vec<(String, String)> {
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
        "<section class=\"slide\"><div class=\"slide-count\">Slide {index}</div><div class=\"media-grid\">{image_html}</div>{text_html}</section>"
    )
}

fn fallback_presentation_html(title: &str, message: &str) -> String {
    let escaped_title = escape_html(title);
    let escaped_message = escape_html(message);
    format!(
        "<section class=\"slide\"><div class=\"slide-text\"><p>{escaped_title}</p><p style=\"font-size:clamp(18px,2vw,32px);font-weight:500;color:rgba(255,255,255,.72)\">{escaped_message}</p></div></section>"
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
