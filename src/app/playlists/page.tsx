'use client';

import { useState } from 'react';
import { usePlaylists } from '../../hooks/usePlaylists';
import { useContent } from '../../hooks/useContent';
import PlaylistEditor from '../../components/PlaylistEditor';
import Modal from '../../components/Modal';
import { showToast } from '../../components/Toast';
import { X, Loader2, ListMusic, Trash2, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
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
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between border-b border-white/5 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Playlists</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {playlists.length} custom playback rotation{playlists.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Button 
          onClick={() => setShowCreate(true)}
          className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-medium shadow-md shadow-violet-500/10 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
        >
          <Plus className="mr-2 h-4 w-4" /> New Playlist
        </Button>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3 text-muted-foreground">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <span className="text-sm font-semibold tracking-wide uppercase">Loading playlists...</span>
        </div>
      ) : (
        <div className="flex flex-col md:flex-row gap-6 items-start">
          {/* Playlist List (Sidebar) */}
          <div className="w-full md:w-[320px] shrink-0">
            <div className="flex flex-col gap-2">
              {playlists.map((pl) => {
                const isSelected = selectedId === pl.id;
                return (
                  <div key={pl.id} className="group relative">
                    <button
                      type="button"
                      className={cn(
                        "w-full text-left p-3.5 rounded-xl border transition-all duration-200 relative overflow-hidden flex items-center justify-between pr-12 cursor-pointer",
                        isSelected
                          ? "bg-gradient-to-r from-violet-600/15 to-fuchsia-600/10 border-violet-500/30 text-white shadow-[0_0_20px_rgba(139,92,246,0.1)]"
                          : "bg-card/45 backdrop-blur-sm border-border/40 text-muted-foreground hover:text-foreground hover:bg-card/85 hover:border-border"
                      )}
                      onClick={() => setSelectedId(pl.id)}
                    >
                      {/* Left glow line for selected item */}
                      {isSelected && (
                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-violet-500 to-fuchsia-500" />
                      )}
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={cn(
                          "p-2.5 rounded-lg shrink-0",
                          isSelected ? "bg-violet-500/20 text-violet-400" : "bg-muted/50 text-muted-foreground"
                        )}>
                          <ListMusic className="h-4.5 w-4.5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <span className={cn(
                            "block font-semibold leading-tight truncate text-sm",
                            isSelected ? "text-white" : "text-foreground"
                          )}>
                            {pl.name}
                          </span>
                          <span className="block text-xs text-muted-foreground mt-1.5">
                            {pl.items.length} items · {pl.transition}
                          </span>
                        </div>
                      </div>
                    </button>
                    <Button
                      aria-label={`Delete ${pl.name}`}
                      variant="ghost"
                      size="icon-sm"
                      className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 hover:text-destructive hover:bg-destructive/10 transition-all duration-150 cursor-pointer"
                      onClick={() => setDeleteId(pl.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                );
              })}

              {playlists.length === 0 && (
                <Card className="border-dashed bg-transparent border-white/10">
                  <CardContent className="py-16 text-center text-sm text-muted-foreground">
                    No playlists configured yet. Click &quot;New Playlist&quot; to begin.
                  </CardContent>
                </Card>
              )}
            </div>
          </div>

          {/* Playlist Editor */}
          <div className="min-w-0 flex-1 w-full">
            {selectedPlaylist ? (
              <PlaylistEditor
                key={selectedPlaylist.id}
                playlist={selectedPlaylist}
                contentItems={contentItems}
                onUpdateItems={handleUpdateItems}
              />
            ) : (
              <Card className="min-h-[400px] border-dashed bg-transparent border-white/10 flex items-center justify-center">
                <CardContent className="text-muted-foreground text-center py-12">
                  <ListMusic className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
                  <p className="font-medium text-sm">Select a playlist to edit</p>
                  <p className="text-xs text-muted-foreground/60 mt-1 max-w-xs mx-auto">
                    Choose a playlist from the sidebar to modify its sequence, duration settings, and media.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}

      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent className="border border-white/10 bg-zinc-950/95 backdrop-blur-xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete playlist?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes &ldquo;{playlists.find((playlist) => playlist.id === deleteId)?.name}&rdquo;.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-white/10 hover:bg-white/5 text-white">Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => deleteId && handleDelete(deleteId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/95"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Create Playlist Modal */}
      <Modal
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        title="New Playlist"
        actions={
          <>
            <Button variant="outline" onClick={() => setShowCreate(false)} disabled={isCreating} className="border-white/10 hover:bg-white/5">Cancel</Button>
            <Button 
              onClick={handleCreate} 
              disabled={isCreating}
              className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white"
            >
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
        <div className="flex flex-col gap-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="playlist-name" className="text-zinc-200">Playlist Name *</Label>
            <Input 
              id="playlist-name"
              placeholder="e.g., Morning Rotation"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              className="border-white/10 bg-zinc-900/50 text-white placeholder-zinc-500 focus-visible:ring-violet-500"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-zinc-200">Transition Effect</Label>
            <Select value={formTransition} onValueChange={setFormTransition}>
              <SelectTrigger className="border-white/10 bg-zinc-900/50 text-white focus:ring-violet-500">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="border-white/10 bg-zinc-950 text-white">
                {['None', 'Fade', 'Slide', 'Zoom'].map((value) => (
                  <SelectItem key={value} value={value} className="focus:bg-violet-600 focus:text-white cursor-pointer">
                    {value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </Modal>
    </div>
  );
}
