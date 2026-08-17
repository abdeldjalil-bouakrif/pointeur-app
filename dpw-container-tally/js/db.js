/**
 * DP WORLD DJENDJEN - CONTAINER TALLYING PWA
 * Database & Offline Sync Layer (Firebase RTDB + IndexedDB / LocalStorage)
 */

(function(window) {
    'use strict';

    const DB_NAME = 'DPW_Container_DB';
    const DB_VERSION = 1;

    // Default operation models & custom fields
    const DEFAULT_MODEL_CONFIGS = {
        'Débarquement': ['Navire', 'N° Manifeste', 'Température'],
        'Visite Douane': ['Nom Douanier', 'N° Déclaration', 'Résultat Visite'],
        'Embarquement': ['Destination', 'Poids (Tonnes)']
    };

    class DatabaseManager {
        constructor() {
            this.auth = null;
            this.db = null;
            this.currentUser = null;
            this.idb = null;
            
            // In-memory state cache
            this.containers = [];
            this.offlineQueue = [];
            this.modelConfigs = { ...DEFAULT_MODEL_CONFIGS };
            this.modelTemplates = {};
            this.templateMappings = {};

            // Event Listeners registry
            this.listeners = {
                containers: [],
                connection: [],
                models: [],
                templates: [],
                mappings: []
            };

            this.isOnline = navigator.onLine;
            this.isSyncing = false;
        }

        /**
         * Initialize IndexedDB and Firebase SDK
         */
        async init(firebaseConfig) {
            // 1. Initialize IndexedDB
            await this._initIndexedDB();

            // 2. Load Local Data Cache
            await this._loadLocalCache();

            // 3. Initialize Firebase
            if (typeof firebase !== 'undefined' && firebaseConfig) {
                try {
                    if (!firebase.apps.length) {
                        firebase.initializeApp(firebaseConfig);
                    }
                    this.auth = firebase.auth();
                    this.db = firebase.database();

                    try {
                        this.db.setPersistence(true);
                    } catch (e) {
                        console.warn('Firebase persistence warning:', e);
                    }

                    this._setupConnectionListener();
                } catch (err) {
                    console.error('Firebase initialization error:', err);
                }
            }

            // Window online/offline events
            window.addEventListener('online', () => this.syncOfflineQueue());
            window.addEventListener('offline', () => this._emit('connection', false));

            return this;
        }

        // ================= INDEXED DB IMPLEMENTATION =================

        _initIndexedDB() {
            return new Promise((resolve) => {
                if (!window.indexedDB) {
                    console.warn('IndexedDB not supported, falling back to LocalStorage.');
                    resolve(null);
                    return;
                }

                const request = window.indexedDB.open(DB_NAME, DB_VERSION);

                request.onupgradeneeded = (event) => {
                    const db = event.target.result;
                    if (!db.objectStoreNames.contains('containers')) {
                        db.createObjectStore('containers', { keyPath: 'firebaseKey' });
                    }
                    if (!db.objectStoreNames.contains('offline_queue')) {
                        db.createObjectStore('offline_queue', { keyPath: 'firebaseKey' });
                    }
                    if (!db.objectStoreNames.contains('user_settings')) {
                        db.createObjectStore('user_settings', { keyPath: 'key' });
                    }
                };

                request.onsuccess = (event) => {
                    this.idb = event.target.result;
                    resolve(this.idb);
                };

                request.onerror = (event) => {
                    console.error('IndexedDB open error:', event.target.error);
                    resolve(null);
                };
            });
        }

        async _idbPut(storeName, item) {
            if (!this.idb) return false;
            return new Promise((resolve) => {
                try {
                    const tx = this.idb.transaction(storeName, 'readwrite');
                    const store = tx.objectStore(storeName);
                    store.put(item);
                    tx.oncomplete = () => resolve(true);
                    tx.onerror = () => resolve(false);
                } catch (e) {
                    resolve(false);
                }
            });
        }

        async _idbGetAll(storeName) {
            if (!this.idb) return [];
            return new Promise((resolve) => {
                try {
                    const tx = this.idb.transaction(storeName, 'readonly');
                    const store = tx.objectStore(storeName);
                    const req = store.getAll();
                    req.onsuccess = () => resolve(req.result || []);
                    req.onerror = () => resolve([]);
                } catch (e) {
                    resolve([]);
                }
            });
        }

        async _idbDelete(storeName, key) {
            if (!this.idb) return false;
            return new Promise((resolve) => {
                try {
                    const tx = this.idb.transaction(storeName, 'readwrite');
                    const store = tx.objectStore(storeName);
                    store.delete(key);
                    tx.oncomplete = () => resolve(true);
                    tx.onerror = () => resolve(false);
                } catch (e) {
                    resolve(false);
                }
            });
        }

        async _idbClear(storeName) {
            if (!this.idb) return false;
            return new Promise((resolve) => {
                try {
                    const tx = this.idb.transaction(storeName, 'readwrite');
                    const store = tx.objectStore(storeName);
                    store.clear();
                    tx.oncomplete = () => resolve(true);
                    tx.onerror = () => resolve(false);
                } catch (e) {
                    resolve(false);
                }
            });
        }

        // ================= LOCAL CACHE MANAGEMENT =================

        async _loadLocalCache() {
            // Load containers
            let loadedContainers = [];
            if (this.idb) {
                loadedContainers = await this._idbGetAll('containers');
            }
            if (!loadedContainers || loadedContainers.length === 0) {
                try {
                    loadedContainers = JSON.parse(localStorage.getItem('dpw_local_containers')) || [];
                } catch (e) {
                    loadedContainers = [];
                }
            }
            this.containers = loadedContainers.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

            // Load offline queue
            try {
                this.offlineQueue = JSON.parse(localStorage.getItem('dpw_local_queue')) || [];
            } catch (e) {
                this.offlineQueue = [];
            }

            // Load last user scoped data
            const lastUid = localStorage.getItem('dpw_last_uid');
            if (lastUid) {
                this.loadUserData(lastUid);
            }
        }

        async _persistContainersLocal() {
            localStorage.setItem('dpw_local_containers', JSON.stringify(this.containers));
            if (this.idb) {
                await this._idbClear('containers');
                for (const item of this.containers) {
                    await this._idbPut('containers', item);
                }
            }
            this._emit('containers', this.containers);
        }

        async _persistQueueLocal() {
            localStorage.setItem('dpw_local_queue', JSON.stringify(this.offlineQueue));
        }

        // ================= USER-SCOPED DATA (ISOLATED BY UID) =================

        loadUserData(uid) {
            if (!uid) return;
            try {
                this.modelConfigs = JSON.parse(localStorage.getItem('dpw_models_' + uid)) || { ...DEFAULT_MODEL_CONFIGS };
            } catch (e) {
                this.modelConfigs = { ...DEFAULT_MODEL_CONFIGS };
            }

            try {
                this.modelTemplates = JSON.parse(localStorage.getItem('dpw_templates_' + uid)) || {};
            } catch (e) {
                this.modelTemplates = {};
            }

            try {
                this.templateMappings = JSON.parse(localStorage.getItem('dpw_mappings_' + uid)) || {};
            } catch (e) {
                this.templateMappings = {};
            }

            this._emit('models', this.modelConfigs);
            this._emit('templates', this.modelTemplates);
            this._emit('mappings', this.templateMappings);
        }

        // ================= FIREBASE SYNC & EVENT LISTENERS =================

        _setupConnectionListener() {
            if (!this.db) return;

            this.db.ref('.info/connected').on('value', (snap) => {
                const isConnected = snap.val() === true;
                this.isOnline = isConnected;
                this._emit('connection', isConnected);

                if (isConnected) {
                    this.syncOfflineQueue();
                }
            });
        }

        attachUserSync(user) {
            this.currentUser = user;
            if (!user || !user.uid || !this.db) return;

            const uid = user.uid;
            this.loadUserData(uid);

            // Listen to containers node
            this.db.ref('containers').on('value', (snap) => {
                const val = snap.val();
                if (val) {
                    const cloudList = Object.values(val);
                    const map = new Map();
                    this.containers.forEach(c => map.set(c.firebaseKey, c));
                    cloudList.forEach(c => map.set(c.firebaseKey, c));

                    this.containers = Array.from(map.values()).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
                    this._persistContainersLocal();
                } else {
                    this._emit('containers', this.containers);
                }
            });

            // Listen to user modelConfigs
            this.db.ref(`users/${uid}/modelConfigs`).on('value', (snap) => {
                const val = snap.val();
                if (val) {
                    this.modelConfigs = val;
                } else if (Object.keys(this.modelConfigs).length === 0) {
                    this.modelConfigs = { ...DEFAULT_MODEL_CONFIGS };
                }
                localStorage.setItem('dpw_models_' + uid, JSON.stringify(this.modelConfigs));
                this._emit('models', this.modelConfigs);
            });

            // Listen to user modelTemplates
            this.db.ref(`users/${uid}/modelTemplates`).on('value', (snap) => {
                const val = snap.val();
                if (val) {
                    this.modelTemplates = val;
                    localStorage.setItem('dpw_templates_' + uid, JSON.stringify(this.modelTemplates));
                    this._emit('templates', this.modelTemplates);
                }
            });

            // Listen to user templateMappings
            this.db.ref(`users/${uid}/templateMappings`).on('value', (snap) => {
                const val = snap.val();
                if (val) {
                    this.templateMappings = val;
                    localStorage.setItem('dpw_mappings_' + uid, JSON.stringify(this.templateMappings));
                    this._emit('mappings', this.templateMappings);
                }
            });
        }

        // ================= OFFLINE QUEUE SYNC =================

        async syncOfflineQueue() {
            if (this.isSyncing || this.offlineQueue.length === 0 || !this.db || !navigator.onLine) {
                return;
            }

            this.isSyncing = true;
            const pending = [...this.offlineQueue];

            for (const item of pending) {
                try {
                    await this.db.ref('containers/' + item.firebaseKey).set(item);
                    this.offlineQueue = this.offlineQueue.filter(q => q.firebaseKey !== item.firebaseKey);
                    await this._persistQueueLocal();
                } catch (e) {
                    console.warn('Queue item sync paused:', e);
                    break;
                }
            }

            this.isSyncing = false;
        }

        // ================= CRUD OPERATIONS: CONTAINERS =================

        async saveContainer(item) {
            const uniqueKey = item.firebaseKey || ('cnt_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5));
            item.firebaseKey = uniqueKey;
            item.timestamp = item.timestamp || Date.now();

            this.containers.unshift(item);
            await this._persistContainersLocal();

            if (this.db && navigator.onLine) {
                try {
                    await this.db.ref('containers/' + uniqueKey).set(item);
                } catch (e) {
                    this.offlineQueue.push(item);
                    await this._persistQueueLocal();
                }
            } else {
                this.offlineQueue.push(item);
                await this._persistQueueLocal();
            }

            return item;
        }

        async updateContainer(firebaseKey, updatedData) {
            const idx = this.containers.findIndex(c => c.firebaseKey === firebaseKey);
            if (idx !== -1) {
                this.containers[idx] = { ...this.containers[idx], ...updatedData };
                await this._persistContainersLocal();

                if (this.db && navigator.onLine) {
                    try {
                        await this.db.ref('containers/' + firebaseKey).update(this.containers[idx]);
                    } catch (e) {
                        this.offlineQueue.push(this.containers[idx]);
                        await this._persistQueueLocal();
                    }
                } else {
                    this.offlineQueue.push(this.containers[idx]);
                    await this._persistQueueLocal();
                }
            }
            return this.containers[idx];
        }

        async deleteContainer(firebaseKey) {
            this.containers = this.containers.filter(c => c.firebaseKey !== firebaseKey);
            this.offlineQueue = this.offlineQueue.filter(q => q.firebaseKey !== firebaseKey);
            await this._persistContainersLocal();
            await this._persistQueueLocal();

            if (this.db && navigator.onLine) {
                try {
                    await this.db.ref('containers/' + firebaseKey).remove();
                } catch (e) {
                    console.warn('Delete cloud sync warning:', e);
                }
            }
        }

        async updateContainerStage(firebaseKey, newStage) {
            const idx = this.containers.findIndex(c => c.firebaseKey === firebaseKey);
            if (idx !== -1) {
                this.containers[idx].stage = newStage;
                await this._persistContainersLocal();

                if (this.db && navigator.onLine) {
                    try {
                        await this.db.ref('containers/' + firebaseKey).update({ stage: newStage });
                    } catch (e) {
                        this.offlineQueue.push(this.containers[idx]);
                        await this._persistQueueLocal();
                    }
                } else {
                    this.offlineQueue.push(this.containers[idx]);
                    await this._persistQueueLocal();
                }
            }
        }

        async archiveShiftData() {
            if (this.db && navigator.onLine) {
                try {
                    await this.db.ref('containers').remove();
                } catch (e) {
                    console.warn('Archive shift cloud warning:', e);
                }
            }
            this.containers = [];
            this.offlineQueue = [];
            await this._persistContainersLocal();
            await this._persistQueueLocal();
        }

        // ================= USER-SCOPED MODELS & TEMPLATES CRUD =================

        async saveModelConfigs(modelName, fields = []) {
            const uid = this.currentUser ? this.currentUser.uid : 'guest';
            this.modelConfigs[modelName] = fields;
            localStorage.setItem('dpw_models_' + uid, JSON.stringify(this.modelConfigs));

            if (this.db && this.currentUser && this.currentUser.uid) {
                try {
                    await this.db.ref(`users/${uid}/modelConfigs`).set(this.modelConfigs);
                } catch (e) {
                    console.warn('Model config sync error:', e);
                }
            }
            this._emit('models', this.modelConfigs);
        }

        async deleteModel(modelName) {
            const uid = this.currentUser ? this.currentUser.uid : 'guest';
            delete this.modelConfigs[modelName];
            delete this.modelTemplates[modelName];
            delete this.templateMappings[modelName];

            localStorage.setItem('dpw_models_' + uid, JSON.stringify(this.modelConfigs));
            localStorage.setItem('dpw_templates_' + uid, JSON.stringify(this.modelTemplates));
            localStorage.setItem('dpw_mappings_' + uid, JSON.stringify(this.templateMappings));

            if (this.db && this.currentUser && this.currentUser.uid) {
                try {
                    await this.db.ref(`users/${uid}/modelConfigs/${modelName}`).remove();
                    await this.db.ref(`users/${uid}/modelTemplates/${modelName}`).remove();
                    await this.db.ref(`users/${uid}/templateMappings/${modelName}`).remove();
                } catch (e) {
                    console.warn('Delete model sync error:', e);
                }
            }
            this._emit('models', this.modelConfigs);
            this._emit('templates', this.modelTemplates);
            this._emit('mappings', this.templateMappings);
        }

        async saveModelTemplate(modelName, base64Data) {
            const uid = this.currentUser ? this.currentUser.uid : 'guest';
            this.modelTemplates[modelName] = base64Data;
            localStorage.setItem('dpw_templates_' + uid, JSON.stringify(this.modelTemplates));

            if (this.db && this.currentUser && this.currentUser.uid) {
                try {
                    await this.db.ref(`users/${uid}/modelTemplates/${modelName}`).set(base64Data);
                } catch (e) {
                    console.warn('Template save sync error:', e);
                }
            }
            this._emit('templates', this.modelTemplates);
        }

        async deleteModelTemplate(modelName) {
            const uid = this.currentUser ? this.currentUser.uid : 'guest';
            delete this.modelTemplates[modelName];
            delete this.templateMappings[modelName];

            localStorage.setItem('dpw_templates_' + uid, JSON.stringify(this.modelTemplates));
            localStorage.setItem('dpw_mappings_' + uid, JSON.stringify(this.templateMappings));

            if (this.db && this.currentUser && this.currentUser.uid) {
                try {
                    await this.db.ref(`users/${uid}/modelTemplates/${modelName}`).remove();
                    await this.db.ref(`users/${uid}/templateMappings/${modelName}`).remove();
                } catch (e) {
                    console.warn('Delete template sync error:', e);
                }
            }
            this._emit('templates', this.modelTemplates);
            this._emit('mappings', this.templateMappings);
        }

        async saveTemplateMapping(modelName, mappingData) {
            const uid = this.currentUser ? this.currentUser.uid : 'guest';
            this.templateMappings[modelName] = mappingData;
            localStorage.setItem('dpw_mappings_' + uid, JSON.stringify(this.templateMappings));

            if (this.db && this.currentUser && this.currentUser.uid) {
                try {
                    await this.db.ref(`users/${uid}/templateMappings/${modelName}`).set(mappingData);
                } catch (e) {
                    console.warn('Mapping save sync error:', e);
                }
            }
            this._emit('mappings', this.templateMappings);
        }

        // ================= EVENT BUS SYSTEM =================

        on(event, callback) {
            if (this.listeners[event]) {
                this.listeners[event].push(callback);
            }
        }

        _emit(event, data) {
            if (this.listeners[event]) {
                this.listeners[event].forEach(cb => {
                    try { cb(data); } catch (e) { console.error(`Error in DB event '${event}':`, e); }
                });
            }
        }
    }

    // Expose global singleton instance
    window.DPW_DB = new DatabaseManager();

})(window);
