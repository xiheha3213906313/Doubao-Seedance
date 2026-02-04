// Storage Management using IndexedDB
const DB_NAME = 'DoubaoSeedanceDB';
const DB_VERSION = 1;
const STORE_NAME = 'appConfig';

let db = null;

const Storage = {
  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = (event) => {
        console.error('Database error:', event.target.error);
        reject(event.target.error);
      };

      request.onsuccess = (event) => {
        db = event.target.result;
        resolve(db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'key' });
        }
      };
    });
  },

  async save(key, value) {
    if (!db) await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put({ key, value });

      request.onsuccess = () => resolve();
      request.onerror = (event) => reject(event.target.error);
    });
  },

  async get(key) {
    if (!db) await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(key);

      request.onsuccess = () => {
        resolve(request.result ? request.result.value : null);
      };
      request.onerror = (event) => reject(event.target.error);
    });
  },

  async exportData() {
    if (!db) await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        const data = {};
        request.result.forEach(item => {
          data[item.key] = item.value;
        });
        resolve(data);
      };
      request.onerror = (event) => reject(event.target.error);
    });
  },

  async importData(data) {
    if (!db) await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      
      let error = null;
      
      Object.keys(data).forEach(key => {
        const request = store.put({ key, value: data[key] });
        request.onerror = (e) => error = e.target.error;
      });

      transaction.oncomplete = () => {
        if (error) reject(error);
        else resolve();
      };
    });
  }
};

// Export to global
window.Storage = Storage;
