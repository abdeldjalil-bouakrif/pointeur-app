// ==========================================
// FILE: js/db.js
// ==========================================
/**
 * DP WORLD DJENDJEN - CONTAINER TALLYING PWA
 * Database & Offline Sync Layer (Firebase RTDB + IndexedDB / LocalStorage)
 * Enhanced with Persistent Column Mappings & Dynamic Models/Tags
 */

(function(window) {
    'use strict';

    const DB_NAME = 'DPW_Container_DB';
    const DB_VERSION = 2;

    // Default operation models & custom fields
    const DEFAULT_MODEL_CONFIGS = {
        'Débarquement': ['Navire', 'N° Manifeste', 'Température'],
        'Visite Douane': ['Nom Douanier', 'N° Déclaration', 'Résultat Visite'],
        'Embarquement': ['Destination', 'Poids (Tonnes)']
    };

    // Standard container tallying fields
    const STANDARD_FIELDS = [
        { key: 'id', label: 'N° Conteneur (ID)', defaultCol: 'A' },
        { key: 'type', label: 'Type & Taille', defaultCol: 'B' },
        { key: 'loc', label: 'Emplacement Parc', defaultCol: 'C' },
        { key: 'seal', label: 'N° Plomb (Seal)', defaultCol: 'D' },
        { key: 'status', label: 'État (Statut)', defaultCol: 'E' },
        { key: 'stage', label: 'Étape Flux', defaultCol: 'F' },
        { key: 'date', label: 'Date Pointage', defaultCol: 'G' },
        { key: 'time', label: 'Heure Pointage', defaultCol: 'H' },
        { key: 'agent', label: 'Agent Pointeur', defaultCol: 'I' },
        { key: 'notes', label: 'Remarques', defaultCol: 'J' }
    ];

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
         * Strict validation to verify if a container record is valid
         */
        _isValidContainer(c) {
            if (!c || typeof c !== 'object') return false;
            const num = (c.containerNumber !== undefined && c.containerNumber !== null) 
                ? String(c.containerNumber) 
                : ((c.id !== undefined && c.id !== null) ? String(c.id) : '');
            
            const trimmed = num.trim();
            if (!trimmed || trimmed === '' || trimmed === 'undefined' || trimmed === 'null' || trimmed === '[object Object]') {
                return false;
            }
            return true;
        }

        /**
         * Normalize a container object
         */
        _normalizeContainer(c) {
            if (!c) return null;
            const num = String(c.containerNumber || c.id || '').trim();
            const key = c.firebaseKey || ('cnt_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5));
            return {
                ...c,
                containerNumber: num,
                id: num,
                firebaseKey: key,
                stage: c.stage || 'Stock',
                status: c.status || 'Bon état',
                type: c.type || "40' HC",
                loc: (c.loc || '').toUpperCase().trim(),
                seal: (c.seal || 'SL-00000').toUpperCase().trim(),
                notes: c.notes || '',
                timestamp: c.timestamp || Date.now()
            };
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
                    if (!db.objectStoreNames.contains('column_mappings')) {
                        db.createObjectStore('column_mappings', { keyPath: 'modelName' });
                    }
                    if (!db.objectStoreNames.contains('model_configs')) {
                        db.createObjectStore('model_configs', { keyPath: 'modelName' });
                    }
                    if (!db.objectStoreNames.contains('model_templates')) {
                        db.createObjectStore('model_templates', { keyPath: 'modelName' });
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
            if (!this.idb || !this.idb.objectStoreNames.contains(storeName)) return false;
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

        async _idbGet(storeName, key) {
            if (!this.idb || !this.idb.objectStoreNames.contains(storeName)) return null;
            return new Promise((resolve) => {
                try {
                    const tx = this.idb.transaction(storeName, 'readonly');
                    const store = tx.objectStore(storeName);
                    const req = store.get(key);
                    req.onsuccess = () => resolve(req.result || null);
                    req.onerror = () => resolve(null);
                } catch (e) {
                    resolve(null);
                }
            });
        }

        async _idbGetAll(storeName) {
            if (!this.idb || !this.idb.objectStoreNames.contains(storeName)) return [];
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
            if (!this.idb || !this.idb.objectStoreNames.contains(storeName)) return false;
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
            if (!this.idb || !this.idb.objectStoreNames.contains(storeName)) return false;
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
            let loadedContainers = [];

            // 1. Fetch from IndexedDB
            if (this.idb) {
                const idbRecords = await this._idbGetAll('containers');
                if (Array.isArray(idbRecords) && idbRecords.length > 0) {
                    idbRecords.forEach(c => {
                        if (this._isValidContainer(c)) {
                            loadedContainers.push(this._normalizeContainer(c));
                        }
                    });
                }
            }

            // 2. Fetch from LocalStorage fallback
            if (!loadedContainers || loadedContainers.length === 0) {
                try {
                    const rawLocal = JSON.parse(localStorage.getItem('dpw_local_containers')) || [];
                    if (Array.isArray(rawLocal)) {
                        rawLocal.forEach(c => {
                            if (this._isValidContainer(c)) {
                                loadedContainers.push(this._normalizeContainer(c));
                            }
                        });
                    }
                } catch (e) {
                    loadedContainers = [];
                }
            }

            // 3. Strict filter and sort
            this.containers = loadedContainers
                .filter(c => this._isValidContainer(c))
                .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

            // 4. Load offline queue
            try {
                const rawQueue = JSON.parse(localStorage.getItem('dpw_local_queue')) || [];
                this.offlineQueue = (Array.isArray(rawQueue) ? rawQueue : [])
                    .filter(q => this._isValidContainer(q))
                    .map(q => this._normalizeContainer(q));
            } catch (e) {
                this.offlineQueue = [];
            }

            // 5. Load Column Mappings from IndexedDB
            const savedMappings = {};
            if (this.idb && this.idb.objectStoreNames.contains('column_mappings')) {
                const idbMappings = await this._idbGetAll('column_mappings');
                if (idbMappings && idbMappings.length > 0) {
                    idbMappings.forEach(item => {
                        if (item && item.modelName) {
                            savedMappings[item.modelName] = {
                                startRow: item.startRow || 2,
                                columns: item.columns || {},
                                updatedAt: item.updatedAt || Date.now()
                            };
                        }
                    });
                }
            }

            // 6. Load user scoped data
            const lastUid = localStorage.getItem('dpw_last_uid') || 'guest';
            this.loadUserData(lastUid);

            // Merge IndexedDB mappings if present
            if (Object.keys(savedMappings).length > 0) {
                this.templateMappings = { ...this.templateMappings, ...savedMappings };
                this._emit('mappings', this.templateMappings);
            }

            this._emit('containers', this.containers);
        }

        async _persistContainersLocal() {
            this.containers = this.containers
                .filter(c => this._isValidContainer(c))
                .map(c => this._normalizeContainer(c));

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
            this.offlineQueue = this.offlineQueue.filter(q => this._isValidContainer(q));
            localStorage.setItem('dpw_local_queue', JSON.stringify(this.offlineQueue));
        }

        // ================= USER-SCOPED DATA (ISOLATED BY UID) =================

        loadUserData(uid) {
            if (!uid) uid = 'guest';

            // 1. Model Configurations
            try {
                const saved = localStorage.getItem('dpw_models_' + uid);
                this.modelConfigs = saved ? JSON.parse(saved) : { ...DEFAULT_MODEL_CONFIGS };
            } catch (e) {
                this.modelConfigs = { ...DEFAULT_MODEL_CONFIGS };
            }

            // 2. Model Templates
            try {
                this.modelTemplates = JSON.parse(localStorage.getItem('dpw_templates_' + uid)) || {};
            } catch (e) {
                this.modelTemplates = {};
            }

            // 3. Column Mappings
            try {
                this.templateMappings = JSON.parse(localStorage.getItem('dpw_mappings_' + uid)) || {};
            } catch (e) {
                this.templateMappings = {};
            }

            // Ensure all current models have an active column mapping
            Object.keys(this.modelConfigs).forEach(mName => {
                if (!this.templateMappings[mName]) {
                    this.templateMappings[mName] = this.getDefaultMapping(mName);
                }
            });

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
                    const rawCloudList = Object.values(val);
                    const cloudList = rawCloudList
                        .filter(c => this._isValidContainer(c))
                        .map(c => this._normalizeContainer(c));

                    const map = new Map();
                    this.containers.filter(c => this._isValidContainer(c)).forEach(c => map.set(c.firebaseKey, c));
                    cloudList.forEach(c => map.set(c.firebaseKey, c));

                    this.containers = Array.from(map.values())
                        .filter(c => this._isValidContainer(c))
                        .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
                    
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
                    this.templateMappings = { ...this.templateMappings, ...val };
                    localStorage.setItem('dpw_mappings_' + uid, JSON.stringify(this.templateMappings));
                    
                    // Persist to IndexedDB
                    Object.entries(this.templateMappings).forEach(([mName, mapping]) => {
                        this._idbPut('column_mappings', { modelName: mName, ...mapping, updatedAt: Date.now() });
                    });

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
                if (!this._isValidContainer(item)) {
                    this.offlineQueue = this.offlineQueue.filter(q => q.firebaseKey !== item.firebaseKey);
                    await this._persistQueueLocal();
                    continue;
                }

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

        async saveContainer(rawItem) {
            if (!this._isValidContainer(rawItem)) {
                console.warn('Tentative d’enregistrement d’un conteneur invalide/undefined ignorée:', rawItem);
                return null;
            }

            const item = this._normalizeContainer(rawItem);
            const uniqueKey = item.firebaseKey || ('cnt_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5));
            item.firebaseKey = uniqueKey;

            // Prevent duplicate entries
            const existingIdx = this.containers.findIndex(c => c.firebaseKey === uniqueKey || (c.containerNumber && c.containerNumber === item.containerNumber));
            if (existingIdx !== -1) {
                this.containers[existingIdx] = { ...this.containers[existingIdx], ...item };
            } else {
                this.containers.unshift(item);
            }

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
            const idx = this.containers.findIndex(c => c.firebaseKey === firebaseKey || c.id === firebaseKey || c.containerNumber === firebaseKey);
            if (idx !== -1) {
                const merged = { ...this.containers[idx], ...updatedData };
                if (this._isValidContainer(merged)) {
                    this.containers[idx] = this._normalizeContainer(merged);
                    await this._persistContainersLocal();

                    const keyToUse = this.containers[idx].firebaseKey;
                    if (this.db && navigator.onLine && keyToUse) {
                        try {
                            await this.db.ref('containers/' + keyToUse).update(this.containers[idx]);
                        } catch (e) {
                            this.offlineQueue.push(this.containers[idx]);
                            await this._persistQueueLocal();
                        }
                    } else if (keyToUse) {
                        this.offlineQueue.push(this.containers[idx]);
                        await this._persistQueueLocal();
                    }
                    return this.containers[idx];
                }
            }
            return null;
        }

        async deleteContainer(firebaseKey) {
            const targetKey = String(firebaseKey || '').trim();

            this.containers = this.containers.filter(c => {
                if (!this._isValidContainer(c)) return false;
                if (c.firebaseKey === targetKey || c.id === targetKey || c.containerNumber === targetKey) {
                    return false;
                }
                return true;
            });

            this.offlineQueue = this.offlineQueue.filter(q => {
                if (!this._isValidContainer(q)) return false;
                if (q.firebaseKey === targetKey || q.id === targetKey || q.containerNumber === targetKey) {
                    return false;
                }
                return true;
            });

            await this._persistContainersLocal();
            await this._persistQueueLocal();

            if (this.idb) {
                if (targetKey) {
                    await this._idbDelete('containers', targetKey);
                }
                const all = await this._idbGetAll('containers');
                for (const item of all) {
                    if (!this._isValidContainer(item) || item.firebaseKey === targetKey || item.id === targetKey || item.containerNumber === targetKey) {
                        if (item.firebaseKey) {
                            await this._idbDelete('containers', item.firebaseKey);
                        }
                    }
                }
            }

            if (this.db && navigator.onLine && targetKey && targetKey !== 'undefined' && targetKey !== 'null') {
                try {
                    await this.db.ref('containers/' + targetKey).remove();
                } catch (e) {
                    console.warn('Delete cloud sync warning:', e);
                }
            }
        }

        async updateContainerStage(firebaseKey, newStage) {
            const idx = this.containers.findIndex(c => c.firebaseKey === firebaseKey || c.id === firebaseKey || c.containerNumber === firebaseKey);
            if (idx !== -1) {
                this.containers[idx].stage = newStage;
                await this._persistContainersLocal();

                const keyToUse = this.containers[idx].firebaseKey;
                if (this.db && navigator.onLine && keyToUse) {
                    try {
                        await this.db.ref('containers/' + keyToUse).update({ stage: newStage });
                    } catch (e) {
                        this.offlineQueue.push(this.containers[idx]);
                        await this._persistQueueLocal();
                    }
                } else if (keyToUse) {
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

        // ================= DYNAMIC MODELS & CUSTOM FIELD TAGS CRUD =================

        /**
         * Save or update model configuration (fields list)
         */
        async saveModelConfigs(modelName, fields = []) {
            const uid = this.currentUser ? this.currentUser.uid : (localStorage.getItem('dpw_last_uid') || 'guest');
            this.modelConfigs[modelName] = Array.isArray(fields) ? fields : [];
            
            // Persist to LocalStorage & IndexedDB
            localStorage.setItem('dpw_models_' + uid, JSON.stringify(this.modelConfigs));
            await this._idbPut('model_configs', { modelName, fields: this.modelConfigs[modelName] });

            // Ensure baseline column mapping exists
            if (!this.templateMappings[modelName]) {
                await this.saveTemplateMapping(modelName, this.getDefaultMapping(modelName));
            }

            if (this.db && this.currentUser && this.currentUser.uid) {
                try {
                    await this.db.ref(`users/${uid}/modelConfigs`).set(this.modelConfigs);
                } catch (e) {
                    console.warn('Model config sync error:', e);
                }
            }

            this._emit('models', this.modelConfigs);
        }

        /**
         * Delete a model and its associated template & column mappings
         */
        async deleteModel(modelName) {
            const uid = this.currentUser ? this.currentUser.uid : (localStorage.getItem('dpw_last_uid') || 'guest');
            delete this.modelConfigs[modelName];
            delete this.modelTemplates[modelName];
            delete this.templateMappings[modelName];

            localStorage.setItem('dpw_models_' + uid, JSON.stringify(this.modelConfigs));
            localStorage.setItem('dpw_templates_' + uid, JSON.stringify(this.modelTemplates));
            localStorage.setItem('dpw_mappings_' + uid, JSON.stringify(this.templateMappings));

            await this._idbDelete('model_configs', modelName);
            await this._idbDelete('model_templates', modelName);
            await this._idbDelete('column_mappings', modelName);

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

        /**
         * Add a new custom field tag to a specific model
         */
        async addModelTag(modelName, tagName) {
            if (!modelName || !tagName) return;
            const cleanTag = tagName.trim();
            if (!cleanTag) return;

            const fields = this.modelConfigs[modelName] || [];
            if (!fields.includes(cleanTag)) {
                fields.push(cleanTag);
                await this.saveModelConfigs(modelName, fields);

                // Automatically assign next column in mapping if not present
                const currentMapping = this.getTemplateMapping(modelName);
                const colKey = `custom_${cleanTag}`;
                if (!currentMapping.columns || !currentMapping.columns[colKey]) {
                    const letters = this.getColumnLetterList().filter(l => l !== 'None');
                    const usedCols = Object.values(currentMapping.columns || {});
                    const nextCol = letters.find(l => !usedCols.includes(l)) || 'Z';
                    currentMapping.columns = currentMapping.columns || {};
                    currentMapping.columns[colKey] = nextCol;
                    await this.saveTemplateMapping(modelName, currentMapping);
                }
            }
        }

        /**
         * Delete a custom field tag from a specific model
         */
        async deleteModelTag(modelName, tagName) {
            if (!modelName || !tagName) return;
            const fields = (this.modelConfigs[modelName] || []).filter(f => f !== tagName);
            await this.saveModelConfigs(modelName, fields);

            // Clean up from mapping
            const currentMapping = this.getTemplateMapping(modelName);
            const colKey = `custom_${tagName}`;
            if (currentMapping.columns && currentMapping.columns[colKey]) {
                delete currentMapping.columns[colKey];
                await this.saveTemplateMapping(modelName, currentMapping);
            }
        }

        /**
         * Prompt helper to create a new model dynamically
         */
        async promptAddNewModel() {
            const modelName = prompt("Entrez le nom du nouveau modèle de pointage (ex: Visite Scanner, Transfert Quai...) :");
            if (modelName && modelName.trim()) {
                const clean = modelName.trim();
                if (this.modelConfigs[clean]) {
                    if (window.showToast) window.showToast(`Le modèle "${clean}" existe déjà !`, true);
                    return;
                }
                await this.saveModelConfigs(clean, []);
                if (window.showToast) window.showToast(`✓ Modèle "${clean}" créé avec succès !`);
            }
        }

        /**
         * Prompt helper to add a custom field tag to a model
         */
        async promptAddModelTag(modelName) {
            if (!modelName) return;
            const tagName = prompt(`Nom du nouveau champ / tag pour "${modelName}" (ex: Température, Poids, Transporteur...) :`);
            if (tagName && tagName.trim()) {
                await this.addModelTag(modelName, tagName.trim());
                if (window.showToast) window.showToast(`✓ Champ "${tagName.trim()}" ajouté à "${modelName}" !`);
            }
        }

        // ================= TEMPLATES & PERSISTENT COLUMN MAPPINGS =================

        async saveModelTemplate(modelName, base64Data) {
            const uid = this.currentUser ? this.currentUser.uid : (localStorage.getItem('dpw_last_uid') || 'guest');
            this.modelTemplates[modelName] = base64Data;
            localStorage.setItem('dpw_templates_' + uid, JSON.stringify(this.modelTemplates));
            await this._idbPut('model_templates', { modelName, base64: base64Data });

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
            const uid = this.currentUser ? this.currentUser.uid : (localStorage.getItem('dpw_last_uid') || 'guest');
            delete this.modelTemplates[modelName];

            localStorage.setItem('dpw_templates_' + uid, JSON.stringify(this.modelTemplates));
            await this._idbDelete('model_templates', modelName);

            if (this.db && this.currentUser && this.currentUser.uid) {
                try {
                    await this.db.ref(`users/${uid}/modelTemplates/${modelName}`).remove();
                } catch (e) {
                    console.warn('Delete template sync error:', e);
                }
            }
            this._emit('templates', this.modelTemplates);
        }

        /**
         * Save column configuration per model in IndexedDB, LocalStorage, and Cloud
         * Always overwrites with the latest modified configuration
         */
        async saveTemplateMapping(modelName, mappingData) {
            const uid = this.currentUser ? this.currentUser.uid : (localStorage.getItem('dpw_last_uid') || 'guest');
            const sanitized = {
                startRow: parseInt(mappingData.startRow, 10) || 2,
                columns: { ...(mappingData.columns || {}) },
                updatedAt: Date.now()
            };

            // In-memory update
            this.templateMappings[modelName] = sanitized;

            // 1. Persistent IndexedDB Save
            await this._idbPut('column_mappings', {
                modelName: modelName,
                startRow: sanitized.startRow,
                columns: sanitized.columns,
                updatedAt: sanitized.updatedAt
            });
            await this._idbPut('user_settings', {
                key: `mapping_${modelName}`,
                data: sanitized,
                updatedAt: sanitized.updatedAt
            });

            // 2. Persistent LocalStorage Save
            localStorage.setItem('dpw_mappings_' + uid, JSON.stringify(this.templateMappings));
            localStorage.setItem(`dpw_mapping_${modelName}`, JSON.stringify(sanitized));

            // 3. Firebase Cloud Save
            if (this.db && this.currentUser && this.currentUser.uid) {
                try {
                    await this.db.ref(`users/${uid}/templateMappings/${modelName}`).set(sanitized);
                } catch (e) {
                    console.warn('Mapping save cloud sync error:', e);
                }
            }

            this._emit('mappings', this.templateMappings);
            return sanitized;
        }

        /**
         * Load the latest saved configuration for a model, or build intelligent defaults
         */
        getTemplateMapping(modelName) {
            if (this.templateMappings && this.templateMappings[modelName]) {
                return this.templateMappings[modelName];
            }

            // Fallback to local storage
            try {
                const saved = localStorage.getItem(`dpw_mapping_${modelName}`);
                if (saved) {
                    const parsed = JSON.parse(saved);
                    this.templateMappings[modelName] = parsed;
                    return parsed;
                }
            } catch (e) {}

            return this.getDefaultMapping(modelName);
        }

        /**
         * Generates standard default column mapping for standard + custom fields
         */
        getDefaultMapping(modelName) {
            const letters = this.getColumnLetterList().filter(l => l !== 'None');
            const columns = {
                id: 'A',
                type: 'B',
                loc: 'C',
                seal: 'D',
                status: 'E',
                stage: 'F',
                date: 'G',
                time: 'H',
                agent: 'I',
                notes: 'J'
            };

            const customFields = (this.modelConfigs && this.modelConfigs[modelName]) ? this.modelConfigs[modelName] : [];
            customFields.forEach((cf, idx) => {
                const colLetter = letters[10 + idx] || letters[letters.length - 1];
                columns[`custom_${cf}`] = colLetter;
            });

            return {
                startRow: 2,
                columns: columns,
                updatedAt: Date.now()
            };
        }

        /**
         * List of Excel column letters (None, A to Z, AA to AZ)
         */
        getColumnLetterList() {
            const cols = ['None'];
            for (let i = 0; i < 26; i++) {
                cols.push(String.fromCharCode(65 + i));
            }
            for (let i = 0; i < 26; i++) {
                cols.push('A' + String.fromCharCode(65 + i));
            }
            return cols;
        }

        getStandardFields() {
            return [...STANDARD_FIELDS];
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
