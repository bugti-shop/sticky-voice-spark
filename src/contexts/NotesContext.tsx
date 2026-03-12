import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Note, SyncStatus } from '@/types/note';
import { loadNotesFromDB, saveNotesToDB, saveNoteToDBSingle, deleteNoteFromDB, migrateNotesToIndexedDB } from '@/utils/noteStorage';
import { getTextPreviewFromHtml } from '@/utils/contentPreview';
import { migrateNoteToSyncable, getDeviceIdSync } from '@/utils/noteDefaults';

// Lightweight note metadata for instant navigation
export interface NoteMeta {
  id: string;
  type: Note['type'];
  title: string;
  color?: Note['color'];
  customColor?: string;
  folderId?: string;
  isPinned?: boolean;
  isFavorite?: boolean;
  pinnedOrder?: number;
  isArchived?: boolean;
  archivedAt?: Date;
  isDeleted?: boolean;
  deletedAt?: Date;
  isHidden?: boolean;
  isProtected?: boolean;
  metaDescription?: string;
  reminderEnabled?: boolean;
  reminderTime?: Date;
  createdAt: Date;
  updatedAt: Date;
  contentPreview: string;
  hasFullContent: boolean;
}

const extractNoteMeta = (note: Note): NoteMeta => ({
  id: note.id,
  type: note.type,
  title: note.title,
  color: note.color,
  customColor: note.customColor,
  folderId: note.folderId,
  isPinned: note.isPinned,
  isFavorite: note.isFavorite,
  pinnedOrder: note.pinnedOrder,
  isArchived: note.isArchived,
  archivedAt: note.archivedAt,
  isDeleted: note.isDeleted,
  deletedAt: note.deletedAt,
  isHidden: note.isHidden,
  isProtected: note.isProtected,
  metaDescription: note.metaDescription,
  reminderEnabled: note.reminderEnabled,
  reminderTime: note.reminderTime,
  createdAt: note.createdAt,
  updatedAt: note.updatedAt,
  contentPreview: getTextPreviewFromHtml(note.content, 200),
  hasFullContent: true,
});

// ── Split contexts ──

/** Data context: notes array, metadata, loading state. Changes when notes data changes. */
interface NotesDataContextType {
  notes: Note[];
  notesMeta: NoteMeta[];
  isLoading: boolean;
  isInitialized: boolean;
  getNoteById: (noteId: string) => Note | undefined;
}

/** Dispatch context: actions only. Stable references — never causes re-renders. */
interface NotesDispatchContextType {
  setNotes: React.Dispatch<React.SetStateAction<Note[]>>;
  saveNote: (note: Note) => Promise<void>;
  deleteNote: (noteId: string) => Promise<void>;
  updateNote: (noteId: string, updates: Partial<Note>) => Promise<void>;
  bulkUpdateNotes: (noteIds: string[], updates: Partial<Note>) => Promise<void>;
  refreshNotes: () => Promise<void>;
}

/** Combined type for backward compatibility */
interface NotesContextType extends NotesDataContextType, NotesDispatchContextType {}

const NotesDataContext = createContext<NotesDataContextType | undefined>(undefined);
const NotesDispatchContext = createContext<NotesDispatchContextType | undefined>(undefined);

export const NotesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [notes, setNotes] = useState<Note[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isInitialized, setIsInitialized] = useState(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedRef = useRef<string>('');

  // Memoized metadata
  const prevNotesRef = useRef<Note[]>([]);
  const cachedMetaRef = useRef<NoteMeta[]>([]);

  const notesMeta = useMemo(() => {
    if (notes === prevNotesRef.current && cachedMetaRef.current.length > 0) {
      return cachedMetaRef.current;
    }
    prevNotesRef.current = notes;
    const result = notes.map(extractNoteMeta);
    cachedMetaRef.current = result;
    return result;
  }, [notes]);

  // Load notes once on mount
  useEffect(() => {
    let isMounted = true;

    const initializeNotes = async () => {
      try {
        console.log('[NotesContext] Initializing notes...');
        const startTime = performance.now();
        await migrateNotesToIndexedDB();
        const loadedNotes = await loadNotesFromDB();

        if (isMounted) {
          setNotes(loadedNotes);
          setIsInitialized(true);
          setIsLoading(false);
          const duration = (performance.now() - startTime).toFixed(0);
          console.log(`[NotesContext] Loaded ${loadedNotes.length} notes in ${duration}ms`);
        }
      } catch (error) {
        console.error('[NotesContext] Error loading notes:', error);
        if (isMounted) {
          setIsLoading(false);
          setIsInitialized(true);
        }
      }
    };

    initializeNotes();

    const handleNotesUpdated = () => {
      loadNotesFromDB().then(setNotes).catch(console.error);
    };
    const handleNotesRestored = () => {
      loadNotesFromDB().then(setNotes).catch(console.error);
    };

    window.addEventListener('notesUpdated', handleNotesUpdated);
    window.addEventListener('notesRestored', handleNotesRestored);

    return () => {
      isMounted = false;
      window.removeEventListener('notesUpdated', handleNotesUpdated);
      window.removeEventListener('notesRestored', handleNotesRestored);
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, []);

  // Debounced save
  const notesLengthRef = useRef(0);
  useEffect(() => {
    if (!isInitialized || notes.length === 0) return;
    const changed = notes !== prevNotesRef.current || notes.length !== notesLengthRef.current;
    notesLengthRef.current = notes.length;
    if (!changed) return;

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        await saveNotesToDB(notes);
        lastSavedRef.current = String(notes.length);
        window.dispatchEvent(new Event('notesUpdated'));
      } catch (error) {
        console.error('[NotesContext] Error saving notes:', error);
      }
    }, 500);
  }, [notes, isInitialized]);

  // ── Dispatch actions (stable — never change) ──

  const saveNote = useCallback(async (note: Note) => {
    const noteWithSync: Note = {
      ...note,
      syncVersion: (note.syncVersion ?? 0) + 1,
      syncStatus: 'pending' as SyncStatus,
      isDirty: true,
      deviceId: note.deviceId ?? getDeviceIdSync(),
    };

    setNotes(prev => {
      const existingIdx = prev.findIndex(n => n.id === noteWithSync.id);
      if (existingIdx >= 0) {
        const updated = [...prev];
        updated[existingIdx] = noteWithSync;
        return updated;
      }
      return [noteWithSync, ...prev];
    });

    try {
      await saveNoteToDBSingle(noteWithSync);
    } catch (error) {
      console.error('[NotesContext] Error saving single note:', error);
    }
  }, []);

  const deleteNote = useCallback(async (noteId: string) => {
    setNotes(prev => prev.filter(n => n.id !== noteId));
    try {
      await deleteNoteFromDB(noteId);
    } catch (error) {
      console.error('[NotesContext] Error deleting note:', error);
    }
  }, []);

  const updateNote = useCallback(async (noteId: string, updates: Partial<Note>) => {
    let updatedNote: Note | null = null;
    setNotes(prev =>
      prev.map(n => {
        if (n.id !== noteId) return n;
        updatedNote = {
          ...n,
          ...updates,
          updatedAt: new Date(),
          syncVersion: (n.syncVersion ?? 0) + 1,
          syncStatus: 'pending' as SyncStatus,
          isDirty: true,
          deviceId: n.deviceId ?? getDeviceIdSync(),
        };
        return updatedNote;
      })
    );

    try {
      if (updatedNote) await saveNoteToDBSingle(updatedNote);
    } catch (error) {
      console.error('[NotesContext] Error persisting note update:', error);
    }
  }, []);

  const bulkUpdateNotes = useCallback(async (noteIds: string[], updates: Partial<Note>) => {
    const updatedNotes: Note[] = [];
    setNotes(prev =>
      prev.map(n => {
        if (!noteIds.includes(n.id)) return n;
        const next: Note = {
          ...n,
          ...updates,
          updatedAt: new Date(),
          syncVersion: (n.syncVersion ?? 0) + 1,
          syncStatus: 'pending' as SyncStatus,
          isDirty: true,
          deviceId: n.deviceId ?? getDeviceIdSync(),
        };
        updatedNotes.push(next);
        return next;
      })
    );

    try {
      await Promise.all(updatedNotes.map(n => saveNoteToDBSingle(n)));
    } catch (error) {
      console.error('[NotesContext] Error persisting bulk note update:', error);
    }
  }, []);

  const refreshNotes = useCallback(async () => {
    try {
      const loadedNotes = await loadNotesFromDB();
      setNotes(loadedNotes);
    } catch (error) {
      console.error('[NotesContext] Error refreshing notes:', error);
    }
  }, []);

  const getNoteById = useCallback((noteId: string): Note | undefined => {
    return notes.find(n => n.id === noteId);
  }, [notes]);

  // ── Memoized context values ──

  const dataValue = useMemo<NotesDataContextType>(() => ({
    notes,
    notesMeta,
    isLoading,
    isInitialized,
    getNoteById,
  }), [notes, notesMeta, isLoading, isInitialized, getNoteById]);

  const dispatchValue = useMemo<NotesDispatchContextType>(() => ({
    setNotes,
    saveNote,
    deleteNote,
    updateNote,
    bulkUpdateNotes,
    refreshNotes,
  }), [saveNote, deleteNote, updateNote, bulkUpdateNotes, refreshNotes]);

  return (
    <NotesDispatchContext.Provider value={dispatchValue}>
      <NotesDataContext.Provider value={dataValue}>
        {children}
      </NotesDataContext.Provider>
    </NotesDispatchContext.Provider>
  );
};

// ── Hooks ──

/** Use only note data (notes, meta, loading). Re-renders when data changes. */
export const useNotesData = (): NotesDataContextType => {
  const context = useContext(NotesDataContext);
  if (!context) throw new Error('useNotesData must be used within a NotesProvider');
  return context;
};

/** Use only dispatch actions. Never re-renders — stable references. */
export const useNotesDispatch = (): NotesDispatchContextType => {
  const context = useContext(NotesDispatchContext);
  if (!context) throw new Error('useNotesDispatch must be used within a NotesProvider');
  return context;
};

/** Combined hook — backward compatible. Components using this re-render on data changes. */
export const useNotes = (): NotesContextType => {
  const data = useNotesData();
  const dispatch = useNotesDispatch();
  return { ...data, ...dispatch };
};

/** Optional hook that returns null if outside provider */
export const useNotesOptional = (): NotesContextType | null => {
  const data = useContext(NotesDataContext);
  const dispatch = useContext(NotesDispatchContext);
  if (!data || !dispatch) return null;
  return { ...data, ...dispatch };
};
