'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import type { ElementType } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { Badge, Button, EmptyState } from '@/components/ui';
import {
  IconDrive,
  IconFile,
  IconFileDoc,
  IconFileGeneric,
  IconFileSheet,
  IconFileSlides,
  IconFileZip,
  IconFolder,
  IconImage,
  IconInbox,
  IconRefresh,
  IconSearch,
  IconVideo,
} from '@/components/icons';

interface DriveFile {
  id?: number;
  drive_id: string;
  name: string;
  mime_type: string;
  path?: string;
  size: number;
  modified_at: string;
  created_at?: string;
  parent_id: string | null;
  is_folder: number;
  thumbnail_url: string | null;
  web_view_link: string | null;
  is_cloud: number;
}

interface DriveStats {
  totalFiles: number;
  totalFolders: number;
  totalSize: number;
  lastSync: string | null;
}

interface DriveStatus {
  configured: boolean;
  connected: boolean;
  email: string | null;
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

/** Icône vectorielle par type MIME — un seul jeu de traits, jamais un emoji
    (les emoji sont des bitmaps qui pixellisent et changent selon le système). */
function fileIconFor(mimeType: string, isFolder: boolean): ElementType {
  if (isFolder) return IconFolder;
  if (mimeType.startsWith('image/')) return IconImage;
  if (mimeType.startsWith('video/')) return IconVideo;
  if (mimeType.includes('pdf')) return IconFile;
  if (mimeType.includes('word') || mimeType.includes('document')) return IconFileDoc;
  if (mimeType.includes('excel') || mimeType.includes('sheet')) return IconFileSheet;
  if (mimeType.includes('presentation') || mimeType.includes('slide')) return IconFileSlides;
  if (mimeType.includes('zip')) return IconFileZip;
  if (mimeType.includes('text')) return IconFile;
  if (mimeType.includes('folder')) return IconFolder;
  return IconFileGeneric;
}

function isImageType(mime: string): boolean {
  return mime.startsWith('image/') || mime === 'image/svg+xml';
}

function DrivePageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [files, setFiles] = useState<DriveFile[]>([]);
  const [stats, setStats] = useState<DriveStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [currentFolder, setCurrentFolder] = useState<string | null>(searchParams.get('folder'));
  const [breadcrumb, setBreadcrumb] = useState<DriveFile[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Google Drive state
  const [driveStatus, setDriveStatus] = useState<DriveStatus | null>(null);
  const [driveSource, setDriveSource] = useState<string>('local');
  const [selectedFile, setSelectedFile] = useState<DriveFile | null>(null);

  // Check connected status from URL params
  const connected = searchParams.get('connected');
  const urlError = searchParams.get('error');

  useEffect(() => {
    if (connected === 'true') {
      setError(null);
      router.replace('/drive');
    }
    if (urlError) {
      setError(`Erreur Google: ${decodeURIComponent(urlError)}`);
      router.replace('/drive');
    }
  }, [connected, urlError, router]);

  const fetchDriveStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/drive/google?status=true');
      const data = await response.json();
      setDriveStatus(data);
    } catch {
      setDriveStatus({ configured: false, connected: false, email: null });
    }
  }, []);

  const fetchFiles = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      let url = '/api/drive/google';
      const params = new URLSearchParams();

      if (search) {
        params.set('search', search);
      } else if (currentFolder) {
        params.set('parentId', currentFolder);
      }

      if (params.toString()) {
        url += `?${params.toString()}`;
      }

      const response = await fetch(url);
      const data = await response.json();

      if (!data.success && data.error) throw new Error(data.error);

      setFiles(data.files || []);
      setDriveSource(data.source || 'local');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  }, [search, currentFolder]);

  const fetchStats = async () => {
    try {
      const response = await fetch('/api/drive?stats=true');
      const data = await response.json();
      if (data.success) {
        setStats(data.stats);
      }
    } catch (err) {
      console.error('Error fetching stats:', err);
    }
  };

  useEffect(() => {
    fetchDriveStatus();
    fetchFiles();
    fetchStats();
  }, [fetchDriveStatus, fetchFiles]);

  const handleSync = async () => {
    setSyncing(true);
    setError(null);

    try {
      if (driveStatus?.connected) {
        // Sync from Google Drive
        const response = await fetch('/api/drive/google?sync=true');
        const data = await response.json();
        if (!data.success) throw new Error(data.error || 'Sync failed');
      } else {
        // Sync local
        const response = await fetch('/api/drive?sync=true');
        const data = await response.json();
        if (!data.success) throw new Error(data.error || 'Sync failed');
      }

      fetchFiles();
      fetchStats();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de synchronisation');
    } finally {
      setSyncing(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setCurrentFolder(null);
    fetchFiles();
  };

  const handleFolderClick = (folderId: string) => {
    setSearch('');
    setCurrentFolder(folderId);
    router.push(`/drive?folder=${folderId}`);
  };

  const handleFileClick = (file: DriveFile) => {
    if (file.is_folder) {
      handleFolderClick(file.drive_id);
    } else if (file.is_cloud) {
      // Open in Google Drive
      if (file.web_view_link) {
        window.open(file.web_view_link, '_blank');
      }
    } else if (file.path) {
      window.open(file.path, '_blank');
    }
  };

  const handleDisconnect = async () => {
    try {
      await fetch('/api/drive/google?disconnect=true');
      setDriveStatus({ configured: false, connected: false, email: null });
      fetchFiles();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de déconnexion');
    }
  };

  const handleSelectForArticle = (file: DriveFile) => {
    if (!isImageType(file.mime_type)) return;
    // Copy the Drive thumbnail URL or use proxy
    const imageUrl = file.is_cloud
      ? `/api/drive/google/thumbnail?id=${file.drive_id}`
      : file.thumbnail_url || '';
    navigator.clipboard.writeText(window.location.origin + imageUrl);
    alert('URL de l\'image copiée dans le presse-papier');
  };

  return (
    <div className="min-h-screen">
      <PageHeader
        title="Drive"
        back={{ href: '/', label: 'Accueil' }}
        subtitle={
          driveStatus?.connected
            ? 'Google Drive connecté'
            : driveStatus?.configured
              ? 'Google Drive non connecté'
              : 'Dossier local drive-sync/'
        }
        actions={
          <>
            {driveStatus?.connected && (
              <Badge tone="success">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--success)]" />
                Connecté
              </Badge>
            )}
            {driveStatus?.configured && !driveStatus?.connected ? (
              <a
                href="/api/auth/google"
                className="inline-flex h-7 items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--accent-border)] bg-[var(--accent-soft)] px-2.5 text-[12px] font-medium text-[var(--accent)] transition-colors duration-[var(--dur-fast)] hover:border-[var(--accent)]"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Connecter Google Drive
              </a>
            ) : driveStatus?.connected ? (
              <Button onClick={handleDisconnect} variant="ghost">
                Déconnecter
              </Button>
            ) : null}
            <Button onClick={handleSync} disabled={syncing} variant="secondary">
              <IconRefresh size={13} strokeWidth={2} className={syncing ? 'animate-spin' : ''} />
              {syncing ? 'Synchronisation…' : 'Synchroniser'}
            </Button>
          </>
        }
      />
      <div className="mx-auto max-w-6xl px-6 py-6">

        {/* Connected email */}
        {driveStatus?.connected && driveStatus?.email && (
          <div className="mb-4 p-3 bg-[var(--success-soft)] border border-[var(--success-border)] rounded-lg text-sm text-[var(--success)]">
            Connecté en tant que <span className="font-medium">{driveStatus.email}</span>
            {driveSource === 'cache' && (
              <span className="text-[var(--warn)] ml-2">(mode cache — re-sync nécessaire)</span>
            )}
          </div>
        )}

        {/* Not configured info */}
        {driveStatus && !driveStatus.configured && (
          <div className="mb-6 p-4 bg-[var(--warn-soft)] border border-[var(--warn-border)] rounded-lg">
            <p className="text-sm text-[var(--warn)] font-medium mb-2">Google Drive non configuré</p>
            <p className="text-xs text-[var(--text-secondary)]">
              Pour connecter Google Drive, ajoutez <code className="bg-[var(--surface-base)] px-1 rounded">GOOGLE_CLIENT_ID</code> et{' '}
              <code className="bg-[var(--surface-base)] px-1 rounded">GOOGLE_CLIENT_SECRET</code> dans{' '}
              <code className="bg-[var(--surface-base)] px-1 rounded">.env.local</code>.
            </p>
            <p className="text-xs text-[var(--text-secondary)] mt-1">
              Mode actuel : dossier local <code className="bg-[var(--surface-base)] px-1 rounded">drive-sync/</code>
            </p>
          </div>
        )}

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 gap-4 mb-6 sm:grid-cols-4">
            <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4 text-center">
              <div className="text-2xl font-bold text-[var(--text-primary)]">{stats.totalFiles}</div>
              <div className="text-xs text-[var(--text-muted)]">Fichiers</div>
            </div>
            <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4 text-center">
              <div className="text-2xl font-bold text-[var(--text-primary)]">{stats.totalFolders}</div>
              <div className="text-xs text-[var(--text-muted)]">Dossiers</div>
            </div>
            <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4 text-center">
              <div className="text-2xl font-bold text-[var(--text-primary)]">{formatFileSize(stats.totalSize)}</div>
              <div className="text-xs text-[var(--text-muted)]">Espace utilisé</div>
            </div>
            <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4 text-center">
              <div className="text-2xl font-bold text-[var(--text-primary)]">
                {stats.lastSync ? new Date(stats.lastSync).toLocaleDateString('fr-FR') : '—'}
              </div>
              <div className="text-xs text-[var(--text-muted)]">Dernière sync</div>
            </div>
          </div>
        )}

        {/* Search */}
        <form onSubmit={handleSearch} className="mb-6">
          <div className="flex gap-3">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher un fichier..."
              className="flex-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-4 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
            />
            <button
              type="submit"
              className="rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--brand-hover)]"
            >
              Rechercher
            </button>
            {search && (
              <button
                type="button"
                onClick={() => { setSearch(''); setCurrentFolder(null); }}
                className="rounded-lg border border-[var(--border-subtle)] px-4 py-2 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-raised)]"
              >
                Effacer
              </button>
            )}
          </div>
        </form>

        {/* Breadcrumb */}
        {currentFolder && !search && (
          <div className="mb-4 flex items-center gap-2 text-sm text-[var(--text-secondary)]">
            <button
              onClick={() => { setCurrentFolder(null); router.push('/drive'); }}
              className="hover:text-[var(--text-primary)]"
            >
              Racine
            </button>
            <span>/</span>
            <span className="text-[var(--text-primary)] font-medium">
              {files.length > 0 ? files[0].name : 'Dossier'}
            </span>
          </div>
        )}

        {error && (
          <div className="mb-6 rounded-lg border border-[var(--danger-border)] bg-[var(--danger-soft)] p-4 text-[var(--danger)] text-sm">
            {error}
          </div>
        )}

        {/* Empty State */}
        {!loading && files.length === 0 && (
          <div className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-raised)]">
            <EmptyState
              icon={search ? IconSearch : driveStatus?.connected ? IconDrive : IconInbox}
              title={
                search
                  ? 'Aucun fichier trouvé'
                  : driveStatus?.connected
                    ? 'Aucun fichier sur Google Drive'
                    : 'Aucun fichier synchronisé'
              }
              hint={
                search
                  ? 'Essayez une autre recherche.'
                  : driveStatus?.connected
                    ? 'Cliquez sur « Synchroniser » pour charger vos fichiers Google Drive.'
                    : 'Cliquez sur « Synchroniser » pour importer les fichiers du dossier drive-sync.'
              }
            />
          </div>
        )}

        {/* File List */}
        {files.length > 0 && (
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border-subtle)] bg-[var(--surface-base)] text-left text-xs text-[var(--text-muted)]">
                  <th className="px-4 py-3 font-medium">Nom</th>
                  <th className="px-4 py-3 font-medium text-right">Taille</th>
                  <th className="px-4 py-3 font-medium text-right">Modifié</th>
                  <th className="px-4 py-3 font-medium text-right w-24">Actions</th>
                </tr>
              </thead>
              <tbody>
                {files.map((file) => (
                  <tr
                    key={file.drive_id}
                    className="border-b border-[var(--border-subtle)] last:border-b-0 hover:bg-[var(--surface-base)] cursor-pointer group"
                    onClick={() => handleFileClick(file)}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {(() => {
                          const FileIcon = fileIconFor(file.mime_type, !!file.is_folder);
                          if (file.thumbnail_url && isImageType(file.mime_type)) {
                            return (
                              /* Vignette 40 px : l'icône vectorielle est placée dessous
                                 et se dévoile si l'image ne charge pas. */
                              <div className="relative h-10 w-10 flex-shrink-0 overflow-hidden rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--surface-sunken)]">
                                <FileIcon
                                  size={16}
                                  strokeWidth={1.5}
                                  className="absolute inset-0 m-auto text-[var(--text-faint)]"
                                />
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={file.is_cloud
                                    ? `/api/drive/google/thumbnail?url=${encodeURIComponent(file.thumbnail_url)}`
                                    : file.thumbnail_url
                                  }
                                  alt={file.name}
                                  width={40}
                                  height={40}
                                  sizes="80px"
                                  className="relative h-full w-full object-cover"
                                  loading="lazy"
                                  decoding="async"
                                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                />
                              </div>
                            );
                          }
                          return (
                            <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--surface-hover)]">
                              <FileIcon
                                size={16}
                                strokeWidth={1.75}
                                className={file.is_folder ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'}
                              />
                            </span>
                          );
                        })()}
                        <div>
                          <div className="font-medium text-[var(--text-primary)] line-clamp-1">{file.name}</div>
                          <div className="text-xs text-[var(--text-muted)] flex items-center gap-2">
                            {file.mime_type.replace('application/vnd.google-apps.folder', 'Dossier')}
                            {file.is_cloud === 1 && (
                              <Badge tone="accent" icon={IconDrive}>Cloud</Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-[var(--text-secondary)]">
                      {file.is_folder ? '—' : formatFileSize(file.size)}
                    </td>
                    <td className="px-4 py-3 text-right text-[var(--text-muted)]">
                      {new Date(file.modified_at).toLocaleDateString('fr-FR')}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {isImageType(file.mime_type) && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleSelectForArticle(file); }}
                            className="px-2 py-1 bg-[var(--studio)] text-white rounded text-xs hover:bg-[var(--studio)]"
                            title="Copier l'URL pour un article"
                          >
                            Utiliser
                          </button>
                        )}
                        {file.is_cloud && file.web_view_link && (
                          <a
                            href={file.web_view_link}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="px-2 py-1 bg-[var(--surface-hover)] text-[var(--text-secondary)] rounded text-xs hover:bg-[var(--surface-overlay)]"
                          >
                            Ouvrir
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default function DrivePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[var(--surface-base)] p-8">
        <div className="max-w-6xl mx-auto">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-[var(--surface-raised)] rounded w-48" />
            <div className="h-4 bg-[var(--surface-raised)] rounded w-96" />
          </div>
        </div>
      </div>
    }>
      <DrivePageInner />
    </Suspense>
  );
}
