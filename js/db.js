/**
 * DP WORLD DJENDJEN - CONTAINER TALLYING PWA
 * Database & Offline Sync Layer
 * Enhanced Architecture: IndexedDB Engine (Zero localStorage for containers/yard records),
 * Multi-User Data Isolation (userId indexing), PBKDF2 Cryptographic Security & RBAC
 */

(function(window) {
    'use strict';

    const DB_NAME = 'DPW_Container_DB';
    const DB_VERSION = 3;

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

    // Role-Based Access Control (RBAC) definitions
    const ROLES = {
        ADMIN: 'Admin',
        POINTEUR: 'Pointeur'
    };

    const ROLE_PERMISSIONS = {
        [ROLES.ADMIN]: [
            'container:create',
            'container:read',
            'container:update',
            'container:delete',
            'stage:update',
            'yard:view',
            'yard:assign',
            'yard:move',
            'yard:remove',
            'model:create',
            'model:update',
            'model:delete',
            'template:upload',
            'template:delete',
            'mapping:update',
            'shift:archive',
            'export:excel',
            'users:manage'
        ],
        [ROLES.POINTEUR]: [
            'container:create',
            'container:read',
            'container:update',
            'stage:update',
            'yard:view',
            'yard:assign',
            'yard:move',
            'model:create',
            'template:upload',
            'mapping:update',
            'export:excel'
        ]
    };

    // ================= 🔐 CRYPTOGRAPHIC UTILITIES (WEB CRYPTO API) =================
    const CryptoService = {
        /**
         * Converts ArrayBuffer to Hex String
         */
        bufToHex(buffer) {
            return Array.from(new Uint8Array(buffer))
                .map(b => b.toString(16).padStart(2, '0'))
                .join('');
        },

        /**
         * Converts Hex String to Uint8Array
         */
        hexToBuf(hex) {
            const bytes = new Uint8Array(Math.ceil(hex.length / 2));
            for (let i = 0; i < bytes.length; i++) {
                bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
            }
            return bytes;
        },

        /**
         * Generate a cryptographically secure random salt (16 bytes)
         */
        generateSalt() {
            const salt = new Uint8Array(16);
            if (window.crypto && window.crypto.getRandomValues) {
                window.crypto.getRandomValues(salt);
            } else {
                for (let i = 0; i < 16; i++) {
                    salt[i] = Math.floor(Math.random() * 256);
                }
            }
            return this.bufToHex(salt);
        },

        /**
         * Hash password with PBKDF2 (SHA-256, 100,000 iterations)
         */
        async hashPassword(password, saltHex = null) {
            const salt = saltHex ? this.hexToBuf(saltHex) : this.hexToBuf(this.generateSalt());
            const usedSaltHex = saltHex || this.bufToHex(salt);

            if (window.crypto && window.crypto.subtle) {
                try {
                    const enc = new TextEncoder();
                    const keyMaterial = await window.crypto.subtle.importKey(
                        'raw',
                        enc.encode(password),
                        { name: 'PBKDF2' },
                        false,
                        ['deriveBits', 'deriveKey']
                    );

                    const derivedBits = await window.crypto.subtle.deriveBits(
                        {
                            name: 'PBKDF2',
                            salt: salt,
                            iterations: 100000,
                            hash: 'SHA-256'
                        },
                        keyMaterial,
                        256
                    );

                    return {
                        hash: this.bufToHex(derivedBits),
                        salt: usedSaltHex
                    };
                } catch (e) {
                    console.warn('WebCrypto deriveBits failed, using fallback hash:', e);
                }
            }

            // Fallback lightweight hash for non-secure contexts
            let hash = 0;
            const str = password + ':' + usedSaltHex;
            for (let i = 0; i < str.length; i++) {
                const char = str.charCodeAt(i);
                hash = ((hash << 5) - hash) + char;
                hash |= 0;
            }
            return {
                hash: Math.abs(hash).toString(16).padStart(32, '0'),
                salt: usedSaltHex
            };
        },

        /**
         * Verify candidate password against stored hash and salt
         */
        async verifyPassword(candidatePassword, storedHash, storedSalt) {
            if (!candidatePassword || !storedHash || !storedSalt) return false;
            const result = await this.hashPassword(candidatePassword, storedSalt);
            return result.hash === storedHash;
        },

        /**
         * Generate a unique ID with custom prefix
         */
        generateId(prefix = 'id') {
            const rand = Math.random().toString(36).substring(2, 8);
            return `${prefix}_${Date.now()}_${rand}`;
        }
    };

    // ================= 🏛️ DATABASE MANAGER =================
    class DatabaseManager {
        constructor() {
            this.auth = null;
            this.db = null;
            this.idb = null;

            // Active User & RBAC state
            this.currentUser = null;
            this.currentRole = ROLES.POINTEUR;

            // In-memory state cache (strictly user-isolated)
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
                mappings: [],
                user: [],
                auth: []
            };

            this.isOnline = navigator.onLine;
            this.isSyncing = false;
            this._dbReadyPromise = null;
        }

        // ================= 🚀 INITIALIZATION =================

        async init(firebaseConfig) {
            // 1. Initialize IndexedDB Engine
            await this._ensureIDB();

            // 2. Load Active Session if present
            await this._initActiveSession();

            // 3. Initialize Firebase SDK if available
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
            window.addEventListener('online', () => {
                this.isOnline = true;
                this._emit('connection', true);
                this.syncOfflineQueue();
            });

            window.addEventListener('offline', () => {
                this.isOnline = false;
                this._emit('connection', false);
            });

            return this;
        }

        // ================= 🗄️ INDEXEDDB ENGINE (PROMISE-BASED) =================

        _ensureIDB() {
            if (!this._dbReadyPromise) {
                this._dbReadyPromise = new Promise((resolve, reject) => {
                    if (!window.indexedDB) {
                        console.error('CRITICAL: IndexedDB is not supported on this device/browser.');
                        resolve(null);
                        return;
                    }

                    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

                    request.onupgradeneeded = (event) => {
                        const db = event.target.result;

                        // 1. Containers Store (User-scoped with indices)
                        if (!db.objectStoreNames.contains('containers')) {
                            const store = db.createObjectStore('containers', { keyPath: 'firebaseKey' });
                            store.createIndex('idx_userId', 'userId', { unique: false });
                            store.createIndex('idx_containerNumber', 'containerNumber', { unique: false });
                            store.createIndex('idx_stage', 'stage', { unique: false });
                            store.createIndex('idx_status', 'status', { unique: false });
                            store.createIndex('idx_timestamp', 'timestamp', { unique: false });
                            store.createIndex('idx_user_container', ['userId', 'containerNumber'], { unique: false });
                        }

                        // 2. Yard Slots Store (Multi-user yard matrix persistence)
                        if (!db.objectStoreNames.contains('yard_slots')) {
                            const store = db.createObjectStore('yard_slots', { keyPath: 'slotId' });
                            store.createIndex('idx_userId', 'userId', { unique: false });
                            store.createIndex('idx_loc', 'loc', { unique: false });
                        }

                        // 3. Offline Queue Store (Guaranteed offline mutation queue)
                        if (!db.objectStoreNames.contains('offline_queue')) {
                            const store = db.createObjectStore('offline_queue', { keyPath: 'queueId' });
                            store.createIndex('idx_userId', 'userId', { unique: false });
                            store.createIndex('idx_timestamp', 'timestamp', { unique: false });
                        }

                        // 4. Model Configurations Store
                        if (!db.objectStoreNames.contains('model_configs')) {
                            const store = db.createObjectStore('model_configs', { keyPath: 'configId' });
                            store.createIndex('idx_userId', 'userId', { unique: false });
                            store.createIndex('idx_modelName', 'modelName', { unique: false });
                        }

                        // 5. Model Templates Store (Base64 Excel templates)
                        if (!db.objectStoreNames.contains('model_templates')) {
                            const store = db.createObjectStore('model_templates', { keyPath: 'templateId' });
                            store.createIndex('idx_userId', 'userId', { unique: false });
                            store.createIndex('idx_modelName', 'modelName', { unique: false });
                        }

                        // 6. Column Mappings Store
                        if (!db.objectStoreNames.contains('column_mappings')) {
                            const store = db.createObjectStore('column_mappings', { keyPath: 'mappingId' });
                            store.createIndex('idx_userId', 'userId', { unique: false });
                            store.createIndex('idx_modelName', 'modelName', { unique: false });
                        }

                        // 7. Users Store (Secure Credentials & Roles)
                        if (!db.objectStoreNames.contains('users')) {
                            const store = db.createObjectStore('users', { keyPath: 'uid' });
                            store.createIndex('idx_email', 'email', { unique: true });
                            store.createIndex('idx_role', 'role', { unique: false });
                        }

                        // 8. User Settings / Active Session Store
                        if (!db.objectStoreNames.contains('user_settings')) {
                            const store = db.createObjectStore('user_settings', { keyPath: 'settingId' });
                            store.createIndex('idx_userId', 'userId', { unique: false });
                            store.createIndex('idx_key', 'key', { unique: false });
                        }

                        // 9. Audit Logs Store
                        if (!db.objectStoreNames.contains('audit_logs')) {
                            const store = db.createObjectStore('audit_logs', { keyPath: 'id', autoIncrement: true });
                            store.createIndex('idx_userId', 'userId', { unique: false });
                            store.createIndex('idx_timestamp', 'timestamp', { unique: false });
                        }
                    };

                    request.onsuccess = (event) => {
                        this.idb = event.target.result;
                        resolve(this.idb);
                    };

                    request.onerror = (event) => {
                        console.error('IndexedDB open error:', event.target.error);
                        reject(event.target.error);
                    };
                });
            }
            return this._dbReadyPromise;
        }

        async _idbPut(storeName, item) {
            await this._ensureIDB();
            if (!this.idb || !this.idb.objectStoreNames.contains(storeName)) return false;
            return new Promise((resolve) => {
                try {
                    const tx = this.idb.transaction(storeName, 'readwrite');
                    const store = tx.objectStore(storeName);
                    store.put(item);
                    tx.oncomplete = () => resolve(true);
                    tx.onerror = (err) => {
                        console.warn(`IDB put error in ${storeName}:`, err);
                        resolve(false);
                    };
                } catch (e) {
                    console.warn(`IDB put exception in ${storeName}:`, e);
                    resolve(false);
                }
            });
        }

        async _idbGet(storeName, key) {
            await this._ensureIDB();
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
            await this._ensureIDB();
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

        async _idbGetAllByIndex(storeName, indexName, queryValue) {
            await this._ensureIDB();
            if (!this.idb || !this.idb.objectStoreNames.contains(storeName)) return [];
            return new Promise((resolve) => {
                try {
                    const tx = this.idb.transaction(storeName, 'readonly');
                    const store = tx.objectStore(storeName);
                    if (!store.indexNames.contains(indexName)) {
                        resolve([]);
                        return;
                    }
                    const index = store.index(indexName);
                    const keyRange = queryValue !== undefined ? IDBKeyRange.only(queryValue) : null;
                    const req = keyRange ? index.getAll(keyRange) : index.getAll();
                    req.onsuccess = () => resolve(req.result || []);
                    req.onerror = () => resolve([]);
                } catch (e) {
                    console.warn(`IDB query by index error in ${storeName}.${indexName}:`, e);
                    resolve([]);
                }
            });
        }

        async _idbDelete(storeName, key) {
            await this._ensureIDB();
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

        async _idbDeleteByIndex(storeName, indexName, queryValue) {
            await this._ensureIDB();
            if (!this.idb || !this.idb.objectStoreNames.contains(storeName)) return 0;
            return new Promise((resolve) => {
                try {
                    const tx = this.idb.transaction(storeName, 'readwrite');
                    const store = tx.objectStore(storeName);
                    const index = store.index(indexName);
                    const req = index.openCursor(IDBKeyRange.only(queryValue));
                    let count = 0;
                    req.onsuccess = (event) => {
                        const cursor = event.target.result;
                        if (cursor) {
                            cursor.delete();
                            count++;
                            cursor.continue();
                        } else {
                            resolve(count);
                        }
                    };
                    req.onerror = () => resolve(count);
                } catch (e) {
                    resolve(0);
                }
            });
        }

        async _idbClear(storeName) {
            await this._ensureIDB();
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

        // ================= 👤 AUTHENTICATION, CREDENTIAL SECURITY & RBAC =================

        getCurrentUserId() {
            return (this.currentUser && this.currentUser.uid) ? this.currentUser.uid : 'guest_session';
        }

        getUserRole() {
            return this.currentRole || ROLES.POINTEUR;
        }

        isAdmin() {
            return this.getUserRole() === ROLES.ADMIN;
        }

        /**
         * Verify if the active user possesses the requested permission
         */
        hasPermission(permission) {
            const role = this.getUserRole();
            const allowedPermissions = ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS[ROLES.POINTEUR];
            return allowedPermissions.includes(permission);
        }

        /**
         * Guard sensitive actions and throw security error if unauthorized
         */
        requirePermission(permission) {
            if (!this.hasPermission(permission)) {
                const err = new Error(`Accès refusé : Le rôle '${this.getUserRole()}' n'a pas la permission requise ('${permission}').`);
                err.code = 'PERMISSION_DENIED';
                throw err;
            }
        }

        /**
         * Initialize active session from IndexedDB
         */
        async _initActiveSession() {
            const session = await this._idbGet('user_settings', 'active_session');
            if (session && session.user && session.user.uid) {
                this.currentUser = session.user;
                this.currentRole = session.user.role || ROLES.POINTEUR;
                await this.loadUserData(this.currentUser.uid);
                this._emit('user', this.currentUser);
                this._emit('auth', { authenticated: true, user: this.currentUser });
            } else {
                this.clearSession();
            }
        }

        /**
         * Register a new user with encrypted password (PBKDF2) and assigned role
         */
        async registerUser(email, password, role = ROLES.POINTEUR, displayName = '') {
            const cleanEmail = String(email || '').trim().toLowerCase();
            if (!cleanEmail || !cleanEmail.includes('@')) {
                throw new Error("Adresse email invalide.");
            }
            if (!password || password.length < 6) {
                throw new Error("Le mot de passe doit contenir au moins 6 caractères.");
            }

            const cleanRole = (role === ROLES.ADMIN) ? ROLES.ADMIN : ROLES.POINTEUR;

            // Check if user exists in local IndexedDB
            const existing = await this._idbGetAllByIndex('users', 'idx_email', cleanEmail);
            if (existing && existing.length > 0) {
                throw new Error("Un utilisateur avec cette adresse email existe déjà.");
            }

            // Hash password with cryptographically secure PBKDF2
            const { hash, salt } = await CryptoService.hashPassword(password);
            const uid = CryptoService.generateId('usr');

            const newUser = {
                uid,
                email: cleanEmail,
                displayName: displayName || cleanEmail.split('@')[0],
                role: cleanRole,
                passwordHash: hash,
                salt: salt,
                createdAt: Date.now(),
                lastLogin: Date.now()
            };

            await this._idbPut('users', newUser);

            // Set as active session
            const userProfile = {
                uid: newUser.uid,
                email: newUser.email,
                displayName: newUser.displayName,
                role: newUser.role
            };

            this.currentUser = userProfile;
            this.currentRole = cleanRole;

            await this._idbPut('user_settings', {
                settingId: 'active_session',
                userId: uid,
                key: 'active_session',
                user: userProfile,
                updatedAt: Date.now()
            });

            await this.loadUserData(uid);
            this._logAudit('user:register', `User ${cleanEmail} registered with role ${cleanRole}`);

            this._emit('user', this.currentUser);
            this._emit('auth', { authenticated: true, user: this.currentUser });
            return userProfile;
        }

        /**
         * Login user verifying PBKDF2 hash against local IndexedDB vault or Firebase
         */
        async loginUser(email, password) {
            const cleanEmail = String(email || '').trim().toLowerCase();
            if (!cleanEmail || !password) {
                throw new Error("Veuillez renseigner votre email et mot de passe.");
            }

            // 1. Search in local IndexedDB users vault
            const users = await this._idbGetAllByIndex('users', 'idx_email', cleanEmail);
            if (users && users.length > 0) {
                const user = users[0];
                const isValid = await CryptoService.verifyPassword(password, user.passwordHash, user.salt);
                if (!isValid) {
                    throw new Error("Mot de passe incorrect.");
                }

                user.lastLogin = Date.now();
                await this._idbPut('users', user);

                const userProfile = {
                    uid: user.uid,
                    email: user.email,
                    displayName: user.displayName || user.email.split('@')[0],
                    role: user.role || ROLES.POINTEUR
                };

                this.currentUser = userProfile;
                this.currentRole = userProfile.role;

                await this._idbPut('user_settings', {
                    settingId: 'active_session',
                    userId: user.uid,
                    key: 'active_session',
                    user: userProfile,
                    updatedAt: Date.now()
                });

                await this.loadUserData(user.uid);
                this._logAudit('user:login', `User ${cleanEmail} logged in`);

                this._emit('user', this.currentUser);
                this._emit('auth', { authenticated: true, user: this.currentUser });
                return userProfile;
            }

            // 2. Default Bootstrap Admin / Pointeur account provisioning on first run
            if (cleanEmail === 'admin@dpw.dz' && password === 'admin123') {
                return await this.registerUser('admin@dpw.dz', 'admin123', ROLES.ADMIN, 'Directeur Terminal');
            }
            if (cleanEmail === 'pointeur@dpw.dz' && password === 'pointeur123') {
                return await this.registerUser('pointeur@dpw.dz', 'pointeur123', ROLES.POINTEUR, 'Pointeur Principal');
            }

            throw new Error("Compte introuvable. Veuillez créer un compte.");
        }

        /**
         * Logout user and immediately purge in-memory state to prevent any data leakage
         */
        async logoutUser() {
            const prevEmail = this.currentUser ? this.currentUser.email : 'Unknown';
            this._logAudit('user:logout', `User ${prevEmail} logged out`);

            // Clear session in IndexedDB
            await this._idbDelete('user_settings', 'active_session');

            // Detach Firebase cloud listeners
            if (this.db && this.currentUser && this.currentUser.uid) {
                try {
                    this.db.ref(`users/${this.currentUser.uid}/modelConfigs`).off();
                    this.db.ref(`users/${this.currentUser.uid}/modelTemplates`).off();
                    this.db.ref(`users/${this.currentUser.uid}/templateMappings`).off();
                    this.db.ref(`users/${this.currentUser.uid}/containers`).off();
                } catch (e) {}
            }

            // Completely purge in-memory state
            this.clearSession();

            // Firebase auth sign out
            if (this.auth) {
                try {
                    await this.auth.signOut();
                } catch (e) {}
            }

            this._emit('auth', { authenticated: false, user: null });
            return true;
        }

        /**
         * Immediate memory cleardown
         */
        clearSession() {
            this.currentUser = null;
            this.currentRole = ROLES.POINTEUR;
            this.containers = [];
            this.offlineQueue = [];
            this.modelConfigs = { ...DEFAULT_MODEL_CONFIGS };
            this.modelTemplates = {};
            this.templateMappings = {};

            this._emit('containers', []);
            this._emit('models', this.modelConfigs);
            this._emit('templates', {});
            this._emit('mappings', {});
            this._emit('user', null);
        }

        async _logAudit(action, details) {
            try {
                await this._idbPut('audit_logs', {
                    userId: this.getCurrentUserId(),
                    role: this.getUserRole(),
                    action,
                    details,
                    timestamp: Date.now()
                });
            } catch (e) {}
        }

        // ================= 📦 DATA NORMALIZATION & VALIDATION =================

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

        _normalizeContainer(c) {
            if (!c) return null;
            const num = String(c.containerNumber || c.id || '').trim().toUpperCase();
            const key = c.firebaseKey || ('cnt_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5));
            const uid = c.userId || this.getCurrentUserId();

            return {
                ...c,
                userId: uid,
                containerNumber: num,
                id: num,
                firebaseKey: key,
                stage: c.stage || 'Stock',
                status: c.status || 'Bon état',
                type: c.type || "40' HC",
                loc: (c.loc || '').toUpperCase().trim(),
                seal: (c.seal || 'SL-00000').toUpperCase().trim(),
                notes: c.notes || '',
                damagePhoto: c.damagePhoto || null,
                customData: c.customData || {},
                timestamp: c.timestamp || Date.now()
            };
        }

        // ================= 📂 USER-SCOPED DATA LOADER =================

        async loadUserData(uid) {
            if (!uid) uid = this.getCurrentUserId();

            // 1. Fetch User Containers from IndexedDB
            const records = await this._idbGetAllByIndex('containers', 'idx_userId', uid);
            this.containers = (records || [])
                .filter(c => this._isValidContainer(c))
                .map(c => this._normalizeContainer(c))
                .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

            // 2. Fetch User Offline Queue
            const queueRecords = await this._idbGetAllByIndex('offline_queue', 'idx_userId', uid);
            this.offlineQueue = (queueRecords || [])
                .filter(q => this._isValidContainer(q))
                .map(q => this._normalizeContainer(q));

            // 3. Fetch User Model Configurations
            const savedModelRecords = await this._idbGetAllByIndex('model_configs', 'idx_userId', uid);
            this.modelConfigs = { ...DEFAULT_MODEL_CONFIGS };
            if (savedModelRecords && savedModelRecords.length > 0) {
                savedModelRecords.forEach(rec => {
                    if (rec && rec.modelName) {
                        this.modelConfigs[rec.modelName] = rec.fields || [];
                    }
                });
            }

            // 4. Fetch User Templates
            const templateRecords = await this._idbGetAllByIndex('model_templates', 'idx_userId', uid);
            this.modelTemplates = {};
            if (templateRecords && templateRecords.length > 0) {
                templateRecords.forEach(rec => {
                    if (rec && rec.modelName && rec.base64) {
                        this.modelTemplates[rec.modelName] = rec.base64;
                    }
                });
            }

            // 5. Fetch User Column Mappings
            const mappingRecords = await this._idbGetAllByIndex('column_mappings', 'idx_userId', uid);
            this.templateMappings = {};
            if (mappingRecords && mappingRecords.length > 0) {
                mappingRecords.forEach(rec => {
                    if (rec && rec.modelName) {
                        this.templateMappings[rec.modelName] = {
                            startRow: rec.startRow || 2,
                            columns: rec.columns || {},
                            updatedAt: rec.updatedAt || Date.now()
                        };
                    }
                });
            }

            // Ensure baseline column mapping exists for every active model
            Object.keys(this.modelConfigs).forEach(mName => {
                if (!this.templateMappings[mName]) {
                    this.templateMappings[mName] = this.getDefaultMapping(mName);
                }
            });

            this._emit('containers', this.containers);
            this._emit('models', this.modelConfigs);
            this._emit('templates', this.modelTemplates);
            this._emit('mappings', this.templateMappings);
        }

        // ================= 🔄 REALTIME FIREBASE SYNC =================

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
            if (!user || !user.uid) return;

            this.currentUser = {
                uid: user.uid,
                email: user.email,
                displayName: user.displayName || user.email.split('@')[0],
                role: this.currentRole || ROLES.POINTEUR
            };

            const uid = user.uid;
            this.loadUserData(uid);

            if (!this.db) return;

            // Listen to User Scoped Containers Node
            this.db.ref(`users/${uid}/containers`).on('value', async (snap) => {
                const val = snap.val();
                if (val) {
                    const rawCloudList = Object.values(val);
                    const cloudList = rawCloudList
                        .filter(c => this._isValidContainer(c))
                        .map(c => this._normalizeContainer({ ...c, userId: uid }));

                    const map = new Map();
                    this.containers.filter(c => this._isValidContainer(c)).forEach(c => map.set(c.firebaseKey, c));
                    cloudList.forEach(c => map.set(c.firebaseKey, c));

                    this.containers = Array.from(map.values())
                        .filter(c => this._isValidContainer(c))
                        .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

                    // Persist to IndexedDB
                    for (const item of this.containers) {
                        await this._idbPut('containers', item);
                    }

                    this._emit('containers', this.containers);
                }
            });

            // Listen to User Model Configs
            this.db.ref(`users/${uid}/modelConfigs`).on('value', async (snap) => {
                const val = snap.val();
                if (val) {
                    this.modelConfigs = { ...DEFAULT_MODEL_CONFIGS, ...val };
                    for (const [mName, fields] of Object.entries(this.modelConfigs)) {
                        await this._idbPut('model_configs', {
                            configId: `${uid}_${mName}`,
                            userId: uid,
                            modelName: mName,
                            fields: fields,
                            updatedAt: Date.now()
                        });
                    }
                    this._emit('models', this.modelConfigs);
                }
            });

            // Listen to User Templates
            this.db.ref(`users/${uid}/modelTemplates`).on('value', async (snap) => {
                const val = snap.val();
                if (val) {
                    this.modelTemplates = val;
                    for (const [mName, base64] of Object.entries(this.modelTemplates)) {
                        await this._idbPut('model_templates', {
                            templateId: `${uid}_${mName}`,
                            userId: uid,
                            modelName: mName,
                            base64: base64,
                            updatedAt: Date.now()
                        });
                    }
                    this._emit('templates', this.modelTemplates);
                }
            });

            // Listen to User Column Mappings
            this.db.ref(`users/${uid}/templateMappings`).on('value', async (snap) => {
                const val = snap.val();
                if (val) {
                    this.templateMappings = { ...this.templateMappings, ...val };
                    for (const [mName, mapping] of Object.entries(this.templateMappings)) {
                        await this._idbPut('column_mappings', {
                            mappingId: `${uid}_${mName}`,
                            userId: uid,
                            modelName: mName,
                            ...mapping,
                            updatedAt: Date.now()
                        });
                    }
                    this._emit('mappings', this.templateMappings);
                }
            });
        }

        // ================= ⏳ OFFLINE QUEUE SYNC =================

        async syncOfflineQueue() {
            if (this.isSyncing || this.offlineQueue.length === 0 || !this.db || !navigator.onLine) {
                return;
            }

            this.isSyncing = true;
            const uid = this.getCurrentUserId();
            const pending = [...this.offlineQueue];

            for (const item of pending) {
                if (!this._isValidContainer(item)) {
                    this.offlineQueue = this.offlineQueue.filter(q => q.firebaseKey !== item.firebaseKey);
                    await this._idbDelete('offline_queue', item.queueId || `${uid}_${item.firebaseKey}`);
                    continue;
                }

                try {
                    const queueKey = item.queueId || `${uid}_${item.firebaseKey}`;
                    await this.db.ref(`users/${uid}/containers/${item.firebaseKey}`).set(item);
                    
                    this.offlineQueue = this.offlineQueue.filter(q => q.firebaseKey !== item.firebaseKey);
                    await this._idbDelete('offline_queue', queueKey);
                } catch (e) {
                    console.warn('Queue sync paused on network error:', e);
                    break;
                }
            }

            this.isSyncing = false;
        }

        // ================= 🚢 CRUD OPERATIONS: CONTAINERS =================

        async saveContainer(rawItem) {
            this.requirePermission('container:create');

            if (!this._isValidContainer(rawItem)) {
                console.warn('Invalid container rejected:', rawItem);
                return null;
            }

            const uid = this.getCurrentUserId();
            const item = this._normalizeContainer({ ...rawItem, userId: uid });
            const uniqueKey = item.firebaseKey || ('cnt_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5));
            item.firebaseKey = uniqueKey;
            item.queueId = `${uid}_${uniqueKey}`;

            // Upsert in local memory
            const existingIdx = this.containers.findIndex(c => c.firebaseKey === uniqueKey || (c.containerNumber && c.containerNumber === item.containerNumber));
            if (existingIdx !== -1) {
                this.containers[existingIdx] = { ...this.containers[existingIdx], ...item };
            } else {
                this.containers.unshift(item);
            }

            // Persist to IndexedDB
            await this._idbPut('containers', item);

            // Cloud or offline queue
            if (this.db && navigator.onLine) {
                try {
                    await this.db.ref(`users/${uid}/containers/${uniqueKey}`).set(item);
                } catch (e) {
                    this.offlineQueue.push(item);
                    await this._idbPut('offline_queue', item);
                }
            } else {
                this.offlineQueue.push(item);
                await this._idbPut('offline_queue', item);
            }

            this._logAudit('container:create', `Container ${item.containerNumber} (${item.loc}) tally recorded`);
            this._emit('containers', this.containers);
            return item;
        }

        async updateContainer(firebaseKey, updatedData) {
            this.requirePermission('container:update');

            const idx = this.containers.findIndex(c => c.firebaseKey === firebaseKey || c.id === firebaseKey || c.containerNumber === firebaseKey);
            if (idx !== -1) {
                const uid = this.getCurrentUserId();
                const merged = { ...this.containers[idx], ...updatedData, userId: uid, timestamp: Date.now() };

                if (this._isValidContainer(merged)) {
                    const normalized = this._normalizeContainer(merged);
                    normalized.queueId = `${uid}_${normalized.firebaseKey}`;
                    this.containers[idx] = normalized;

                    // Persist to IndexedDB
                    await this._idbPut('containers', normalized);

                    // Cloud or offline queue
                    if (this.db && navigator.onLine) {
                        try {
                            await this.db.ref(`users/${uid}/containers/${normalized.firebaseKey}`).update(normalized);
                        } catch (e) {
                            this.offlineQueue.push(normalized);
                            await this._idbPut('offline_queue', normalized);
                        }
                    } else {
                        this.offlineQueue.push(normalized);
                        await this._idbPut('offline_queue', normalized);
                    }

                    this._logAudit('container:update', `Container ${normalized.containerNumber} updated`);
                    this._emit('containers', this.containers);
                    return this.containers[idx];
                }
            }
            return null;
        }

        async deleteContainer(firebaseKey) {
            // Strict RBAC check: only Admin can delete records
            this.requirePermission('container:delete');

            const targetKey = String(firebaseKey || '').trim();
            const uid = this.getCurrentUserId();

            const targetItem = this.containers.find(c => c.firebaseKey === targetKey || c.id === targetKey || c.containerNumber === targetKey);
            const containerNum = targetItem ? targetItem.containerNumber : targetKey;

            this.containers = this.containers.filter(c => {
                if (!this._isValidContainer(c)) return false;
                return !(c.firebaseKey === targetKey || c.id === targetKey || c.containerNumber === targetKey);
            });

            this.offlineQueue = this.offlineQueue.filter(q => {
                return !(q.firebaseKey === targetKey || q.id === targetKey || q.containerNumber === targetKey);
            });

            // Delete from IndexedDB
            await this._idbDelete('containers', targetKey);
            await this._idbDelete('offline_queue', `${uid}_${targetKey}`);

            // Delete from Firebase Cloud
            if (this.db && navigator.onLine && targetKey) {
                try {
                    await this.db.ref(`users/${uid}/containers/${targetKey}`).remove();
                } catch (e) {
                    console.warn('Cloud delete error:', e);
                }
            }

            this._logAudit('container:delete', `Container ${containerNum} deleted by Admin`);
            this._emit('containers', this.containers);
            return true;
        }

        async updateContainerStage(firebaseKey, newStage) {
            this.requirePermission('stage:update');
            return await this.updateContainer(firebaseKey, { stage: newStage });
        }

        async archiveShiftData() {
            // Strict RBAC check: only Admin can reset/archive vacation
            this.requirePermission('shift:archive');

            const uid = this.getCurrentUserId();

            if (this.db && navigator.onLine) {
                try {
                    await this.db.ref(`users/${uid}/containers`).remove();
                } catch (e) {
                    console.warn('Archive shift cloud warning:', e);
                }
            }

            // Clear user's container records from IndexedDB
            await this._idbDeleteByIndex('containers', 'idx_userId', uid);
            await this._idbDeleteByIndex('offline_queue', 'idx_userId', uid);

            this.containers = [];
            this.offlineQueue = [];

            this._logAudit('shift:archive', `Shift data archived by Admin`);
            this._emit('containers', this.containers);
            return true;
        }

        // ================= 🏷️ DYNAMIC MODELS & CUSTOM FIELDS =================

        async saveModelConfigs(modelName, fields = []) {
            this.requirePermission('model:create');

            const cleanName = String(modelName || '').trim();
            if (!cleanName) return;

            const uid = this.getCurrentUserId();
            this.modelConfigs[cleanName] = Array.isArray(fields) ? fields : [];

            // Persist to IndexedDB
            await this._idbPut('model_configs', {
                configId: `${uid}_${cleanName}`,
                userId: uid,
                modelName: cleanName,
                fields: this.modelConfigs[cleanName],
                updatedAt: Date.now()
            });

            // Ensure baseline column mapping
            if (!this.templateMappings[cleanName]) {
                await this.saveTemplateMapping(cleanName, this.getDefaultMapping(cleanName));
            }

            // Cloud sync
            if (this.db && navigator.onLine) {
                try {
                    await this.db.ref(`users/${uid}/modelConfigs/${cleanName}`).set(this.modelConfigs[cleanName]);
                } catch (e) {}
            }

            this._logAudit('model:save', `Model config saved: ${cleanName}`);
            this._emit('models', this.modelConfigs);
        }

        async deleteModel(modelName) {
            this.requirePermission('model:delete');

            const cleanName = String(modelName || '').trim();
            const uid = this.getCurrentUserId();

            delete this.modelConfigs[cleanName];
            delete this.modelTemplates[cleanName];
            delete this.templateMappings[cleanName];

            // IndexedDB delete
            await this._idbDelete('model_configs', `${uid}_${cleanName}`);
            await this._idbDelete('model_templates', `${uid}_${cleanName}`);
            await this._idbDelete('column_mappings', `${uid}_${cleanName}`);

            // Cloud delete
            if (this.db && navigator.onLine) {
                try {
                    await this.db.ref(`users/${uid}/modelConfigs/${cleanName}`).remove();
                    await this.db.ref(`users/${uid}/modelTemplates/${cleanName}`).remove();
                    await this.db.ref(`users/${uid}/templateMappings/${cleanName}`).remove();
                } catch (e) {}
            }

            this._logAudit('model:delete', `Model deleted: ${cleanName}`);
            this._emit('models', this.modelConfigs);
            this._emit('templates', this.modelTemplates);
            this._emit('mappings', this.templateMappings);
        }

        async addModelTag(modelName, tagName) {
            this.requirePermission('model:update');

            const cleanModel = String(modelName || '').trim();
            const cleanTag = String(tagName || '').trim();
            if (!cleanModel || !cleanTag) return;

            const fields = this.modelConfigs[cleanModel] || [];
            if (!fields.includes(cleanTag)) {
                fields.push(cleanTag);
                await this.saveModelConfigs(cleanModel, fields);

                // Auto assign next available column
                const currentMapping = this.getTemplateMapping(cleanModel);
                const colKey = `custom_${cleanTag}`;
                if (!currentMapping.columns || !currentMapping.columns[colKey]) {
                    const letters = this.getColumnLetterList().filter(l => l !== 'None');
                    const usedCols = Object.values(currentMapping.columns || {});
                    const nextCol = letters.find(l => !usedCols.includes(l)) || 'Z';
                    currentMapping.columns = currentMapping.columns || {};
                    currentMapping.columns[colKey] = nextCol;
                    await this.saveTemplateMapping(cleanModel, currentMapping);
                }
            }
        }

        async deleteModelTag(modelName, tagName) {
            this.requirePermission('model:update');

            const cleanModel = String(modelName || '').trim();
            const cleanTag = String(tagName || '').trim();
            if (!cleanModel || !cleanTag) return;

            const fields = (this.modelConfigs[cleanModel] || []).filter(f => f !== cleanTag);
            await this.saveModelConfigs(cleanModel, fields);

            const currentMapping = this.getTemplateMapping(cleanModel);
            const colKey = `custom_${cleanTag}`;
            if (currentMapping.columns && currentMapping.columns[colKey]) {
                delete currentMapping.columns[colKey];
                await this.saveTemplateMapping(cleanModel, currentMapping);
            }
        }

        async promptAddNewModel() {
            this.requirePermission('model:create');
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

        async promptAddModelTag(modelName) {
            this.requirePermission('model:update');
            if (!modelName) return;
            const tagName = prompt(`Nom du nouveau champ / tag pour "${modelName}" (ex: Température, Poids, Transporteur...) :`);
            if (tagName && tagName.trim()) {
                await this.addModelTag(modelName, tagName.trim());
                if (window.showToast) window.showToast(`✓ Champ "${tagName.trim()}" ajouté à "${modelName}" !`);
            }
        }

        // ================= 📑 TEMPLATES & COLUMN MAPPINGS =================

        async saveModelTemplate(modelName, base64Data) {
            this.requirePermission('template:upload');

            const cleanName = String(modelName || '').trim();
            const uid = this.getCurrentUserId();
            this.modelTemplates[cleanName] = base64Data;

            // Persist to IndexedDB
            await this._idbPut('model_templates', {
                templateId: `${uid}_${cleanName}`,
                userId: uid,
                modelName: cleanName,
                base64: base64Data,
                updatedAt: Date.now()
            });

            // Cloud sync
            if (this.db && navigator.onLine) {
                try {
                    await this.db.ref(`users/${uid}/modelTemplates/${cleanName}`).set(base64Data);
                } catch (e) {}
            }

            this._logAudit('template:save', `Template Excel saved for model: ${cleanName}`);
            this._emit('templates', this.modelTemplates);
        }

        async deleteModelTemplate(modelName) {
            this.requirePermission('template:delete');

            const cleanName = String(modelName || '').trim();
            const uid = this.getCurrentUserId();
            delete this.modelTemplates[cleanName];

            await this._idbDelete('model_templates', `${uid}_${cleanName}`);

            if (this.db && navigator.onLine) {
                try {
                    await this.db.ref(`users/${uid}/modelTemplates/${cleanName}`).remove();
                } catch (e) {}
            }

            this._logAudit('template:delete', `Template Excel deleted for model: ${cleanName}`);
            this._emit('templates', this.modelTemplates);
        }

        async saveTemplateMapping(modelName, mappingData) {
            this.requirePermission('mapping:update');

            const cleanName = String(modelName || '').trim();
            const uid = this.getCurrentUserId();
            const sanitized = {
                startRow: parseInt(mappingData.startRow, 10) || 2,
                columns: { ...(mappingData.columns || {}) },
                updatedAt: Date.now()
            };

            this.templateMappings[cleanName] = sanitized;

            // Persist to IndexedDB
            await this._idbPut('column_mappings', {
                mappingId: `${uid}_${cleanName}`,
                userId: uid,
                modelName: cleanName,
                startRow: sanitized.startRow,
                columns: sanitized.columns,
                updatedAt: sanitized.updatedAt
            });

            // Cloud sync
            if (this.db && navigator.onLine) {
                try {
                    await this.db.ref(`users/${uid}/templateMappings/${cleanName}`).set(sanitized);
                } catch (e) {}
            }

            this._emit('mappings', this.templateMappings);
            return sanitized;
        }

        getTemplateMapping(modelName) {
            if (this.templateMappings && this.templateMappings[modelName]) {
                return this.templateMappings[modelName];
            }
            return this.getDefaultMapping(modelName);
        }

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

        // ================= 📢 EVENT BUS SYSTEM =================

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
    window.DPW_ROLES = ROLES;

})(window);
