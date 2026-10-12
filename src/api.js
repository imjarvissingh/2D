/* Loomframe mock backend.
 * A Promise-based, REST-shaped API so the UI never touches storage directly.
 * Projects live in IndexedDB; if that is unavailable we fall back to localStorage.
 *   GET    /projects       -> api.list()
 *   GET    /projects/:id   -> api.get(id)
 *   PUT    /projects/:id   -> api.save(project)
 *   DELETE /projects/:id   -> api.remove(id)
 */
(function () {
  const DB_NAME = 'loomframe';
  const STORE = 'projects';
  const INDEX_KEY = 'loomframe:index';

  function readIndex() {
    try { return JSON.parse(localStorage.getItem(INDEX_KEY)) || []; } catch (e) { return []; }
  }
  function writeIndex(list) {
    try { localStorage.setItem(INDEX_KEY, JSON.stringify(list)); } catch (e) { /* index is a cache only */ }
  }

  let dbPromise = null;
  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve) => {
      if (!('indexedDB' in window)) return resolve(null);
      let req;
      try { req = indexedDB.open(DB_NAME, 1); } catch (e) { return resolve(null); }
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    });
    return dbPromise;
  }

  function tx(db, mode, fn) {
    return new Promise((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const store = t.objectStore(STORE);
      const req = fn(store);
      t.oncomplete = () => resolve(req && req.result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error || new Error('Transaction aborted'));
    });
  }

  function meta(p) {
    return { id: p.id, name: p.name, width: p.width, height: p.height, frames: p.frameCount,
      updatedAt: p.updatedAt, thumb: p.thumb || null };
  }

  const api = {
    async list() {
      return readIndex().sort((a, b) => b.updatedAt - a.updatedAt);
    },
    async get(id) {
      const db = await openDb();
      if (db) return tx(db, 'readonly', (s) => s.get(id));
      const raw = localStorage.getItem('loomframe:p:' + id);
      return raw ? JSON.parse(raw) : null;
    },
    async save(project) {
      project.updatedAt = Date.now();
      const db = await openDb();
      if (db) await tx(db, 'readwrite', (s) => s.put(project));
      else localStorage.setItem('loomframe:p:' + project.id, JSON.stringify(project));
      const list = readIndex().filter((m) => m.id !== project.id);
      list.push(meta(project));
      writeIndex(list);
      return meta(project);
    },
    async remove(id) {
      const db = await openDb();
      if (db) await tx(db, 'readwrite', (s) => s.delete(id));
      else localStorage.removeItem('loomframe:p:' + id);
      writeIndex(readIndex().filter((m) => m.id !== id));
      return true;
    },
  };

  window.LF = window.LF || {};
  window.LF.api = api;
})();
