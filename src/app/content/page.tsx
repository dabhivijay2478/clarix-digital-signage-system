'use client';

import { useState } from 'react';
import { useContent } from '../../hooks/useContent';
import ContentCard from '../../components/ContentCard';
import Modal from '../../components/Modal';
import { showToast } from '../../components/Toast';
import { LayoutGrid, Search } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';

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
  const [deleteId, setDeleteId] = useState<string | null>(null);

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
    await deleteItem(id);
    showToast('Content deleted', 'info');
    setDeleteId(null);
  };

  const isUploadType = formType === 'Image' || formType === 'Video' || formType === 'Ad' || formType === 'Slideshow' || formType === 'WebApp';

  return (
    <div>
      <div className="page-header flex items-center justify-between gap-4">
        <div>
          <h1 className="page-title">Content Library</h1>
          <Badge variant="secondary">{items.length} item{items.length !== 1 ? 's' : ''}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input
            className="w-60 pl-9"
            placeholder="Search content..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          /></div>
          <Button onClick={() => setShowAdd(true)}>+ Add Content</Button>
        </div>
      </div>

      {loading ? (
        <div aria-busy="true" className="grid-auto">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-72" />)}</div>
      ) : items.length === 0 ? (
        <Card className="border-dashed bg-transparent"><CardContent className="flex flex-col items-center py-16 text-center"><LayoutGrid className="mb-4 size-12 text-muted-foreground/40" /><CardTitle>No content yet</CardTitle><CardDescription className="mt-1">Upload videos, images, ads, and web apps to your local content library.</CardDescription><Button className="mt-6" onClick={() => setShowAdd(true)}>+ Add Content</Button></CardContent></Card>
      ) : (
        <div className="grid-auto stagger">
          {items.map((item) => <ContentCard key={item.id} item={item} onDelete={setDeleteId} />)}
        </div>
      )}

      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete content?</AlertDialogTitle><AlertDialogDescription>This permanently removes “{items.find((item) => item.id === deleteId)?.name}”.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => deleteId && handleDelete(deleteId)}>Delete</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>

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
            <Button variant="outline" onClick={() => {
              setShowAdd(false);
              setSelectedFile(null);
            }}>
              Cancel
            </Button>
            <Button onClick={handleAdd}>
              Add Content
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="space-y-2">
            <Label>Content Type</Label>
            <Select value={formType} onValueChange={(value) => {
                setFormType(value);
                setSelectedFile(null);
              }}>
              <SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{contentTypes.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          {isUploadType && (
            <div>
              <Label>
                {formType === 'WebApp' ? 'Local Web/Document File (HTML, PDF, XLS, TXT, ZIP - Optional)' : 'Media File (Image/Video/Audio) *'}
              </Label>
              <div className="relative mt-2 cursor-pointer rounded-xl border-2 border-dashed border-zinc-700 bg-zinc-900/50 p-6 text-center hover:border-primary/50">
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
            <Label htmlFor="content-name">Content Name *</Label>
            <Input id="content-name"
              placeholder="e.g., Welcome Video"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
            />
          </div>

          {formType === 'WebApp' && (
            <div>
              <Label htmlFor="content-url">WebApp URL (Optional if file is uploaded)</Label>
              <Input id="content-url"
                placeholder="https://..."
                value={formUrl}
                onChange={(e) => setFormUrl(e.target.value)}
              />
            </div>
          )}

          <div>
            <Label htmlFor="content-duration">Duration (seconds)</Label>
            <Input id="content-duration"
              type="number"
              placeholder="30"
              value={formDuration}
              onChange={(e) => setFormDuration(e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="content-tags">Tags (comma-separated)</Label>
            <Input id="content-tags"
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
