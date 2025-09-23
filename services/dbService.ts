import { SavedSession, SessionData } from '../types';

const DB_NAME = 'SOPGeneratorDB';
const DB_VERSION = 1;
const STORE_NAME = 'sessions';

let db: IDBDatabase;

const initDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    if (db) {
      return resolve(db);
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = (event) => {
      console.error('Database error:', request.error);
      reject('Error opening database');
    };

    request.onsuccess = (event) => {
      db = request.result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
    };
  });
};

export const addSession = async (sessionData: SessionData): Promise<number> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const now = new Date();
    const request = store.add({ ...sessionData, createdAt: now, modifiedAt: now });

    request.onsuccess = () => {
      resolve(request.result as number);
    };

    request.onerror = () => {
      console.error('Error adding session:', request.error);
      reject('Could not add session');
    };
  });
};

export const updateSession = async (session: SavedSession): Promise<void> => {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(session);
  
      request.onsuccess = () => {
        resolve();
      };
  
      request.onerror = () => {
        console.error('Error updating session:', request.error);
        reject('Could not update session');
      };
    });
};

export const getAllSessions = async (): Promise<SavedSession[]> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
      // Sort by newest first before returning
      const sortedResult = request.result.sort((a, b) => {
        const dateA = new Date(a.modifiedAt || a.createdAt).getTime();
        const dateB = new Date(b.modifiedAt || b.createdAt).getTime();
        return dateB - dateA;
      });
      resolve(sortedResult);
    };

    request.onerror = () => {
      console.error('Error getting all sessions:', request.error);
      reject('Could not retrieve sessions');
    };
  });
};

export const getSession = async (id: number): Promise<SavedSession | undefined> => {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(id);
  
      request.onsuccess = () => {
        resolve(request.result);
      };
  
      request.onerror = () => {
        console.error(`Error getting session ${id}:`, request.error);
        reject(`Could not retrieve session ${id}`);
      };
    });
  };

export const deleteSession = async (id: number): Promise<void> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);

    request.onsuccess = () => {
      resolve();
    };

    request.onerror = () => {
      console.error('Error deleting session:', request.error);
      reject('Could not delete session');
    };
  });
};