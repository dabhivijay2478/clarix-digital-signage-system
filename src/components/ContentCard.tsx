'use client';

import type { ContentItem } from '../lib/types';
import { Trash2 } from 'lucide-react';
 
interface ContentCardProps {
  item: ContentItem;
  onDelete: (id: string) => void;
}
 
const typeIcons: Record<string, string> = {
  Video: '🎞️',
  Image: '🖼️',
  WebApp: '🌐',
  Ad: '📢',
  Slideshow: '🎚️',
};
 
const badgeStyles: Record<string, string> = {
  Video: 'bg-status-infoMuted text-status-info',
  Image: 'bg-status-successMuted text-status-success',
  WebApp: 'bg-accent-primary/15 text-accent-secondary',
  Ad: 'bg-status-warningMuted text-status-warning',
  Slideshow: 'bg-status-errorMuted text-status-error',
};
 
export default function ContentCard({ item, onDelete }: ContentCardProps) {
  const { id, name, content_type, file_path, url, duration_secs, tags } = item;
 
  return (
    <div className="group bg-bg-secondary/40 backdrop-blur-[20px] border border-white/5 rounded-2xl overflow-hidden transition-all duration-250 hover:border-white/10 hover:-translate-y-1 hover:shadow-2xl flex flex-col relative h-full">
      {/* Preview area */}
      <div className="relative aspect-video bg-bg-tertiary flex items-center justify-center border-b border-white/5 text-3xl">
        <span className="opacity-80 drop-shadow-md select-none">
          {typeIcons[content_type] || '❓'}
        </span>
        <div className="absolute inset-0 bg-gradient-to-t from-bg-primary/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
      </div>
 
      {/* Delete button */}
      <button
        onClick={() => onDelete(id)}
        className="absolute top-3 right-3 w-8 h-8 rounded-lg flex items-center justify-center text-text-secondary hover:text-white bg-white/5 border border-white/5 hover:bg-status-error/20 hover:text-status-error hover:border-status-error/30 transition-all duration-150 z-10"
        title="Delete Content"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>

      {/* Info Body */}
      <div className="p-5 flex flex-col flex-1 gap-3">
        <div className="flex items-start justify-between gap-3">
          <h4 className="font-semibold text-sm text-white tracking-tight leading-snug line-clamp-2">
            {name}
          </h4>
          <span className={`badge shrink-0 ${badgeStyles[content_type] || 'bg-white/10 text-white'}`}>
            {content_type}
          </span>
        </div>

        {/* Path or Url */}
        <p className="text-xs text-text-muted font-mono truncate max-w-full">
          {content_type === 'WebApp' ? url : file_path}
        </p>

        {/* Tags list */}
        {tags && tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {tags.slice(0, 3).map((tag) => (
              <span key={tag} className="text-[10px] font-semibold bg-white/5 text-text-secondary px-2 py-0.5 rounded">
                #{tag}
              </span>
            ))}
            {tags.length > 3 && (
              <span className="text-[10px] font-bold text-text-muted">
                +{tags.length - 3}
              </span>
            )}
          </div>
        )}

        {/* Duration footer */}
        <div className="flex items-center justify-between mt-auto border-t border-white/5 pt-3 text-[10px] font-bold text-text-muted uppercase tracking-wider">
          <span>Duration</span>
          <span className="font-mono text-accent-secondary">{duration_secs}s</span>
        </div>
      </div>
    </div>
  );
}
