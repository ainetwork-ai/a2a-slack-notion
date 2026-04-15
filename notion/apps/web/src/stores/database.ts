'use client';

import { create } from 'zustand';
import { apiFetch } from '@/lib/api';
import type {
  PropertyDefinition,
  PropertyValue,
  ViewType,
  DatabaseSchema,
  DatabaseBlockProperties,
  DatabaseViewData,
  DatabaseTemplate,
} from '@notion/shared';

export interface DatabaseBlock {
  id: string;
  properties: DatabaseBlockProperties;
}

export interface DatabaseRow {
  id: string;
  databaseId: string;
  properties: {
    values: Record<string, PropertyValue>;
  };
  createdAt: string;
  updatedAt: string;
}

interface DatabaseState {
  database: DatabaseBlock | null;
  schema: DatabaseSchema | null;
  views: DatabaseViewData[];
  activeViewId: string | null;
  rows: DatabaseRow[];
  templates: DatabaseTemplate[];
  loading: boolean;
  error: string | null;

  loadDatabase: (databaseId: string) => Promise<void>;
  loadRows: (viewId?: string) => Promise<void>;
  loadTemplates: (databaseId: string) => Promise<void>;
  createRow: (values?: Record<string, PropertyValue>) => Promise<void>;
  createRowFromTemplate: (templateId: string) => Promise<void>;
  updateRow: (rowId: string, values: Record<string, PropertyValue>) => Promise<void>;
  deleteRow: (rowId: string) => Promise<void>;
  addProperty: (def: Omit<PropertyDefinition, 'id'>) => Promise<void>;
  updateProperty: (propertyId: string, updates: Partial<PropertyDefinition>) => Promise<void>;
  deleteProperty: (propertyId: string) => Promise<void>;
  setActiveView: (viewId: string) => void;
  createView: (name: string, type: ViewType) => Promise<void>;
  updateView: (viewId: string, updates: Partial<DatabaseViewData>) => Promise<void>;
  deleteView: (viewId: string) => Promise<void>;
}

export const useDatabaseStore = create<DatabaseState>((set, get) => ({
  database: null,
  schema: null,
  views: [],
  activeViewId: null,
  rows: [],
  templates: [],
  loading: false,
  error: null,

  loadDatabase: async (databaseId: string) => {
    set({ loading: true, error: null });
    try {
      const data = await apiFetch<{
        database: DatabaseBlock;
        schema: DatabaseSchema;
        views: DatabaseViewData[];
      }>(`/api/v1/databases/${databaseId}`);

      const firstViewId = data.views[0]?.id ?? null;
      set({
        database: data.database,
        schema: data.schema,
        views: data.views,
        activeViewId: firstViewId,
        loading: false,
      });

      if (firstViewId) {
        await get().loadRows(firstViewId);
      }
      await get().loadTemplates(databaseId);
    } catch (err) {
      set({ loading: false, error: err instanceof Error ? err.message : 'Failed to load database' });
    }
  },

  loadTemplates: async (databaseId: string) => {
    try {
      const data = await apiFetch<{ results: DatabaseTemplate[] }>(
        `/api/v1/databases/${databaseId}/templates`,
      );
      set({ templates: data.results });
    } catch {
      // Non-fatal: templates are optional
    }
  },

  loadRows: async (viewId?: string) => {
    const { database, activeViewId } = get();
    if (!database) return;

    const vid = viewId ?? activeViewId;
    const query = vid ? `?view_id=${vid}` : '';
    try {
      const data = await apiFetch<{ rows: DatabaseRow[] }>(
        `/api/v1/databases/${database.id}/rows${query}`,
      );
      set({ rows: data.rows });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to load rows' });
    }
  },

  createRow: async (values = {}) => {
    const { database } = get();
    if (!database) return;

    const row = await apiFetch<DatabaseRow>(`/api/v1/databases/${database.id}/rows`, {
      method: 'POST',
      body: JSON.stringify({ values }),
    });
    set((s) => ({ rows: [...s.rows, row] }));
  },

  createRowFromTemplate: async (templateId: string) => {
    const { database } = get();
    if (!database) return;

    const row = await apiFetch<DatabaseRow>(
      `/api/v1/databases/${database.id}/rows/from-template/${templateId}`,
      { method: 'POST' },
    );
    set((s) => ({ rows: [...s.rows, row] }));
  },

  updateRow: async (rowId: string, values: Record<string, PropertyValue>) => {
    const { database } = get();
    if (!database) return;

    const updated = await apiFetch<DatabaseRow>(
      `/api/v1/databases/${database.id}/rows/${rowId}`,
      { method: 'PATCH', body: JSON.stringify({ values }) },
    );
    set((s) => ({
      rows: s.rows.map((r) => (r.id === rowId ? updated : r)),
    }));
  },

  deleteRow: async (rowId: string) => {
    const { database } = get();
    if (!database) return;

    await apiFetch(`/api/v1/databases/${database.id}/rows/${rowId}`, { method: 'DELETE' });
    set((s) => ({ rows: s.rows.filter((r) => r.id !== rowId) }));
  },

  addProperty: async (def: Omit<PropertyDefinition, 'id'>) => {
    const { database } = get();
    if (!database) return;

    const updated = await apiFetch<{ schema: DatabaseSchema }>(
      `/api/v1/databases/${database.id}/properties`,
      { method: 'POST', body: JSON.stringify(def) },
    );
    set((s) => ({
      schema: updated.schema,
      database: s.database
        ? { ...s.database, properties: { ...s.database.properties, schema: updated.schema } }
        : null,
    }));
  },

  updateProperty: async (propertyId: string, updates: Partial<PropertyDefinition>) => {
    const { database } = get();
    if (!database) return;

    const updated = await apiFetch<{ schema: DatabaseSchema }>(
      `/api/v1/databases/${database.id}/properties/${propertyId}`,
      { method: 'PATCH', body: JSON.stringify(updates) },
    );
    set((s) => ({
      schema: updated.schema,
      database: s.database
        ? { ...s.database, properties: { ...s.database.properties, schema: updated.schema } }
        : null,
    }));
  },

  deleteProperty: async (propertyId: string) => {
    const { database } = get();
    if (!database) return;

    const updated = await apiFetch<{ schema: DatabaseSchema }>(
      `/api/v1/databases/${database.id}/properties/${propertyId}`,
      { method: 'DELETE' },
    );
    set((s) => ({
      schema: updated.schema,
      database: s.database
        ? { ...s.database, properties: { ...s.database.properties, schema: updated.schema } }
        : null,
    }));
  },

  setActiveView: (viewId: string) => {
    set({ activeViewId: viewId });
    get().loadRows(viewId).catch(console.error);
  },

  createView: async (name: string, type: ViewType) => {
    const { database } = get();
    if (!database) return;

    const view = await apiFetch<DatabaseViewData>(
      `/api/v1/databases/${database.id}/views`,
      { method: 'POST', body: JSON.stringify({ name, type }) },
    );
    set((s) => ({ views: [...s.views, view], activeViewId: view.id }));
    await get().loadRows(view.id);
  },

  updateView: async (viewId: string, updates: Partial<DatabaseViewData>) => {
    const { database } = get();
    if (!database) return;

    const updated = await apiFetch<DatabaseViewData>(
      `/api/v1/databases/${database.id}/views/${viewId}`,
      { method: 'PATCH', body: JSON.stringify(updates) },
    );
    set((s) => ({
      views: s.views.map((v) => (v.id === viewId ? updated : v)),
    }));
  },

  deleteView: async (viewId: string) => {
    const { database } = get();
    if (!database) return;

    await apiFetch(`/api/v1/databases/${database.id}/views/${viewId}`, { method: 'DELETE' });
    set((s) => {
      const views = s.views.filter((v) => v.id !== viewId);
      const activeViewId =
        s.activeViewId === viewId ? (views[0]?.id ?? null) : s.activeViewId;
      return { views, activeViewId };
    });
  },
}));
