'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useFocusMode } from '@/hooks/useFocusMode';
import { KeyboardHint } from '@/components/KeyboardHint';
import { PageHeader } from '@/components/PageHeader';
import { Badge, Button, EmptyState } from '@/components/ui';
import {
  IconAlert,
  IconArrowRight,
  IconCheck,
  IconClose,
  IconGenerate,
  IconImage,
  IconImageOff,
  IconPlus,
  IconRefresh,
  IconSpinner,
  IconUser,
} from '@/components/icons';
import { useToast } from '@/components/Toast';
import { FactHighlighter } from '@/components/FactHighlighter';
import { LockBadge } from '@/components/LockBadge';
import { buildStudioLink } from '@/lib/studio-prefill';

function getUsername(): string {
  if (typeof window === 'undefined') return 'unknown';
  return localStorage.getItem('lma-username') || 'unknown';
}

interface Fact {
  text: string;
  source_url: string | null;
  source_title: string;
  confidence: 'high' | 'medium' | 'low';
}

interface Brief {
  event_id: number;
  headline: string;
  lede: string;
  body: string;
  facts: Fact[];
  angle_suggestion: string;
  generated_at?: string;
}

interface Item {
  id: number;
  title: string;
  url: string | null;
  summary: string | null;
  published_at: string | null;
  feed_name: string;
  image_url?: string | null;
  image_source?: string | null;
  image_rejected?: number;
  rejection_reason?: string | null;
}

interface Event {
  id: number;
  title: string;
  title_fr?: string | null;
  summary: string | null;
  summary_fr?: string | null;
  source_count: number;
  score: number;
  items: Item[];
  feed_names: string[];
  assigned_to?: string | null;
}

interface Article {
  id: number;
  content_id: string | null;
  event_id: number;
  title: string;
  chapeau: string | null;
  content: string;
  meta_description: string | null;
  word_count: number;
  status: string;
  verification_score: number | null;
  verification_issues: string | null;
  provenance?: string;
  generated_at: string;
}

interface Verification {
  verification: {
    confidenceScore: number;
    issues: string[];
  };
  plagiarism: {
    score: number;
    similarities: string[];
  };
  overallScore: number;
  recommendations: string[];
}

export default function EventDetail() {
  const params = useParams();
  const router = useRouter();
  const eventId = params.id as string;
  
  const [event, setEvent] = useState<Event | null>(null);
  const [brief, setBrief] = useState<Brief | null>(null);
  const [articles, setArticles] = useState<Article[]>([]);
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
  const [verification, setVerification] = useState<Verification | null>(null);
  const [loading, setLoading] = useState(true);
  const [generatingBrief, setGeneratingBrief] = useState(false);
  const [generatingArticle, setGeneratingArticle] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focusedColumn, setFocusedColumn] = useState<number>(0);
  const [tags, setTags] = useState<string[]>([]);
  const [refineInstruction, setRefineInstruction] = useState('');
  const [refining, setRefining] = useState(false);
  const [editingContent, setEditingContent] = useState<number | null>(null);
  const [editedText, setEditedText] = useState('');
  const [degraded, setDegraded] = useState(false);
  const [creatingManual, setCreatingManual] = useState(false);
  const [checklistState, setChecklistState] = useState<{ checked: number; total: number }>({ checked: 0, total: 0 });
  const [lockStatus, setLockStatus] = useState<Record<number, { locked_by: string | null; locked_at: string | null }>>({});
  const refineInputRef = useRef<HTMLInputElement>(null);
  const { addToast } = useToast();

  const { isFocused, enterFocus, exitFocus } = useFocusMode({
    onEscape: () => setFocusedColumn(0),
    onCtrlEnter: () => {
      if (!selectedArticle || selectedArticle.status === 'validated') return;
      if (editingContent === selectedArticle.id) return;
      if (checklistState.total > 0 && checklistState.checked < checklistState.total) return;
      handleUpdateStatus(selectedArticle.id, 'validated');
    },
  });

  useEffect(() => {
    fetchEvent();
    fetchSystemStatus();
    return () => {
      // Release locks on unmount
      if (selectedArticle) {
        const username = getUsername();
        fetch('/api/locks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'release', article_id: selectedArticle.id, username }),
        }).catch(() => {});
      }
    };
  }, [eventId]);

  const fetchSystemStatus = async () => {
    try {
      const response = await fetch('/api/system/status');
      if (response.ok) {
        const data = await response.json();
        setDegraded(!!data.degraded);
      }
    } catch (err) {
      // Statut inconnu : on ne bloque pas l'UI dessus
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'r') {
        e.preventDefault();
        handleRefine();
      }
      if (editingContent !== null && e.key === 'Escape') {
        setEditingContent(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [refineInstruction, editingContent, selectedArticle]);

  useEffect(() => {
    if (selectedArticle?.status === 'validated') {
      const el = document.getElementById('studio-link');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [selectedArticle?.status]);

  // Heartbeat: ping server every 30s to keep lock alive
  useEffect(() => {
    if (!selectedArticle) return;
    const username = getUsername();
    const interval = setInterval(() => {
      fetch('/api/locks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'heartbeat', article_id: selectedArticle.id, username }),
      }).catch(() => {});
    }, 30000);
    return () => clearInterval(interval);
  }, [selectedArticle]);

  const fetchEvent = async () => {
    try {
      const response = await fetch('/api/events');
      const data = await response.json();
      const found = data.events?.find((e: Event) => e.id === parseInt(eventId));
      setEvent(found || null);
      
      if (found) {
        await Promise.all([fetchBrief(true), fetchArticles(), fetchTags()]);
      }
    } catch (err) {
      setError('Erreur lors du chargement de l\'événement');
    } finally {
      setLoading(false);
    }
  };

  const fetchTags = async () => {
    try {
      const response = await fetch(`/api/events/tags?event_id=${eventId}`);
      if (response.ok) {
        const data = await response.json();
        setTags(data.tags || []);
      }
    } catch (err) {
      // Tags don't exist yet
    }
  };

  const fetchBrief = async (autoGenerate = false) => {
    try {
      const response = await fetch(`/api/brief?event_id=${eventId}`);
      if (response.ok) {
        const data = await response.json();
        if (data.brief) {
          setBrief(data.brief);
          return;
        }
      }
      // No brief exists — auto-generate if requested
      if (autoGenerate) {
        await handleGenerateBrief();
      }
    } catch (err) {
      // Brief doesn't exist yet
    }
  };

  const fetchArticles = async () => {
    try {
      const response = await fetch(`/api/generate?event_id=${eventId}`);
      if (response.ok) {
        const data = await response.json();
        setArticles(data.articles || []);
      }
    } catch (err) {
      // No articles yet
    }
  };

  const handleGenerateBrief = async () => {
    setGeneratingBrief(true);
    setError(null);
    
    try {
      const response = await fetch('/api/brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: parseInt(eventId) }),
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Erreur lors de la génération');
      }
      
      const data = await response.json();
      setBrief(data.brief);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setGeneratingBrief(false);
    }
  };

  const handleGenerateBriefAndArticle = async () => {
    setGeneratingBrief(true);
    setGeneratingArticle(true);
    setError(null);

    try {
      // Step 1: Generate brief
      const briefRes = await fetch('/api/brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: parseInt(eventId) }),
      });
      if (!briefRes.ok) {
        const d = await briefRes.json();
        throw new Error(d.error || 'Erreur brief');
      }
      const briefData = await briefRes.json();
      setBrief(briefData.brief);

      // Step 2: Generate article immediately
      const artRes = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: parseInt(eventId) }),
      });
      if (!artRes.ok) {
        const d = await artRes.json();
        if (artRes.status === 423 || d.degraded) setDegraded(true);
        throw new Error(d.error || 'Erreur article');
      }
      const artData = await artRes.json();
      setArticles(prev => [artData.article, ...prev]);
      setSelectedArticle(artData.article);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setGeneratingBrief(false);
      setGeneratingArticle(false);
    }
  };

  const handleGenerateArticle = async () => {
    setGeneratingArticle(true);
    setError(null);

    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: parseInt(eventId) }),
      });

      if (!response.ok) {
        const data = await response.json();
        if (response.status === 423 || data.degraded) {
          setDegraded(true);
        }
        throw new Error(data.error || 'Erreur lors de la génération');
      }

      const data = await response.json();
      setArticles(prev => [data.article, ...prev]);
      setSelectedArticle(data.article);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setGeneratingArticle(false);
    }
  };

  const handleCreateManual = async () => {
    setCreatingManual(true);
    setError(null);

    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: parseInt(eventId), manual: true }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Erreur lors de la création');
      }

      const data = await response.json();
      setArticles(prev => [data.article, ...prev]);
      setSelectedArticle(data.article);
      setEditingContent(data.article.id);
      setEditedText(data.article.content);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setCreatingManual(false);
    }
  };

  const handleVerifyArticle = async (article: Article) => {
    setVerifying(true);
    setSelectedArticle(article);
    setError(null);
    
    try {
      const response = await fetch(`/api/generate?id=${article.id}&verify=true`);
      if (response.ok) {
        const data = await response.json();
        setVerification(data.verification);
      }
    } catch (err) {
      setError('Erreur lors de la vérification');
    } finally {
      setVerifying(false);
    }
  };

  const handleUpdateStatus = async (articleId: number, status: string) => {
    try {
      const response = await fetch('/api/generate', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: articleId, status }),
      });
      
      if (response.ok) {
        setArticles(prev => prev.map(a =>
          a.id === articleId ? { ...a, status } : a
        ));
        if (selectedArticle?.id === articleId) {
          setSelectedArticle(prev => prev ? { ...prev, status } : null);
        }
        if (status === 'validated' || status === 'rejected') {
          fetchSystemStatus();
        }
        if (status === 'validated') {
          setError(null);
        }
      }
    } catch (err) {
      setError('Erreur lors de la mise à jour');
    }
  };

  const handleRefine = async () => {
    if (!refineInstruction.trim() || !selectedArticle || refining) return;
    
    setRefining(true);
    try {
      const response = await fetch('/api/generate/refine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          article_id: selectedArticle.id,
          instruction: refineInstruction.trim(),
        }),
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Erreur lors de la correction');
      }
      
      const data = await response.json();
      setArticles(prev => prev.map(a => 
        a.id === data.id ? { ...a, content: data.content, word_count: data.word_count } : a
      ));
      setSelectedArticle(prev => prev ? { ...prev, content: data.content, word_count: data.word_count } : null);
      setRefineInstruction('');
      addToast({ type: 'success', title: 'Article corrigé', message: 'Le LLM a appliqué la correction.' });
    } catch (err) {
      addToast({ type: 'error', title: 'Erreur', message: err instanceof Error ? err.message : 'Erreur inconnue' });
    } finally {
      setRefining(false);
    }
  };

  const handleInlineCorrect = async (newContent: string) => {
    if (!selectedArticle) return;
    setArticles(prev => prev.map(a => (a.id === selectedArticle.id ? { ...a, content: newContent } : a)));
    setSelectedArticle(prev => (prev ? { ...prev, content: newContent } : null));

    try {
      await fetch('/api/generate', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selectedArticle.id, content: newContent }),
      });
    } catch (err) {
      addToast({ type: 'error', title: 'Erreur', message: 'La correction n\'a pas pu être sauvegardée' });
    }
  };

  const handleSaveEdit = async () => {
    if (editingContent === null || !editedText.trim()) return;
    
    try {
      const response = await fetch('/api/generate', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editingContent, content: editedText }),
      });
      
      if (response.ok) {
        setArticles(prev => prev.map(a => 
          a.id === editingContent ? { ...a, content: editedText } : a
        ));
        setSelectedArticle(prev => prev ? { ...prev, content: editedText } : null);
        setEditingContent(null);
        addToast({ type: 'success', title: 'Sauvegardé', message: 'Édition manuelle enregistrée.' });
      }
    } catch (err) {
      addToast({ type: 'error', title: 'Erreur', message: 'Sauvegarde impossible' });
    }
  };

  const handleRemoveTag = async (tag: string) => {
    try {
      await fetch(`/api/events/tags?event_id=${eventId}&tag=${encodeURIComponent(tag)}`, {
        method: 'DELETE',
      });
      setTags(prev => prev.filter(t => t !== tag));
    } catch (err) {
      // Silent fail
    }
  };

  const handleAssignEvent = async () => {
    const username = getUsername();
    const currentAssigned = (event as Event & { assigned_to?: string })?.assigned_to;
    const newAssigned = currentAssigned === username ? null : username;

    try {
      await fetch('/api/events', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: parseInt(eventId), assigned_to: newAssigned }),
      });
      setEvent(prev => prev ? { ...prev, assigned_to: newAssigned } as Event & { assigned_to: string | null } : prev);
    } catch {}
  };

  // C3: Reject auto-found visual — clear it + re-scrape with blacklist in one call
  const handleRejectImage = async (itemId: number, currentImageUrl: string) => {
    try {
      const res = await fetch('/api/visual-search/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_id: itemId, rejected_url: currentImageUrl, reason: 'unsuitable' }),
      });
      const data = await res.json();

      if (data.newImage) {
        // Replacement found — update the item in-place
        setEvent(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            items: prev.items.map(item =>
              item.id === itemId
                ? { ...item, image_url: data.newImage, image_source: data.newSource, image_rejected: 0, rejection_reason: null }
                : item
            ),
          } as Event;
        });
        addToast({ type: 'success', title: 'Visuel remplacé', message: 'Un alternatif a été trouvé automatiquement' });
      } else {
        // No alternative — clear image, show fallback
        setEvent(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            items: prev.items.map(item =>
              item.id === itemId
                ? { ...item, image_url: null, image_source: null, image_rejected: 1, rejection_reason: 'unsuitable' }
                : item
            ),
          } as Event;
        });
        addToast({ type: 'warning', title: 'Aucun alternatif', message: 'Recherchez manuellement dans l\'article source' });
      }
    } catch {
      addToast({ type: 'error', title: 'Erreur', message: 'Le retraitement a échoué' });
    }
  };

  const handleAcquireLock = async (articleId: number) => {
    const username = getUsername();
    try {
      const res = await fetch('/api/locks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'acquire', article_id: articleId, username }),
      });
      const data = await res.json();
      setLockStatus(prev => ({ ...prev, [articleId]: { locked_by: data.locked_by, locked_at: data.locked_at } }));
      return data.locked as boolean;
    } catch {
      return true; // fail open
    }
  };

  const handleForceUnlock = async (articleId: number) => {
    try {
      await fetch('/api/locks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'force-unlock', article_id: articleId, username: getUsername() }),
      });
      setLockStatus(prev => ({ ...prev, [articleId]: { locked_by: null, locked_at: null } }));
      addToast({ type: 'info', title: 'Déverrouillé', message: 'L\'article a été déverrouillé.' });
    } catch {}
  };

  const handleSelectArticle = async (article: Article) => {
    const lock = lockStatus[article.id];
    const username = getUsername();

    // Already locked by someone else?
    if (lock && lock.locked_by && lock.locked_by !== username) {
      addToast({ type: 'warning', title: 'Verrouillé', message: `${lock.locked_by} est en cours de révision.` });
      return;
    }

    setSelectedArticle(article);
    await handleAcquireLock(article.id);
  };

  const handleChecklistChange = useCallback((checked: number, total: number) => {
    setChecklistState({ checked, total });
  }, []);

  const getConfidenceColor = (confidence: string) => {
    switch (confidence) {
      case 'high': return 'bg-[var(--success-soft)] text-[var(--success)]';
      case 'medium': return 'bg-[var(--warn-soft)] text-[var(--warn)]';
      case 'low': return 'bg-[var(--danger-soft)] text-[var(--danger)]';
      default: return 'bg-[var(--surface-hover)] text-[var(--text-secondary)]';
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-[var(--success)]';
    if (score >= 60) return 'text-[var(--warn)]';
    return 'text-[var(--danger)]';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--surface-base)] p-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center text-[var(--text-secondary)]">Chargement...</div>
        </div>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="min-h-screen bg-[var(--surface-base)] p-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center text-[var(--text-secondary)]">Événement non trouvé</div>
        </div>
      </div>
    );
  }

  const columns = [
    { id: 0, label: 'Sources', key: '1' },
    { id: 1, label: 'Brief', key: '2' },
    { id: 2, label: 'Articles', key: '3' },
    { id: 3, label: 'Revue', key: '4' },
  ];

  return (
    <div className="min-h-screen">
      <PageHeader
        title="Événement"
        back={{ href: '/events', label: 'Veille' }}
        actions={
          <KeyboardHint
            shortcuts={[
              { key: 'f', description: 'Mode focus' },
              { key: 'Escape', description: 'Quitter le focus' },
              { key: '1-4', description: 'Sélectionner colonne' },
              { key: '[', description: 'Rétracter barre latérale' },
            ]}
          />
        }
      />
      <div className={`mx-auto max-w-7xl px-6 py-6 transition-all ${isFocused ? 'pl-4' : ''}`}>
        {/* Titre de l'événement + métadonnées */}
        <div className="mb-6">
          <h1 className="t-display text-[var(--text-primary)]">{event.title_fr || event.title}</h1>
          <div className="flex flex-wrap gap-2 mt-2">
            <Badge tone="accent">
              <span className="font-data">Score {event.score}</span>
            </Badge>
            <Badge tone="neutral">
              <span className="font-data">
                {event.source_count} source{event.source_count > 1 ? 's' : ''}
              </span>
            </Badge>
            {tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 rounded-[var(--radius-full)] bg-[var(--surface-hover)] py-0.5 pl-2.5 pr-1 text-[11px] leading-5 text-[var(--text-secondary)]"
              >
                {tag}
                <button
                  onClick={() => handleRemoveTag(tag)}
                  aria-label={`Retirer le tag ${tag}`}
                  className="rounded p-0.5 text-[var(--text-faint)] transition-colors hover:text-[var(--danger)]"
                >
                  <IconClose size={10} strokeWidth={2.5} />
                </button>
              </span>
            ))}
            {event.feed_names.map((name, i) => (
              <Badge key={i} tone="neutral">
                {name}
              </Badge>
            ))}
            <button
              onClick={handleAssignEvent}
              className={`inline-flex h-6 items-center gap-1.5 rounded-[var(--radius-full)] px-2.5 text-[11px] font-medium transition-colors duration-[var(--dur-fast)] ${
                (event as Event & { assigned_to?: string }).assigned_to
                  ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
                  : 'bg-[var(--surface-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              {(event as Event & { assigned_to?: string }).assigned_to ? (
                <>
                  <IconUser size={11} strokeWidth={2} />
                  {(event as Event & { assigned_to?: string }).assigned_to}
                </>
              ) : (
                <>
                  <IconPlus size={11} strokeWidth={2.5} />
                  Prendre en charge
                </>
              )}
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-[var(--danger-soft)] border border-[var(--danger-border)] rounded text-[var(--danger)]">{error}</div>
        )}

        {/* Focus Mode Banner */}
        {isFocused && (
          <div className="mb-4 p-3 bg-[var(--accent-soft)] border border-[var(--accent-border)] rounded-lg flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-[var(--accent)]">Mode Focus</span>
              <span className="text-xs text-[var(--text-secondary)]">
                Colonnes : {columns.map((c, i) => (
                  <kbd key={c.id} className="mx-1 px-1.5 py-0.5 bg-[var(--surface-base)] rounded text-[10px] text-[var(--text-primary)] font-data">
                    {i + 1}
                  </kbd>
                ))}
              </span>
            </div>
            <button
              onClick={exitFocus}
              className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              <kbd className="px-1.5 py-0.5 bg-[var(--surface-base)] rounded text-[10px] font-data">Esc</kbd> Quitter
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Column 1: Sources */}
          <div className={`bg-[var(--surface-raised)] border rounded-lg p-4 transition-all ${
            isFocused && focusedColumn === 0 ? 'border-[var(--accent)] ring-1 ring-[var(--accent-border)]' : 'border-[var(--border-subtle)]'
          }`}>
            <div className="mb-3 flex h-7 items-center justify-between">
              <h2 className="t-title text-[var(--text-primary)]">Sources ({event.items.length})</h2>
              {isFocused && (
                <kbd className="px-1.5 py-0.5 bg-[var(--surface-base)] rounded text-[10px] text-[var(--text-secondary)] font-data">1</kbd>
              )}
            </div>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {event.items.map((item) => (
                <div key={item.id} className="border-b border-[var(--border-subtle)] pb-3 last:border-b-0">
                  {/* C3: Image thumbnail with visible reject button — the core trust-building element */}
                  {item.image_url ? (
                    <div className="mb-2 relative group overflow-hidden rounded-lg border border-[var(--border-subtle)]">
                      <img
                        src={item.image_url}
                        alt={item.title}
                        className="w-full h-32 object-cover"
                        loading="lazy"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                      {/* Reject button — always visible on the thumbnail, not hidden in a menu */}
                      <button
                        onClick={() => handleRejectImage(item.id, item.image_url!)}
                        className="absolute right-1.5 top-1.5 z-10 inline-flex cursor-pointer items-center gap-1
                          rounded-[var(--radius-sm)] bg-[var(--danger)] px-2 py-1 text-[10px] font-medium text-white
                          opacity-0 transition-opacity duration-[var(--dur-fast)] group-hover:opacity-100 focus-visible:opacity-100"
                        title="Ce visuel ne convient pas — cliquer pour chercher un alternatif"
                      >
                        <IconClose size={10} strokeWidth={2.5} />
                        Inadapté
                      </button>
                      {item.image_source && (
                        <span className="absolute bottom-1 left-1 px-1.5 py-0.5 bg-black/60 text-[10px] text-[var(--text-secondary)] rounded">
                          {item.image_source}
                        </span>
                      )}
                    </div>
                  ) : item.url ? (
                    /* C3: No visual found — show a prominent link to the source article for manual search */
                    <div className="mb-2 p-2 rounded-lg border border-dashed border-[var(--danger-border)] bg-[var(--danger-soft)]">
                      <div className="flex items-center gap-2">
                        <IconImageOff size={13} strokeWidth={2} className="text-[var(--danger)]" />
                        <span className="text-[11px] text-[var(--text-secondary)]">Aucun visuel trouvé</span>
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ml-auto text-[10px] text-[var(--accent)] hover:underline"
                        >
                          Chercher dans l&apos;article →
                        </a>
                      </div>
                    </div>
                  ) : null}
                  <h3 className="font-medium text-[var(--text-primary)] text-xs">
                    {item.url ? (
                      <a href={item.url} target="_blank" rel="noopener noreferrer" className="hover:underline text-[var(--accent)]">
                        {item.title}
                      </a>
                    ) : (
                      item.title
                    )}
                  </h3>
                  {item.summary && (
                    <p className="text-xs text-[var(--text-secondary)] mt-1 line-clamp-2">{item.summary}</p>
                  )}
                  <div className="flex gap-2 mt-1 text-xs text-[var(--text-muted)]">
                    <span>{item.feed_name}</span>
                    {item.published_at && (
                      <span>• {new Date(item.published_at).toLocaleDateString('fr-FR')}</span>
                    )}
                    {item.image_source && (
                      <span className="inline-flex items-center gap-1 text-[var(--success)]">
                        <IconImage size={11} strokeWidth={2} />
                        {item.image_source}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Column 2: Brief */}
          <div className={`bg-[var(--surface-raised)] border rounded-lg p-4 transition-all ${
            isFocused && focusedColumn === 1 ? 'border-[var(--accent)] ring-1 ring-[var(--accent-border)]' : 'border-[var(--border-subtle)]'
          }`}>
            <div className="mb-3 flex h-7 items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="t-title text-[var(--text-primary)]">Brief</h2>
                {isFocused && (
                  <kbd className="px-1.5 py-0.5 bg-[var(--surface-base)] rounded text-[10px] text-[var(--text-secondary)] font-data">2</kbd>
                )}
              </div>
              <Button
                onClick={brief ? handleGenerateBrief : handleGenerateBriefAndArticle}
                disabled={generatingBrief || generatingArticle}
                variant={brief ? 'secondary' : 'primary'}
              >
                {generatingBrief || generatingArticle ? (
                  <>
                    <IconSpinner size={12} strokeWidth={2} className="animate-spin" />
                    En cours
                  </>
                ) : brief ? (
                  <>
                    <IconRefresh size={12} strokeWidth={2} />
                    Régénérer
                  </>
                ) : (
                  <>
                    <IconGenerate size={12} strokeWidth={2} />
                    Brief + Article
                  </>
                )}
              </Button>
            </div>

            {brief ? (
              <div className="max-h-96 overflow-y-auto">
                <h3 className="text-sm font-medium text-[var(--text-primary)] mb-2">{brief.headline}</h3>
                <p className="text-xs text-[var(--text-secondary)] mb-3">{brief.lede}</p>
                
                <div className="text-xs text-[var(--text-secondary)] mb-4">
                  {brief.body.split('\n\n').map((paragraph, i) => (
                    <p key={i} className="mb-2">{paragraph}</p>
                  ))}
                </div>

                {/* Facts */}
                <div className="mb-4">
                  <h4 className="text-xs font-medium text-[var(--text-primary)] mb-2">Faits vérifiables</h4>
                  <div className="space-y-2">
                    {brief.facts.slice(0, 5).map((fact, i) => (
                      <div key={i} className="p-2 bg-[var(--surface-base)] rounded text-xs">
                        <div className="flex items-start gap-1">
                          <span className={`px-1 py-0.5 rounded text-xs ${getConfidenceColor(fact.confidence)}`}>
                            {fact.confidence}
                          </span>
                          <div className="flex-1">
                            <p className="text-[var(--text-secondary)]">{fact.text}</p>
                            <div className="text-[var(--text-muted)] mt-0.5">
                              Source: {fact.source_title}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Angle suggestion */}
                <div className="p-2 bg-[var(--accent-soft)] rounded text-xs">
                  <span className="font-medium text-[var(--accent)]">Angle: </span>
                  <span className="text-[var(--text-secondary)]">{brief.angle_suggestion}</span>
                </div>
              </div>
            ) : (
              <EmptyState
                compact
                icon={IconGenerate}
                title="Aucun brief généré"
                hint="Le brief agrège les faits vérifiables des sources — c'est la seule autorité factuelle de l'article."
              />
            )}
          </div>

          {/* Column 3: Articles */}
          <div className={`bg-[var(--surface-raised)] border rounded-lg p-4 transition-all ${
            isFocused && focusedColumn === 2 ? 'border-[var(--accent)] ring-1 ring-[var(--accent-border)]' : 'border-[var(--border-subtle)]'
          }`}>
            <div className="mb-3 flex h-7 items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="t-title text-[var(--text-primary)]">Articles</h2>
                {isFocused && (
                  <kbd className="px-1.5 py-0.5 bg-[var(--surface-base)] rounded text-[10px] text-[var(--text-secondary)] font-data">3</kbd>
                )}
              </div>
              {!degraded ? (
                <Button
                  onClick={handleGenerateArticle}
                  disabled={generatingArticle || !brief}
                  variant="primary"
                >
                  {generatingArticle ? (
                    <>
                      <IconSpinner size={12} strokeWidth={2} className="animate-spin" />
                      Génération
                    </>
                  ) : (
                    <>
                      <IconGenerate size={12} strokeWidth={2} />
                      Générer
                    </>
                  )}
                </Button>
              ) : (
                <Button
                  onClick={handleCreateManual}
                  disabled={creatingManual || !brief}
                  variant="danger"
                  title="Génération LLM suspendue — mode dégradé actif"
                >
                  <IconAlert size={12} strokeWidth={2} />
                  {creatingManual ? 'Création…' : 'Rédiger manuellement'}
                </Button>
              )}
            </div>

            {degraded && (
              <div className="mb-3 p-2 bg-[var(--danger-soft)] border border-[var(--danger-border)] rounded text-xs text-[var(--danger)]">
                Mode dégradé : la génération automatique est suspendue. Rédigez à partir du Brief.
              </div>
            )}

            {!brief && (
              <div className="flex items-center justify-center gap-1.5 py-4 text-[var(--text-muted)]">
                <IconArrowRight size={12} strokeWidth={2} className="rotate-180" />
                <span className="t-caption">Générez d&apos;abord un brief</span>
              </div>
            )}

            {articles.length > 0 ? (
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {articles.map((article) => (
                  <div
                    key={article.id}
                    className={`border rounded p-3 cursor-pointer transition-all ${
                      selectedArticle?.id === article.id
                        ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                        : 'border-[var(--border-subtle)] hover:border-[var(--border-default)]'
                    }`}
                    onClick={() => handleSelectArticle(article)}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`px-2 py-0.5 rounded text-xs font-data ${
                        article.status === 'validated' ? 'bg-[var(--success-soft)] text-[var(--success)]' :
                        article.status === 'published' ? 'bg-[var(--accent-soft)] text-[var(--accent)]' :
                        'bg-[var(--surface-hover)] text-[var(--text-secondary)]'
                      }`}>
                        {article.status}
                      </span>
                      <span className="text-xs text-[var(--text-muted)] font-data">
                        {article.word_count} mots
                      </span>
                      {article.verification_score !== null && (
                        <span className={`text-xs font-medium font-data ${getScoreColor(article.verification_score)}`}>
                          Vérif: {article.verification_score}%
                        </span>
                      )}
                      {article.provenance && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--surface-hover)] text-[var(--text-secondary)]" title="Provenance de l'article">
                          {article.provenance}
                        </span>
                      )}
                      {lockStatus[article.id]?.locked_by && (
                        <LockBadge
                          lockedBy={lockStatus[article.id].locked_by}
                          lockedAt={lockStatus[article.id].locked_at}
                          currentUser={getUsername()}
                          onForceUnlock={() => handleForceUnlock(article.id)}
                        />
                      )}
                    </div>

                    <h3 className="font-medium text-[var(--text-primary)] text-sm mb-1">{article.title}</h3>
                    {article.chapeau && (
                      <p className="text-xs text-[var(--text-secondary)] mb-2 italic">{article.chapeau}</p>
                    )}
                    <div className="text-xs text-[var(--text-secondary)] line-clamp-4">
                      {article.content.split('\n\n').slice(0, 2).map((paragraph, i) => (
                        <p key={i} className="mb-1">{paragraph}</p>
                      ))}
                    </div>
                    <div className="text-xs text-[var(--text-muted)] mt-2 font-data">
                      {new Date(article.generated_at).toLocaleString('fr-FR')}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              brief && !generatingArticle && (
                <EmptyState
                  compact
                  icon={IconGenerate}
                  title="Aucun article généré"
                  hint="L'article est rédigé à partir du brief uniquement — aucun fait n'est ajouté."
                />
              )
            )}

            {generatingArticle && (
              <div className="text-center py-8">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--studio)]"></div>
                <p className="text-sm text-[var(--text-muted)] mt-2">Génération en cours...</p>
              </div>
            )}

            {/* Micro-correction */}
            {selectedArticle && !generatingArticle && (
              <div className="mt-3 border-t border-[var(--border-subtle)] pt-3">
                <div className="flex gap-2">
                  <input
                    ref={refineInputRef}
                    type="text"
                    value={refineInstruction}
                    onChange={(e) => setRefineInstruction(e.target.value)}
                    placeholder="Ajustement rapide... (Ctrl+R)"
                    className="flex-1 px-2 py-1.5 border border-[var(--border-subtle)] bg-[var(--surface-base)] rounded text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--studio)] focus:outline-none"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleRefine();
                    }}
                  />
                  <button
                    onClick={handleRefine}
                    disabled={!refineInstruction.trim() || refining}
                    className="px-3 py-1.5 bg-[var(--studio)] text-white rounded hover:bg-[var(--studio)] disabled:opacity-50 text-xs"
                  >
                    {refining ? '...' : 'Ajuster'}
                  </button>
                </div>
                <p className="text-[10px] text-[var(--text-muted)] mt-1">
                  Ctrl+R pour ajuster • ou cliquez sur le texte pour éditer manuellement
                </p>
              </div>
            )}
          </div>

          {/* Column 4: Review & Verification */}
          <div className={`bg-[var(--surface-raised)] border rounded-lg p-4 transition-all ${
            isFocused && focusedColumn === 3 ? 'border-[var(--accent)] ring-1 ring-[var(--accent-border)]' : 'border-[var(--border-subtle)]'
          }`}>
            <div className="mb-3 flex h-7 items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="t-title text-[var(--text-primary)]">Revue</h2>
                {isFocused && (
                  <kbd className="px-1.5 py-0.5 bg-[var(--surface-base)] rounded text-[10px] text-[var(--text-secondary)] font-data">4</kbd>
                )}
              </div>
              {selectedArticle && (
                <button
                  onClick={() => handleVerifyArticle(selectedArticle)}
                  disabled={verifying}
                  className="inline-flex h-7 items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--surface-hover)] px-2.5 text-[12px] font-medium text-[var(--text-primary)] transition-colors duration-[var(--dur-fast)] hover:border-[var(--border-strong)] disabled:opacity-45"
                >
                  {verifying ? 'Vérification…' : 'Vérifier'}
                </button>
              )}
            </div>

            {!selectedArticle ? (
              <EmptyState
                compact
                icon={IconCheck}
                title="Aucun article sélectionné"
                hint="Sélectionnez un article pour lancer les contrôles automatiques avant la revue humaine."
              />
            ) : (
              <div className="max-h-96 overflow-y-auto">
                {/* Article details */}
                <div className="mb-4">
                  <h3 className="font-medium text-[var(--text-primary)] text-sm mb-2">{selectedArticle.title}</h3>
                  {selectedArticle.chapeau && (
                    <p className="text-xs text-[var(--text-secondary)] mb-2 italic">{selectedArticle.chapeau}</p>
                  )}
                  
                  {editingContent === selectedArticle.id ? (
                    <div>
                      <textarea
                        value={editedText}
                        onChange={(e) => setEditedText(e.target.value)}
                        className="w-full p-2 border border-[var(--accent)] bg-[var(--surface-base)] rounded text-xs text-[var(--text-primary)] focus:outline-none font-mono"
                        rows={12}
                        autoFocus
                      />
                      <div className="flex gap-2 mt-2">
                        <button
                          onClick={handleSaveEdit}
                          className="px-3 py-1 bg-[var(--success)] text-white rounded hover:bg-[var(--success)] text-xs"
                        >
                          Sauvegarder
                        </button>
                        <button
                          onClick={() => setEditingContent(null)}
                          className="px-3 py-1 bg-[var(--surface-hover)] text-[var(--text-secondary)] rounded hover:bg-[var(--surface-overlay)] text-xs"
                        >
                          Annuler
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[10px] text-[var(--text-muted)]">
                          Cliquez un chiffre surligné pour le confirmer • double-clic pour le corriger
                        </span>
                        <button
                          onClick={() => {
                            setEditingContent(selectedArticle.id);
                            setEditedText(selectedArticle.content);
                          }}
                          className="text-[10px] text-[var(--accent)] hover:underline flex-shrink-0 ml-2"
                        >
                          Éditer le texte
                        </button>
                      </div>
                      <div className="text-xs text-[var(--text-secondary)] p-1 rounded whitespace-pre-wrap leading-relaxed">
                        <FactHighlighter
                          content={selectedArticle.content}
                          articleKey={selectedArticle.id}
                          onContentChange={handleInlineCorrect}
                          onChecklistChange={handleChecklistChange}
                        />
                      </div>
                      {checklistState.total > 0 && selectedArticle.status !== 'validated' && (
                        <div className="mt-2 text-[10px] font-data">
                          <span className={checklistState.checked >= checklistState.total ? 'text-[var(--success)]' : 'text-[var(--warn)]'}>
                            {checklistState.checked}/{checklistState.total} données vérifiées
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Verification results */}
                {verification && (
                  <div className="border-t border-[var(--border-subtle)] pt-4">
                    <h4 className="font-medium text-[var(--text-primary)] text-sm mb-3">Résultats de vérification</h4>
                    
                    {/* Overall score */}
                    <div className="mb-4 p-3 bg-[var(--surface-base)] rounded">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-[var(--text-secondary)]">Score global:</span>
                        <span className={`text-lg font-bold font-data ${getScoreColor(verification.overallScore)}`}>
                          {verification.overallScore}%
                        </span>
                      </div>
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-xs text-[var(--text-muted)]">Chiffres vérifiés:</span>
                        <span className={`text-sm font-medium font-data ${getScoreColor(verification.verification.confidenceScore)}`}>
                          {verification.verification.confidenceScore}%
                        </span>
                      </div>
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-xs text-[var(--text-muted)]">Originalité:</span>
                        <span className={`text-sm font-medium font-data ${getScoreColor(100 - verification.plagiarism.score)}`}>
                          {100 - verification.plagiarism.score}%
                        </span>
                      </div>
                    </div>

                    {/* Issues */}
                    {verification.verification.issues.length > 0 && (
                      <div className="mb-4">
                        <h5 className="text-xs font-medium text-[var(--text-primary)] mb-2">Problèmes détectés:</h5>
                        <ul className="space-y-1">
                          {verification.verification.issues.map((issue, i) => (
                            <li key={i} className="text-xs text-[var(--danger)] flex items-start gap-1">
                              <span>•</span>
                              <span>{issue}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Plagiarism */}
                    {verification.plagiarism.similarities.length > 0 && (
                      <div className="mb-4">
                        <h5 className="text-xs font-medium text-[var(--text-primary)] mb-2">Phrases similaires aux sources:</h5>
                        <ul className="space-y-1">
                          {verification.plagiarism.similarities.slice(0, 3).map((sim, i) => (
                            <li key={i} className="text-xs text-[var(--warn)] italic">
                              &quot;{sim.substring(0, 100)}...&quot;
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Recommendations */}
                    {verification.recommendations.length > 0 && (
                      <div className="mb-4">
                        <h5 className="text-xs font-medium text-[var(--text-primary)] mb-2">Recommandations:</h5>
                        <ul className="space-y-1">
                          {verification.recommendations.map((rec, i) => (
                            <li key={i} className="text-xs text-[var(--accent)] flex items-start gap-1">
                              <span>→</span>
                              <span>{rec}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                {/* Review actions */}
                <div className="border-t border-[var(--border-subtle)] pt-4 mt-4">
                  <h4 className="font-medium text-[var(--text-primary)] text-sm mb-3">Décision</h4>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleUpdateStatus(selectedArticle.id, 'validated')}
                      disabled={
                        selectedArticle.status === 'validated' ||
                        (editingContent !== selectedArticle.id && checklistState.total > 0 && checklistState.checked < checklistState.total)
                      }
                      title={
                        checklistState.total > 0 && checklistState.checked < checklistState.total
                          ? 'Confirmez chaque donnée surlignée avant de valider'
                          : undefined
                      }
                      className="flex-1 px-3 py-2 bg-[var(--success)] text-white rounded hover:bg-[var(--success)] disabled:opacity-50 disabled:cursor-not-allowed text-xs btn-glow-green"
                    >
                      Valider {checklistState.total > 0 && selectedArticle.status !== 'validated' ? `(${checklistState.checked}/${checklistState.total})` : ''}
                    </button>
                    <button
                      onClick={() => handleUpdateStatus(selectedArticle.id, 'rejected')}
                      disabled={selectedArticle.status === 'rejected'}
                      className="flex-1 px-3 py-2 bg-[var(--danger)] text-white rounded hover:bg-[var(--danger)] disabled:opacity-50 text-xs btn-glow-red"
                    >
                      Rejeter
                    </button>
                  </div>
                </div>

                {/* Create Instagram Post */}
                {selectedArticle.status === 'validated' && (
                  <div id="studio-link" className="border-t border-[var(--border-subtle)] pt-4 mt-4">
                    <a
                      href={buildStudioLink({
                        title: selectedArticle.title,
                        source: event?.feed_names?.[0] || '',
                        imageUrl: event?.items?.find(i => i.image_url)?.image_url || null,
                        contentId: selectedArticle.content_id || '',
                        briefHeadline: brief?.headline?.slice(0, 200) || '',
                      })}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block w-full px-3 py-2 bg-[var(--studio-soft)] text-white rounded hover:border-[var(--studio)] text-xs font-medium text-center glow-violet"
                    >
                      Créer un post Instagram →
                    </a>
                    <p className="text-xs text-[var(--text-muted)] mt-2 text-center">
                      {event?.items?.some(i => i.image_url)
                        ? 'Ouvre STUDIO avec titre, source et image pré-remplis'
                        : 'Ouvre STUDIO avec titre et source pré-remplis (image à ajouter manuellement)'}
                    </p>
                  </div>
                )}

                {/* Correction interface */}
                <CorrectionInterface articleId={selectedArticle.id} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function CorrectionInterface({ articleId }: { articleId: number }) {
  const [generatedText, setGeneratedText] = useState('');
  const [correctedText, setCorrectedText] = useState('');
  const [correctionType, setCorrectionType] = useState('');
  const [patternObserved, setPatternObserved] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [lastCorrection, setLastCorrection] = useState<{ generated: string; corrected: string } | null>(null);
  const [addingToStyleGuide, setAddingToStyleGuide] = useState(false);
  const [addedToStyleGuide, setAddedToStyleGuide] = useState(false);
  const { addToast } = useToast();

  const handleSubmit = async () => {
    if (!generatedText || !correctedText) return;

    setSubmitting(true);
    try {
      const response = await fetch('/api/corrections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          article_id: articleId,
          generated_text: generatedText,
          corrected_text: correctedText,
          correction_type: correctionType || undefined,
          pattern_observed: patternObserved || undefined,
          notes: notes || undefined,
        }),
      });

      if (response.ok) {
        setSuccess(true);
        setLastCorrection({ generated: generatedText, corrected: correctedText });
        setAddedToStyleGuide(false);
        setGeneratedText('');
        setCorrectedText('');
        setCorrectionType('');
        setPatternObserved('');
        setNotes('');
        setTimeout(() => setSuccess(false), 3000);
      }
    } catch (err) {
      console.error('Error submitting correction');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddToStyleGuide = async () => {
    if (!lastCorrection || addingToStyleGuide) return;
    setAddingToStyleGuide(true);
    try {
      const response = await fetch('/api/style-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ banned: lastCorrection.generated, expected: lastCorrection.corrected }),
      });
      if (response.ok) {
        setAddedToStyleGuide(true);
        addToast({ type: 'success', title: 'Guide de style mis à jour', message: 'La règle sera appliquée aux prochaines générations.' });
      }
    } catch (err) {
      addToast({ type: 'error', title: 'Erreur', message: 'Impossible d\'ajouter la règle' });
    } finally {
      setAddingToStyleGuide(false);
    }
  };

  return (
    <div className="border-t border-[var(--border-subtle)] pt-4 mt-4">
      <h4 className="font-medium text-[var(--text-primary)] text-sm mb-3">Enregistrer une correction</h4>

      {success && lastCorrection && (
        <div className="mb-3 p-2 bg-[var(--success-soft)] text-[var(--success)] rounded text-xs flex items-center justify-between gap-2">
          <span>Correction enregistrée !</span>
          <button
            onClick={handleAddToStyleGuide}
            disabled={addingToStyleGuide || addedToStyleGuide}
            className="px-2 py-1 bg-[var(--studio)] text-white rounded hover:bg-[var(--studio)] disabled:opacity-50 text-[10px] flex-shrink-0"
          >
            {addedToStyleGuide ? (
              <span className="inline-flex items-center gap-1"><IconCheck size={12} strokeWidth={2.5} />Ajoutée</span>
            ) : addingToStyleGuide ? '…' : 'Ajouter au Guide de Style'}
          </button>
        </div>
      )}

      <div className="space-y-3">
        <div>
          <label className="block text-xs text-[var(--text-secondary)] mb-1">Texte généré (original)</label>
          <textarea
            value={generatedText}
            onChange={(e) => setGeneratedText(e.target.value)}
            className="w-full p-2 border border-[var(--border-subtle)] bg-[var(--surface-base)] rounded text-xs text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none"
            rows={3}
            placeholder="Collez le texte original généré..."
          />
        </div>

        <div>
          <label className="block text-xs text-[var(--text-secondary)] mb-1">Texte corrigé</label>
          <textarea
            value={correctedText}
            onChange={(e) => setCorrectedText(e.target.value)}
            className="w-full p-2 border border-[var(--border-subtle)] bg-[var(--surface-base)] rounded text-xs text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none"
            rows={3}
            placeholder="Collez la version corrigée..."
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs text-[var(--text-secondary)] mb-1">Type</label>
            <select
              value={correctionType}
              onChange={(e) => setCorrectionType(e.target.value)}
              className="w-full p-2 border border-[var(--border-subtle)] bg-[var(--surface-base)] rounded text-xs text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none"
            >
              <option value="">Sélectionner...</option>
              <option value="ton">Ton</option>
              <option value="vocabulaire">Vocabulaire</option>
              <option value="structure">Structure</option>
              <option value="faits">Faits</option>
              <option value="style">Style</option>
            </select>
          </div>

          <div>
            <label className="block text-xs text-[var(--text-secondary)] mb-1">Pattern observé</label>
            <input
              type="text"
              value={patternObserved}
              onChange={(e) => setPatternObserved(e.target.value)}
              className="w-full p-2 border border-[var(--border-subtle)] bg-[var(--surface-base)] rounded text-xs text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none"
              placeholder="Ex: trop familier"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs text-[var(--text-secondary)] mb-1">Notes (optionnel)</label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full p-2 border border-[var(--border-subtle)] bg-[var(--surface-base)] rounded text-xs text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none"
            placeholder="Ajouter des notes..."
          />
        </div>

        <button
          onClick={handleSubmit}
          disabled={!generatedText || !correctedText || submitting}
          className="w-full px-3 py-2 bg-[var(--brand)] text-white rounded hover:bg-[var(--accent-hover)] disabled:opacity-50 text-xs"
        >
          {submitting ? 'Enregistrement...' : 'Enregistrer la correction'}
        </button>
      </div>
    </div>
  );
}
