'use client';

import { useState } from 'react';
import { useContent } from '../../hooks/useContent';
import ContentCard from '../../components/ContentCard';
import Modal from '../../components/Modal';
import { showToast } from '../../components/Toast';

const contentTypes = ['Image', 'Video', 'WebApp', 'Ad', 'Slideshow'];

export default function ContentPage() {
  const { items, loading, search, setSearch, addItem, deleteItem } = useContent();
  const [showAdd, setShowAdd] = useState(false);
  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState('Image');
  const [formUrl, setFormUrl] = useState('');
  const [formDuration, setFormDuration] = useState('30');
  const [formTags, setFormTags] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    // Autofill name (strip extension)
    const nameWithoutExt = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
    setFormName(nameWithoutExt);

    // Auto-detect type by mime-type and file extension
    const ext = file.name.split('.').pop()?.toLowerCase();
    const isVideoOrAudio = file.type.startsWith('video/') || file.type.startsWith('audio/') || 
      ['mp4', 'avi', 'mkv', 'mov', 'wmv', 'flv', 'mpg', 'mpeg', '3gp', 'ts', 'webm', 'm2v', 'm4v', 'mp3', 'wav', 'aac', 'flac', 'ogg', 'mid'].includes(ext || '');
    const isImage = file.type.startsWith('image/') || 
      ['png', 'jpg', 'jpeg', 'bmp', 'gif', 'webp', 'svg', 'heic', 'heif'].includes(ext || '');

    if (isVideoOrAudio) {
      setFormType('Video');
    } else if (isImage) {
      setFormType('Image');
    } else {
      setFormType('WebApp');
    }
  };

  const handleAdd = async () => {
    if (!formName.trim()) {
      showToast('Please enter a content name', 'warning');
      return;
    }

    const isUploadType = formType === 'Image' || formType === 'Video' || formType === 'Ad' || formType === 'Slideshow';
    const isWebType = formType === 'WebApp';

    if (isUploadType && !selectedFile) {
      showToast('Please select a media file to upload', 'warning');
      return;
    }

    if (isWebType && !formUrl.trim() && !selectedFile) {
      showToast('Please enter a WebApp URL or upload a local document (HTML, PDF, TXT, Excel)', 'warning');
      return;
    }

    try {
      let filePath: string | undefined = undefined;
      const needsFile = isUploadType || (isWebType && selectedFile);

      if (needsFile && selectedFile) {
        showToast('Uploading local asset...', 'info');
        // Read file bytes
        const arrayBuffer = await selectedFile.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);

        // Save file locally using Tauri backend
        const { contentApi: api } = await import('../../lib/tauri');
        filePath = await api.saveLocalFile(selectedFile.name, bytes);
      }

      await addItem(
        formName,
        formType,
        filePath,
        formType === 'WebApp' ? (formUrl || undefined) : undefined,
        parseInt(formDuration) || 30,
        formTags.split(',').map((t) => t.trim()).filter(Boolean)
      );

      showToast(`Content "${formName}" added`, 'success');
      setShowAdd(false);
      setFormName('');
      setFormType('Image');
      setFormUrl('');
      setFormDuration('30');
      setFormTags('');
      setSelectedFile(null);
    } catch (err) {
      showToast(`Failed to add content: ${err}`, 'error');
    }
  };

  const handleDelete = async (id: string) => {
    const item = items.find((i) => i.id === id);
    if (confirm(`Delete "${item?.name}"?`)) {
      await deleteItem(id);
      showToast('Content deleted', 'info');
    }
  };

  const isUploadType = formType === 'Image' || formType === 'Video' || formType === 'Ad' || formType === 'Slideshow' || formType === 'WebApp';

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 className="page-title">Content Library</h1>
          <p className="page-subtitle">
            {items.length} item{items.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <input
            className="input"
            placeholder="Search content..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: '240px' }}
          />
          <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
            + Add Content
          </button>
        </div>
      </div>

      {loading ? (
        <div className="empty-state">
          <div className="empty-state-icon" style={{ animation: 'spin 1s linear infinite' }}>◔</div>
          <div className="empty-state-title">Loading content...</div>
        </div>
      ) : items.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">◧</div>
          <div className="empty-state-title">No content yet</div>
          <div className="empty-state-text">
            Upload videos, images, ads, and web apps to your local content library.
          </div>
          <button
            className="btn btn-primary"
            style={{ marginTop: '16px' }}
            onClick={() => setShowAdd(true)}
          >
            + Add Content
          </button>
        </div>
      ) : (
        <div className="grid-auto stagger">
          {items.map((item) => (
            <ContentCard key={item.id} item={item} onDelete={handleDelete} />
          ))}
        </div>
      )}

      {/* Add Content Modal */}
      <Modal
        isOpen={showAdd}
        onClose={() => {
          setShowAdd(false);
          setSelectedFile(null);
        }}
        title="Add Content"
        actions={
          <>
            <button className="btn btn-secondary" onClick={() => {
              setShowAdd(false);
              setSelectedFile(null);
            }}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={handleAdd}>
              Add Content
            </button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label className="input-label">Content Type</label>
            <select
              className="select"
              value={formType}
              onChange={(e) => {
                setFormType(e.target.value);
                setSelectedFile(null);
              }}
            >
              {contentTypes.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          {isUploadType && (
            <div>
              <label className="input-label">
                {formType === 'WebApp' ? 'Local Web/Document File (HTML, PDF, XLS, TXT, ZIP - Optional)' : 'Media File (Image/Video/Audio) *'}
              </label>
              <div className="border-2 border-dashed border-white/10 rounded-xl p-6 text-center hover:border-accent-primary/50 transition-colors cursor-pointer relative bg-white/5">
                <input
                  type="file"
                  accept="image/*,video/*,audio/*,.pdf,.html,.htm,.xhtml,.txt,.xls,.xlsx,.zip,.tar,.ar,.xml,.rss"
                  onChange={handleFileChange}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <div className="flex flex-col items-center gap-2">
                  <span className="text-3xl">📁</span>
                  {selectedFile ? (
                    <div>
                      <p className="text-sm font-semibold text-white truncate max-w-[280px]">
                        {selectedFile.name}
                      </p>
                      <p className="text-xs text-text-secondary mt-1">
                        {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB • Click to change
                      </p>
                    </div>
                  ) : (
                    <div>
                      <p className="text-sm font-semibold text-white">Click or drag file here</p>
                      <p className="text-xs text-text-secondary mt-1">
                        {formType === 'WebApp' 
                          ? 'Supports HTML, PDF, TXT, Excel (XLS/XLSX), XML/RSS, ZIP/TAR' 
                          : 'Supports PNG, JPG, JPEG, BMP, WebP, SVG, MP4, AVI, MOV, MP3, WAV'}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          <div>
            <label className="input-label">Content Name *</label>
            <input
              className="input"
              placeholder="e.g., Welcome Video"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              autoFocus
            />
          </div>

          {formType === 'WebApp' && (
            <div>
              <label className="input-label">WebApp URL (Optional if file is uploaded)</label>
              <input
                className="input"
                placeholder="https://..."
                value={formUrl}
                onChange={(e) => setFormUrl(e.target.value)}
              />
            </div>
          )}

          <div>
            <label className="input-label">Duration (seconds)</label>
            <input
              className="input"
              type="number"
              placeholder="30"
              value={formDuration}
              onChange={(e) => setFormDuration(e.target.value)}
            />
          </div>

          <div>
            <label className="input-label">Tags (comma-separated)</label>
            <input
              className="input"
              placeholder="promo, welcome, lobby"
              value={formTags}
              onChange={(e) => setFormTags(e.target.value)}
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
