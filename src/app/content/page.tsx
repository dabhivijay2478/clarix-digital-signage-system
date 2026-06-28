'use client';

import { useState, useMemo } from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { useContent } from '../../hooks/useContent';
import ContentCard from '../../components/ContentCard';
import Modal from '../../components/Modal';
import { showToast } from '../../components/Toast';
import { LayoutGrid, Plus, Search, UploadCloud, Loader2, Table2, Trash2, Eye, X, Film, Image as ImageIcon, Globe, Megaphone, Presentation, FileText, FileSpreadsheet } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import type { ContentItem } from '@/lib/types';
import { cn } from '@/lib/utils';

const contentTypes = ['Image', 'Video', 'Presentation', 'Document', 'Spreadsheet', 'WebApp', 'Ad', 'Slideshow'];

const typeIcons: Record<string, React.ReactNode> = {
  Video: <Film className="size-4 text-primary" />,
  Image: <ImageIcon className="size-4 text-blue-500" />,
  WebApp: <Globe className="size-4 text-indigo-500" />,
  Ad: <Megaphone className="size-4 text-amber-500" />,
  Slideshow: <Presentation className="size-4 text-emerald-500" />,
  Presentation: <Presentation className="size-4 text-purple-500" />,
  Document: <FileText className="size-4 text-rose-500" />,
  Spreadsheet: <FileSpreadsheet className="size-4 text-green-500" />,
};

const typeStyles: Record<string, string> = {
  Ad: 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400',
  Slideshow: 'border-primary/30 bg-primary/10 text-primary',
  Presentation: 'border-purple-500/30 bg-purple-500/10 text-purple-600 dark:text-purple-400',
  Document: 'border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400',
  Spreadsheet: 'border-green-500/30 bg-green-500/10 text-green-600 dark:text-green-400',
};

export default function ContentPage() {
  const { items, loading, search, setSearch, addItem, deleteItem } = useContent();
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [previewItem, setPreviewItem] = useState<ContentItem | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState('Image');
  const [formUrl, setFormUrl] = useState('');
  const [formDuration, setFormDuration] = useState('30');
  const [formTags, setFormTags] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    let result = items;
    if (activeFilter) {
      result = result.filter((i) => i.content_type === activeFilter);
    }
    return result;
  }, [items, activeFilter]);

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
    const isPresentation = ['ppt', 'pptx', 'pps', 'ppsx', 'key'].includes(ext || '');
    const isDoc = ['pdf', 'doc', 'docx', 'txt', 'rtf', 'odt', 'pages'].includes(ext || '');
    const isExcel = ['xls', 'xlsx', 'csv', 'ods', 'numbers'].includes(ext || '');

    if (isVideoOrAudio) {
      setFormType('Video');
    } else if (isImage) {
      setFormType('Image');
    } else if (isPresentation) {
      setFormType('Presentation');
    } else if (isDoc) {
      setFormType('Document');
    } else if (isExcel) {
      setFormType('Spreadsheet');
    } else {
      setFormType('WebApp');
    }
  };

  const handleAdd = async () => {
    if (!formName.trim()) {
      showToast('Please enter a content name', 'warning');
      return;
    }

    const isUploadType = formType === 'Image' || formType === 'Video' || formType === 'Presentation' || formType === 'Document' || formType === 'Spreadsheet' || formType === 'Ad' || formType === 'Slideshow';
    const isWebType = formType === 'WebApp';

    if (isUploadType && !selectedFile) {
      showToast('Please select a media file to upload', 'warning');
      return;
    }

    if (isWebType && !formUrl.trim() && !selectedFile) {
      showToast('Please enter a WebApp URL or upload a local HTML/PDF document', 'warning');
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
        if (formType === 'Presentation') {
          showToast('Preparing presentation for screen playback...', 'info');
          filePath = await api.preparePresentation(filePath);
        }
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

  const isUploadType = formType === 'Image' || formType === 'Video' || formType === 'Presentation' || formType === 'Document' || formType === 'Spreadsheet' || formType === 'Ad' || formType === 'Slideshow' || formType === 'WebApp';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Content Library</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {items.length} item{items.length !== 1 ? 's' : ''} in library
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* View Toggle */}
          <ToggleGroup
            type="single"
            value={viewMode}
            onValueChange={(v) => v && setViewMode(v as 'grid' | 'table')}
            className="border rounded-lg p-1"
          >
            <ToggleGroupItem value="grid" aria-label="Grid view">
              <LayoutGrid className="size-4" />
            </ToggleGroupItem>
            <ToggleGroupItem value="table" aria-label="Table view">
              <Table2 className="size-4" />
            </ToggleGroupItem>
          </ToggleGroup>
          
          {/* Search */}
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="w-full pl-9"
              placeholder="Search content..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          
          {/* Add Button */}
          <Button onClick={() => setShowAdd(true)}>
            <Plus className="size-4 mr-1.5" />
            Add Content
          </Button>
        </div>
      </div>

      {/* ── Category Filters ── */}
      <div className="flex flex-wrap gap-1.5">
        <Button
          variant={activeFilter === null ? 'default' : 'outline'}
          size="sm"
          className="h-8 text-xs"
          onClick={() => setActiveFilter(null)}
        >
          All
        </Button>
        {contentTypes.map((type) => (
          <Button
            key={type}
            variant={activeFilter === type ? 'default' : 'outline'}
            size="sm"
            className="h-8 text-xs gap-1.5"
            onClick={() => setActiveFilter(activeFilter === type ? null : type)}
          >
            {typeIcons[type]}
            {type}
          </Button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3 text-muted-foreground">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <span className="text-sm font-medium">Loading content...</span>
        </div>
      ) : items.length === 0 && !activeFilter ? (
        <Card className="border-dashed bg-transparent">
          <CardContent className="flex flex-col items-center py-16 text-center">
            <LayoutGrid className="mb-4 size-12 text-muted-foreground/40" />
            <CardTitle>No content yet</CardTitle>
            <CardDescription className="mt-1">
              Upload videos, images, ads, and web apps to your local content library.
            </CardDescription>
            <Button className="mt-6" onClick={() => setShowAdd(true)}>
              <Plus className="size-4 mr-1.5" />
              Add Content
            </Button>
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed bg-transparent">
          <CardContent className="flex flex-col items-center py-16 text-center">
            <LayoutGrid className="mb-4 size-12 text-muted-foreground/40" />
            <CardTitle>No {activeFilter} items</CardTitle>
            <CardDescription className="mt-1">
              No content items match the selected filter.
            </CardDescription>
            <Button variant="outline" className="mt-6" onClick={() => setActiveFilter(null)}>
              Clear Filter
            </Button>
          </CardContent>
        </Card>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {filtered.map((item) => (
            <ContentCard key={item.id} item={item} onDelete={setDeleteId} onView={setPreviewItem} />
          ))}
        </div>
      ) : (
        <div className="border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Name</th>
                <th className="px-4 py-3 text-left font-medium">Type</th>
                <th className="px-4 py-3 text-left font-medium">Source</th>
                <th className="px-4 py-3 text-left font-medium">Tags</th>
                <th className="px-4 py-3 text-right font-medium">Duration</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((item) => {
                const variant = item.content_type === 'Image' ? 'secondary' : item.content_type === 'Video' ? 'default' : 'outline';
                return (
                  <tr key={item.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex size-8 items-center justify-center rounded-lg bg-muted">
                          {typeIcons[item.content_type] || <span>❓</span>}
                        </div>
                        <span className="font-medium">{item.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge 
                        variant={variant} 
                        className={cn('text-xs', typeStyles[item.content_type])}
                      >
                        {item.content_type}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground max-w-xs truncate">
                      {item.url || item.file_path || '—'}
                    </td>
                    <td className="px-4 py-3">
                      {item.tags?.length ? (
                        <div className="flex flex-wrap gap-1">
                          {item.tags.slice(0, 3).map((tag) => (
                            <Badge key={tag} variant="outline" className="text-xs">
                              #{tag}
                            </Badge>
                          ))}
                          {item.tags.length > 3 && (
                            <span className="text-xs text-muted-foreground">+{item.tags.length - 3}</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-muted-foreground">
                      {item.duration_secs}s
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-8"
                          onClick={() => setPreviewItem(item)}
                        >
                          <Eye className="size-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-8 text-destructive hover:text-destructive"
                          onClick={() => setDeleteId(item.id)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete content?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes &quot;{items.find((item) => item.id === deleteId)?.name}&quot;.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && handleDelete(deleteId)}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
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
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{contentTypes.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          {isUploadType && (
            <div className="space-y-2">
              <Label>
                {formType === 'WebApp' ? 'Local Web/Document File (HTML, PDF, TXT, ZIP - Optional)' : 'Upload File *'}
              </Label>
              <div className="relative cursor-pointer rounded-xl border border-dashed border-border bg-muted/20 p-6 text-center transition-colors hover:border-primary/50 hover:bg-primary/5">
                <input
                  type="file"
                  accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.ppt,.pptx,.pps,.ppsx,.key,.txt,.rtf,.zip,.tar,.xml,.rss,.html,.htm"
                  onChange={handleFileChange}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <div className="flex flex-col items-center gap-2">
                  <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <UploadCloud className="size-5" />
                  </div>
                  {selectedFile ? (
                    <div>
                      <p className="max-w-[280px] truncate text-sm font-semibold text-foreground">
                        {selectedFile.name}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB · Click to change
                      </p>
                    </div>
                  ) : (
                    <div>
                      <p className="text-sm font-semibold text-foreground">Click or drag file here</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Supports images, videos, PowerPoint slides, PDFs, Word docs, Excel spreadsheets, CSVs, HTML, and ZIP bundles.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="content-name">Content Name *</Label>
            <Input id="content-name"
              placeholder="e.g., Welcome Video"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
            />
          </div>

          {formType === 'WebApp' && (
            <div className="space-y-2">
              <Label htmlFor="content-url">WebApp URL (Optional if file is uploaded)</Label>
              <Input id="content-url"
                placeholder="https://..."
                value={formUrl}
                onChange={(e) => setFormUrl(e.target.value)}
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="content-duration">Duration (seconds)</Label>
            <Input id="content-duration"
              type="number"
              placeholder="30"
              value={formDuration}
              onChange={(e) => setFormDuration(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="content-tags">Tags (comma-separated)</Label>
            <Input id="content-tags"
              placeholder="promo, welcome, lobby"
              value={formTags}
              onChange={(e) => setFormTags(e.target.value)}
            />
          </div>
        </div>
      </Modal>

      {/* ── Preview Modal ── */}
      <Modal
        isOpen={!!previewItem}
        onClose={() => setPreviewItem(null)}
        title={previewItem?.name ?? ''}
        actions={
          <Button variant="outline" onClick={() => setPreviewItem(null)}>
            Close
          </Button>
        }
      >
        {previewItem && (
          <div className="space-y-4">
            {/* Preview area */}
            <div className="flex items-center justify-center rounded-xl border border-border/60 bg-black/5 min-h-[300px] max-h-[500px] overflow-hidden">
              {previewItem.content_type === 'Image' && (previewItem.file_path || previewItem.url) ? (
                <img
                  src={previewItem.file_path ? convertFileSrc(previewItem.file_path) : previewItem.url!}
                  alt={previewItem.name}
                  className="max-h-[500px] w-full object-contain"
                />
              ) : previewItem.content_type === 'Video' && (previewItem.file_path || previewItem.url) ? (
                <video
                  src={previewItem.file_path ? convertFileSrc(previewItem.file_path) : previewItem.url!}
                  controls
                  autoPlay
                  className="max-h-[500px] w-full"
                />
              ) : (
                <div className="flex flex-col items-center gap-3 text-muted-foreground py-12">
                  {typeIcons[previewItem.content_type] || <FileText className="size-12" />}
                  <p className="text-sm font-medium">Preview not available for this content type</p>
                  <p className="text-xs text-muted-foreground/60">
                    Source: {previewItem.file_path || previewItem.url || 'N/A'}
                  </p>
                </div>
              )}
            </div>

            {/* Metadata */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Type</p>
                <Badge variant="outline" className={cn('mt-1 text-xs', typeStyles[previewItem.content_type])}>
                  {previewItem.content_type}
                </Badge>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Duration</p>
                <p className="mt-1 font-medium">{previewItem.duration_secs}s</p>
              </div>
              {previewItem.tags && previewItem.tags.length > 0 && (
                <div className="col-span-2">
                  <p className="text-xs text-muted-foreground">Tags</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {previewItem.tags.map((tag) => (
                      <Badge key={tag} variant="secondary" className="text-xs">
                        #{tag}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
