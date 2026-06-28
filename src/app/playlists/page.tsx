'use client';

import { useState } from 'react';
import { usePlaylists } from '../../hooks/usePlaylists';
import { useContent } from '../../hooks/useContent';
import PlaylistEditor from '../../components/PlaylistEditor';
import Modal from '../../components/Modal';
import { showToast } from '../../components/Toast';
import { X, Loader2 } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function PlaylistsPage() {
  const { playlists, loading, createPlaylist, updateItems, deletePlaylist } = usePlaylists();
  const { allItems: contentItems } = useContent();
  const [showCreate, setShowCreate] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formTransition, setFormTransition] = useState('Fade');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const selectedPlaylist = playlists.find((p) => p.id === selectedId);

  const handleCreate = async () => {
    if (!formName.trim()) return;
    setIsCreating(true);
    try {
      const pl = await createPlaylist(formName, formTransition);
      showToast(`Playlist "${formName}" created`, 'success');
      setShowCreate(false);
      setFormName('');
      setSelectedId(pl.id);
    } catch {
      showToast('Failed to create playlist', 'error');
    } finally {
      setIsCreating(false);
    }
  };

  const handleUpdateItems = async (playlistId: string, items: import('../../lib/types').PlaylistItem[]) => {
    try {
      await updateItems(playlistId, items);
      showToast('Playlist order saved', 'success');
    } catch {
      showToast('Failed to save playlist', 'error');
    }
  };

  const handleDelete = async (id: string) => {
    await deletePlaylist(id);
    if (selectedId === id) setSelectedId(null);
    setDeleteId(null);
    showToast('Playlist deleted', 'error');
  };

  return (
    <div>
      <div className="page-header flex items-center justify-between">
        <div>
          <h1 className="page-title">Playlists</h1>
          <p className="page-subtitle">
            {playlists.length} playlist{playlists.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)}>+ New Playlist</Button>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3 text-muted-foreground">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <span className="text-sm font-semibold tracking-wide uppercase">Loading playlists...</span>
        </div>
      ) : (
        <div className="flex gap-6">
          {/* Playlist List */}
          <div className="w-[280px] shrink-0">
            <div className="flex flex-col gap-1">
              {playlists.map((pl) => (
                <div key={pl.id} className="group relative">
                  <Button variant={selectedId === pl.id ? 'secondary' : 'ghost'} className="h-auto w-full justify-start py-3 pr-10 text-left" onClick={() => setSelectedId(pl.id)}><span><span className="block font-semibold">{pl.name}</span><span className="block text-xs text-muted-foreground">{pl.items.length} items · {pl.transition}</span></span></Button>
                  <Button aria-label={`Delete ${pl.name}`} variant="ghost" size="icon-sm" className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100" onClick={() => setDeleteId(pl.id)}><X /></Button>
                </div>
              ))}

              {playlists.length === 0 && (
                <Card className="border-dashed bg-transparent"><CardContent className="py-12 text-center text-sm text-muted-foreground">No playlists</CardContent></Card>
              )}
            </div>
          </div>

          {/* Playlist Editor */}
          <div className="min-w-0 flex-1">
            {selectedPlaylist ? (
              <PlaylistEditor
                playlist={selectedPlaylist}
                contentItems={contentItems}
                onUpdateItems={handleUpdateItems}
              />
            ) : (
              <Card className="min-h-[400px] border-dashed bg-transparent"><CardContent className="flex min-h-[400px] items-center justify-center text-muted-foreground">Select a playlist to edit</CardContent></Card>
            )}
          </div>
        </div>
      )}

      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete playlist?</AlertDialogTitle><AlertDialogDescription>This permanently removes “{playlists.find((playlist) => playlist.id === deleteId)?.name}”.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => deleteId && handleDelete(deleteId)}>Delete</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>

      {/* Create Playlist Modal */}
      <Modal
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        title="New Playlist"
        actions={
          <>
            <Button variant="outline" onClick={() => setShowCreate(false)} disabled={isCreating}>Cancel</Button>
            <Button onClick={handleCreate} disabled={isCreating}>
              {isCreating ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create'
              )}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="space-y-2">
            <Label htmlFor="playlist-name">Playlist Name *</Label>
            <Input id="playlist-name"
              placeholder="e.g., Morning Rotation"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Transition Effect</Label>
            <Select value={formTransition} onValueChange={setFormTransition}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{['None', 'Fade', 'Slide', 'Zoom'].map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select>
          </div>
        </div>
      </Modal>
    </div>
  );
}
