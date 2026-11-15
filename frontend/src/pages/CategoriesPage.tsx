import { useState } from 'react';
import { Pencil, Plus, Tags, Trash2 } from 'lucide-react';
import { Link } from 'react-router';
import { errorMessage } from '../api.ts';
import { CategoryFormDialog, suggestCategoryColor } from '../components/CategoryFormDialog.tsx';
import { ConfirmDialog } from '../components/Modal.tsx';
import { CategoryChip, EmptyState, ErrorNote, LoadingNote, PageHeader } from '../components/ui.tsx';
import { formatSongCount } from '../lib/format.ts';
import { useCategories, useDeleteCategory } from '../queries.ts';
import type { Category } from '../types.ts';

export function CategoriesPage() {
  const categories = useCategories();
  const deleteCategory = useDeleteCategory();
  const [editing, setEditing] = useState<Category | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Category | null>(null);

  const all = categories.data ?? [];

  return (
    <>
      <PageHeader
        title="Kategorien"
        subtitle="Stimmungen und Anlässe, nach denen du Songs einordnest – die Grundlage für passende Playlists."
        actions={
          <button type="button" className="button button-primary" onClick={() => setEditing('new')}>
            <Plus size={16} aria-hidden />
            Neue Kategorie
          </button>
        }
      />

      {categories.isPending ? (
        <LoadingNote label="Lade Kategorien …" />
      ) : categories.isError ? (
        <ErrorNote error={categories.error} onRetry={() => void categories.refetch()} />
      ) : all.length === 0 ? (
        <EmptyState icon={<Tags size={28} aria-hidden />} title="Noch keine Kategorien">
          <p>Leg zum Beispiel „melancholisch“, „aufpushend“ oder „Roadtrip“ an und ordne deine Songs zu.</p>
          <button type="button" className="button button-primary" onClick={() => setEditing('new')}>
            <Plus size={16} aria-hidden />
            Erste Kategorie anlegen
          </button>
        </EmptyState>
      ) : (
        <ul className="category-grid">
          {all.map((category) => (
            <li key={category.id} className="card category-card">
              <div className="category-card-head">
                <CategoryChip category={category} />
                <span className="category-card-actions">
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`${category.name} bearbeiten`}
                    title="Bearbeiten"
                    onClick={() => setEditing(category)}
                  >
                    <Pencil size={16} aria-hidden />
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`${category.name} löschen`}
                    title="Löschen"
                    onClick={() => setDeleting(category)}
                  >
                    <Trash2 size={16} aria-hidden />
                  </button>
                </span>
              </div>
              <p className="category-card-text">{category.description ?? <span className="muted">Ohne Beschreibung</span>}</p>
              {category.songCount > 0 ? (
                <Link className="category-card-count" to={`/songs?kategorie=${category.id}`}>
                  {formatSongCount(category.songCount)} anzeigen
                </Link>
              ) : (
                <span className="category-card-count muted">Noch kein Song</span>
              )}
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <CategoryFormDialog
          category={editing === 'new' ? null : editing}
          suggestedColor={suggestCategoryColor(all)}
          onClose={() => setEditing(null)}
        />
      )}

      {deleting && (
        <ConfirmDialog
          title="Kategorie löschen?"
          confirmLabel="Löschen"
          busy={deleteCategory.isPending}
          error={deleteCategory.isError ? errorMessage(deleteCategory.error) : null}
          onCancel={() => {
            deleteCategory.reset();
            setDeleting(null);
          }}
          onConfirm={() => deleteCategory.mutate(deleting.id, { onSuccess: () => setDeleting(null) })}
        >
          {deleting.songCount > 0
            ? `„${deleting.name}“ wird bei ${formatSongCount(deleting.songCount)} entfernt. Die Songs selbst bleiben erhalten.`
            : `„${deleting.name}“ ist noch keinem Song zugeordnet.`}
        </ConfirmDialog>
      )}
    </>
  );
}
