/**
 * DP WORLD DJENDJEN - CONTAINER TALLYING PWA
 * Contrôleur Principal de l'Application, Gestion des Modales, RBAC & Synchronisation
 */

(function(window) {
    'use strict';

    // Configuration Firebase (Couche Temps Réel Cloud Optionnelle)
    const firebaseConfig = {
        apiKey: "AIzaSyAJ2eLg1TJ419Hxhi542A104GiGhi3k5Ps",
        authDomain: "pointeur-167d6.firebaseapp.com",
        databaseURL: "https://pointeur-167d6-default-rtdb.firebaseio.com",
        projectId: "pointeur-167d6",
        storageBucket: "pointeur-167d6.firebasestorage.app",
        messagingSenderId: "2002696474",
        appId: "1:2002696474:web:0fc47757b941c0a3b8d4a3",
        measurementId: "G-3GWZV8BWE4"
    };

    // Variables d'état de l'application (Strictement isolées en session active)
    let currentUser = null;
    let authMode = 'login';
    let currentLang = localStorage.getItem('dpw_lang') || 'fr';
    let isSaving = false;
    let currentUploadTemplateTarget = '';
    let currentDamagePhotoBase64 = '';

    // ================= 🌐 DICTIONNAIRE DE TRADUCTION =================
    const translations = {
        fr: {
            btnPointer: "Pointer",
            btnYardText: "Parc à Conteneurs",
            lblPickYard: "Choisir sur Parc",
            txtYardModalTitle: "Matrice Visuelle du Parc (Yard 2D)",
            txtYardModalSub: "Vue en coupe maritime : Bloc • Travée (Bay) • Rangée (Row) • Hauteur (Tier)",
            searchPlaceholder: "Rechercher par N° ou emplacement...",
            cloudDirect: "Stockage IndexedDB + Cloud",
            navAccueil: "Accueil",
            navSuivi: "Suivi Flux",
            navSettings: "Modèles",
            navCompte: "Compte",
            allStages: "Tous les emplacements",
            navire: "🚢 En Navire",
            stock: "📦 En Stockage (Parc)",
            douane: "🏛️ En Douane",
            embarque: "⚓ Embarqué / Livré",
            allStatus: "Tous les états",
            good: "Bon état",
            damaged: "Endommagé",
            suiviTitle: "Suivi des Flux Maritimes (Import & Export)",
            suiviDesc: "Cliquez sur les étapes pour mettre à jour la position du conteneur en temps réel.",
            modelsTitle: "Modèles & Templates Excel",
            modelsDesc: "Ajoutez vos modèles de travail et configurez le remplissage direct sur vos fichiers Excel officiels.",
            create: "Créer",
            modalTitle: "Pointer un conteneur",
            modelLbl: "Modèle de pointage",
            containerNo: "N° Conteneur (ISO 6346)",
            typeLbl: "Type & taille",
            statusLbl: "État",
            locLbl: "Emplacement Parc",
            sealLbl: "N° Plomb (Seal)",
            notesLbl: "Remarques générales",
            cancel: "Annuler",
            save: "Enregistrer",
            logout: "Se déconnecter",
            myCounts: "Mes Pointages",
            cloudServer: "Sécurité & Stockage",
            activeState: "Actif (IndexedDB)",
            terminalDesc: "Système de pointage et gestion des flux sous environnement sécurisé PBKDF2 & IndexedDB GB-Scale offline.",
            damageTitle: "Photo de l'avarie",
            btnTakeDamage: "Prendre photo",
            kpiTotal: "Total",
            kpiGood: "Bon État",
            kpiDamaged: "Avarié",
            kpiStock: "En Stock",
            btnArchive: "Archiver la vacation actuelle",
            exportTitle: "Options d'exportation Excel",
            exportStage: "Filtrer par étape",
            exportModel: "Modèle à exporter",
            btnDownload: "Générer & Télécharger le fichier",
            lblLangSettings: "Langue de l'application",
            roleAdmin: "Administrateur",
            rolePointeur: "Agent Pointeur",
            accessDeniedDelete: "Accès refusé : Seul un Administrateur peut supprimer un conteneur.",
            accessDeniedArchive: "Accès refusé : L'archivage de la vacation est réservé aux Administrateurs.",
            accessDeniedModel: "Accès refusé : Seul un Administrateur peut supprimer des modèles ou templates.",
            stageNames: { Navire: 'En Navire', Stock: 'En Stockage', Douane: 'En Douane', Embarqué: 'Embarqué / Sortie' }
        },
        ar: {
            btnPointer: "تسجيل +",
            btnYardText: "ساحة الحاويات",
            lblPickYard: "اختيار من الساحة",
            txtYardModalTitle: "المصفوفة المرئية لساحة الحاويات (Yard 2D)",
            txtYardModalSub: "عرض مقطعي للخانة (Bay) • الصفوف والطوابق (Rows & Tiers)",
            searchPlaceholder: "بحث برقم الحاوية أو الموقع في الساحة...",
            cloudDirect: "قاعدة بيانات IndexedDB + سحابة",
            navAccueil: "الرئيسية",
            navSuivi: "تتبع المسار",
            navSettings: "النماذج",
            navCompte: "حسابي",
            allStages: "جميع المواقع والمراحل",
            navire: "🚢 تفريغ من السفينة",
            stock: "📦 في ساحة التخزين",
            douane: "🏛️ معاينة جمركية",
            embarque: "⚓ خروج وتسليم",
            allStatus: "جميع الحالات",
            good: "حالة سليمة (Bon)",
            damaged: "متضرر (Endommagé)",
            suiviTitle: "متابعة تدفق الحاويات (استيراد وتصدير)",
            suiviDesc: "انقر على المحطات لتحديث مسار الحاوية فورياً في السيرفر.",
            modelsTitle: "النماذج وقوالب إكسل الرسمية",
            modelsDesc: "أضف نماذج العمل وقم برفع ملف إكسل الرسمي وتحديد مطابقة الأعمدة تلقائياً.",
            create: "إنشاء نموذج",
            modalTitle: "تسجيل ورصد حاوية جديدة",
            modelLbl: "نموذج العمل الميداني",
            containerNo: "رقم الحاوية (ISO 6346)",
            typeLbl: "النوع والحجم (ISO)",
            statusLbl: "الحالة المادية",
            locLbl: "الموقع في الساحة (Bay/Row/Tier)",
            sealLbl: "رقم القفل والرصاص (Plomb)",
            notesLbl: "ملاحظات إضافية",
            cancel: "إلغاء",
            save: "حفظ البيانات",
            logout: "تسجيل الخروج من الحساب",
            myCounts: "تسجيلاتي الميدانية",
            cloudServer: "الأمان والتخزين",
            activeState: "نشط (IndexedDB)",
            terminalDesc: "نظام رصد ومتابعة تدفق الحاويات في محطة ميناء جن جن تحت بيئة مشفرة وتخزين محلي ضخم.",
            damageTitle: "صورة الضرر / العيب",
            btnTakeDamage: "التقاط صورة",
            kpiTotal: "الإجمالي",
            kpiGood: "سليمة",
            kpiDamaged: "متضررة",
            kpiStock: "في الساحة",
            btnArchive: "أرشفة الوردية الحالية",
            exportTitle: "خيارات تصدير ملف الإكسل",
            exportStage: "تصفية حسب المرحلة",
            exportModel: "النموذج المراد تصديره",
            btnDownload: "توليد وتنزيل ملف الإكسل",
            lblLangSettings: "لغة التطبيق",
            roleAdmin: "مسؤول النظام (Admin)",
            rolePointeur: "عون تسجيل (Pointeur)",
            accessDeniedDelete: "تم رفض الوصول: يتطلب حذف السجلات صلاحيات مسؤول النظام (Admin).",
            accessDeniedArchive: "تم رفض الوصول: أرشفة الوردية مقتصرة على المشرفين والمسؤولين.",
            accessDeniedModel: "تم رفض الوصول: حذف النماذج والقوالب مخصص لمسؤولي النظام.",
            stageNames: { Navire: 'في السفينة', Stock: 'في الساحة', Douane: 'في الجمارك', Embarqué: 'تسليم وخروج' }
        },
        en: {
            btnPointer: "Tally +",
            btnYardText: "Container Yard",
            lblPickYard: "Pick from Yard",
            txtYardModalTitle: "Visual Yard Matrix (Yard 2D)",
            txtYardModalSub: "Cross-section Bay view • Rows & Tiers stacking",
            searchPlaceholder: "Search by container ID or yard slot...",
            cloudDirect: "IndexedDB + Cloud Storage",
            navAccueil: "Home",
            navSuivi: "Track & Trace",
            navSettings: "Models",
            navCompte: "Account",
            allStages: "All Locations",
            navire: "🚢 On Vessel",
            stock: "📦 In Yard Stock",
            douane: "🏛️ In Customs",
            embarque: "⚓ Loaded / Delivered",
            allStatus: "All Conditions",
            good: "Good condition",
            damaged: "Damaged",
            suiviTitle: "Container Flow Tracker (Import & Export)",
            suiviDesc: "Click stages to update container location in real-time.",
            modelsTitle: "Models & Excel Templates",
            modelsDesc: "Add operation models and configure direct injection into company Excel files.",
            create: "Create",
            modalTitle: "Tally New Container",
            modelLbl: "Operation Model",
            containerNo: "Container No. (ISO 6346)",
            typeLbl: "Type & Size",
            statusLbl: "Condition",
            locLbl: "Yard Location",
            sealLbl: "Seal No.",
            notesLbl: "General Remarks",
            cancel: "Cancel",
            save: "Save Record",
            logout: "Sign Out",
            myCounts: "My Tallies",
            cloudServer: "Security & Storage",
            activeState: "Active (IndexedDB)",
            terminalDesc: "DP World Djendjen Terminal container flow monitoring under secure PBKDF2 encryption & offline IndexedDB.",
            damageTitle: "Damage Photo",
            btnTakeDamage: "Take Photo",
            kpiTotal: "Total",
            kpiGood: "Good",
            kpiDamaged: "Damaged",
            kpiStock: "In Stock",
            btnArchive: "Archive Current Shift",
            exportTitle: "Excel Export Options",
            exportStage: "Filter by Stage",
            exportModel: "Model to Export",
            btnDownload: "Generate & Download File",
            lblLangSettings: "Application Language",
            roleAdmin: "Administrator",
            rolePointeur: "Tallyman Agent",
            accessDeniedDelete: "Access denied: Only an Administrator can delete container records.",
            accessDeniedArchive: "Access denied: Archiving shift data is restricted to Administrators.",
            accessDeniedModel: "Access denied: Only an Administrator can delete templates or models.",
            stageNames: { Navire: 'On Vessel', Stock: 'In Yard', Douane: 'In Customs', Embarqué: 'Delivered / Out' }
        }
    };

    /**
     * Obtenir la liste stricte des conteneurs valides pour l'utilisateur connecté
     */
    function getCleanContainersList() {
        const raw = (window.DPW_DB && Array.isArray(window.DPW_DB.containers)) ? window.DPW_DB.containers : [];
        const currentUid = (window.DPW_DB && typeof window.DPW_DB.getCurrentUserId === 'function') 
            ? window.DPW_DB.getCurrentUserId() 
            : null;

        return raw
            .map(c => {
                if (!c) return null;
                const num = String(c.containerNumber || c.id || '').trim().toUpperCase();
                return { ...c, containerNumber: num, id: num };
            })
            .filter(c => {
                if (!c || !c.containerNumber || c.containerNumber === 'undefined' || c.containerNumber === 'null') {
                    return false;
                }
                // Multi-User Data Isolation filter: ensure record belongs to active user
                if (currentUid && c.userId && c.userId !== currentUid) {
                    return false;
                }
                return true;
            });
    }

    // ================= 🚀 INITIALISATION DE L'APPLICATION =================
    window.addEventListener('DOMContentLoaded', async () => {
        // 1. Initialisation de la couche IndexedDB & Sécurité
        if (window.DPW_DB && typeof window.DPW_DB.init === 'function') {
            await window.DPW_DB.init(firebaseConfig);

            // Souscriptions aux événements IndexedDB & Synchronisation
            window.DPW_DB.on('containers', () => {
                filterContainers();
                renderTrackingList();
                updateAccountStats();
                if (window.DPW_YARD && typeof window.DPW_YARD.updateContainers === 'function') {
                    window.DPW_YARD.updateContainers();
                }
            });

            window.DPW_DB.on('connection', (isConnected) => {
                updateConnectionUI(isConnected);
            });

            window.DPW_DB.on('models', () => {
                populateModelSelect();
                renderModelsList();
            });

            window.DPW_DB.on('templates', () => {
                renderModelsList();
            });

            window.DPW_DB.on('mappings', () => {
                renderModelsList();
            });

            window.DPW_DB.on('user', (user) => {
                currentUser = user;
                updateUserUI(user);
            });

            window.DPW_DB.on('auth', ({ authenticated, user }) => {
                const authModal = document.getElementById('authModalOverlay');
                if (authenticated && user) {
                    currentUser = user;
                    if (authModal) authModal.classList.add('hidden');
                    updateUserUI(user);
                    populateModelSelect();
                    filterContainers();
                    renderTrackingList();
                    updateAccountStats();
                } else {
                    currentUser = null;
                    if (authModal) authModal.classList.remove('hidden');
                    renderList([]);
                    renderTrackingList();
                    updateAccountStats();
                }
            });
        }

        // 2. Configuration de l'authentification et session active
        setupAuthObserver();

        // 3. Configuration du "Pull to Refresh"
        setupPullToRefresh();

        // 4. Application de la langue et premier rendu
        setLanguage(currentLang);
        populateModelSelect();
        filterContainers();
        renderTrackingList();
        updateAccountStats();
    });

    // ================= 👤 AUTHENTIFICATION & CONTRÔLE RBAC =================
    function setupAuthObserver() {
        const authModal = document.getElementById('authModalOverlay');
        if (window.DPW_DB && window.DPW_DB.currentUser) {
            currentUser = window.DPW_DB.currentUser;
            if (authModal) authModal.classList.add('hidden');
            updateUserUI(currentUser);
        } else {
            // Check Firebase Auth as supplementary layer
            const auth = window.DPW_DB ? window.DPW_DB.auth : null;
            if (auth) {
                auth.onAuthStateChanged(async (fbUser) => {
                    if (fbUser) {
                        const email = fbUser.email;
                        const role = (email && email.toLowerCase().includes('admin')) ? 'Admin' : 'Pointeur';
                        currentUser = {
                            uid: fbUser.uid,
                            email: fbUser.email,
                            displayName: fbUser.email.split('@')[0],
                            role: role
                        };
                        window.DPW_DB.currentUser = currentUser;
                        window.DPW_DB.currentRole = role;
                        await window.DPW_DB.loadUserData(fbUser.uid);
                        if (authModal) authModal.classList.add('hidden');
                        updateUserUI(currentUser);
                        filterContainers();
                        renderTrackingList();
                        updateAccountStats();
                    } else if (!window.DPW_DB.currentUser) {
                        currentUser = null;
                        if (authModal) authModal.classList.remove('hidden');
                    }
                });
            } else if (!window.DPW_DB || !window.DPW_DB.currentUser) {
                if (authModal) authModal.classList.remove('hidden');
            }
        }
    }

    function updateUserUI(user) {
        const displayEl = document.getElementById('accountEmailDisplay');
        const t = translations[currentLang] || translations.fr;

        if (displayEl) {
            if (user && user.email) {
                const roleBadge = user.role === 'Admin' 
                    ? `<span class="ml-2 px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-500/20 text-rose-400 border border-rose-500/40 tracking-wider uppercase"><i class="fa-solid fa-shield-halved"></i> ${t.roleAdmin}</span>`
                    : `<span class="ml-2 px-2 py-0.5 rounded-full text-[10px] font-black bg-[#00ffaa]/20 text-[#00ffaa] border border-[#00ffaa]/40 tracking-wider uppercase"><i class="fa-solid fa-user-tag"></i> ${t.rolePointeur}</span>`;
                displayEl.innerHTML = `${user.email} ${roleBadge}`;
            } else {
                displayEl.innerText = t.rolePointeur;
            }
        }
    }

    function switchAuthTab(mode) {
        authMode = mode;
        const tabLogin = document.getElementById('authTabLogin');
        const tabReg = document.getElementById('authTabReg');
        const submitBtn = document.getElementById('authSubmitBtn');

        // Dynamic Role Selector Container
        let roleContainer = document.getElementById('authRoleSelectorContainer');
        if (!roleContainer) {
            const form = document.querySelector('#authModalOverlay form');
            if (form) {
                roleContainer = document.createElement('div');
                roleContainer.id = 'authRoleSelectorContainer';
                roleContainer.className = 'space-y-1';
                const submitButton = document.getElementById('authSubmitBtn');
                if (submitButton && submitButton.parentNode) {
                    submitButton.parentNode.insertBefore(roleContainer, submitButton);
                }
            }
        }

        if (mode === 'login') {
            if (tabLogin) tabLogin.className = "flex-1 py-2 text-[#00ffaa] border-b-2 border-[#00ffaa]";
            if (tabReg) tabReg.className = "flex-1 py-2 text-gray-400";
            if (submitBtn) submitBtn.innerText = currentLang === 'ar' ? "تسجيل الدخول" : "Se connecter";
            if (roleContainer) roleContainer.innerHTML = '';
        } else {
            if (tabReg) tabReg.className = "flex-1 py-2 text-[#00ffaa] border-b-2 border-[#00ffaa]";
            if (tabLogin) tabLogin.className = "flex-1 py-2 text-gray-400";
            if (submitBtn) submitBtn.innerText = currentLang === 'ar' ? "إنشاء حساب آمن" : "Créer un compte sécurisé";
            if (roleContainer) {
                roleContainer.innerHTML = `
                    <label class="block text-gray-300 font-semibold mb-1 text-xs">Rôle / Profil d'accès (RBAC)</label>
                    <select id="authRoleSelect" class="w-full input-dpw p-3 rounded-xl font-bold text-[#00ffaa] bg-[#1d2263] cursor-pointer">
                        <option value="Pointeur" selected>Agent Pointeur (Tally & Pointage terrain)</option>
                        <option value="Admin">Administrateur / Superviseur (Accès Total & Gestion)</option>
                    </select>
                `;
            }
        }
    }

    async function handleAuthAction(e) {
        e.preventDefault();
        const email = document.getElementById('authEmail').value.trim();
        const pass = document.getElementById('authPassword').value;
        const roleSelect = document.getElementById('authRoleSelect');
        const chosenRole = roleSelect ? roleSelect.value : 'Pointeur';
        const errEl = document.getElementById('authErrorMsg');
        const submitBtn = document.getElementById('authSubmitBtn');

        if (errEl) errEl.innerText = "";
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerText = currentLang === 'ar' ? "جاري التحقق..." : "Vérification...";
        }

        try {
            if (!window.DPW_DB) {
                throw new Error("Base de données non disponible");
            }

            let profile;
            if (authMode === 'login') {
                profile = await window.DPW_DB.loginUser(email, pass);
            } else {
                profile = await window.DPW_DB.registerUser(email, pass, chosenRole, email.split('@')[0]);
            }

            currentUser = profile;
            updateUserUI(profile);

            // Hide auth modal
            const authModal = document.getElementById('authModalOverlay');
            if (authModal) authModal.classList.add('hidden');

            showToast(currentLang === 'ar' ? `✓ مرحباً ${profile.email}` : `✓ Bienvenue ${profile.displayName} (${profile.role})`);
            
            populateModelSelect();
            filterContainers();
            renderTrackingList();
            updateAccountStats();
        } catch (err) {
            console.error("Auth action error:", err);
            if (errEl) errEl.innerText = err.message || "Erreur d'authentification";
            showToast(err.message || "Erreur d'authentification", true);
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerText = authMode === 'login' 
                    ? (currentLang === 'ar' ? "تسجيل الدخول" : "Se connecter")
                    : (currentLang === 'ar' ? "إنشاء حساب" : "Créer compte");
            }
        }
    }

    async function logoutFirebase() {
        const confirmMsg = currentLang === 'ar' ? "هل تريد حقاً تسجيل الخروج ومسح الجلسة؟" : "Voulez-vous vraiment vous déconnecter ?";
        if (confirm(confirmMsg)) {
            if (window.DPW_DB && typeof window.DPW_DB.logoutUser === 'function') {
                await window.DPW_DB.logoutUser();
            }

            currentUser = null;

            // Reset UI memory state
            renderList([]);
            renderTrackingList();
            updateAccountStats();

            // Show Login Modal immediately
            const authModal = document.getElementById('authModalOverlay');
            if (authModal) authModal.classList.remove('hidden');

            showToast(currentLang === 'ar' ? "تم تسجيل الخروج بنجاح" : "Déconnexion réussie");
        }
    }

    // ================= 🌐 LANGUES & LOCALISATION =================
    function setLanguage(lang) {
        currentLang = lang;
        localStorage.setItem('dpw_lang', lang);

        const htmlTag = document.getElementById('htmlTag');
        if (htmlTag) {
            if (lang === 'ar') {
                htmlTag.setAttribute('dir', 'rtl');
            } else {
                htmlTag.setAttribute('dir', 'ltr');
            }
        }

        // Mise à jour des boutons de langue
        ['fr', 'ar', 'en'].forEach(l => {
            const btnAcc = document.getElementById(`langBtn_${l}_acc`);
            if (btnAcc) {
                if (l === lang) {
                    btnAcc.className = "py-2.5 rounded-xl bg-[#00ffaa] text-[#0d1033] font-bold transition shadow-lg scale-100";
                } else {
                    btnAcc.className = "py-2.5 rounded-xl bg-[#15194a] text-gray-300 hover:text-white font-bold border border-[#252b75] transition";
                }
            }
        });

        const t = translations[lang] || translations.fr;
        if (document.getElementById('btnPointerText')) document.getElementById('btnPointerText').innerText = t.btnPointer;
        if (document.getElementById('btnYardText')) document.getElementById('btnYardText').innerText = t.btnYardText;
        if (document.getElementById('lblPickYard')) document.getElementById('lblPickYard').innerText = t.lblPickYard;
        if (document.getElementById('txtYardModalTitle')) document.getElementById('txtYardModalTitle').innerText = t.txtYardModalTitle;
        if (document.getElementById('txtYardModalSub')) document.getElementById('txtYardModalSub').innerText = t.txtYardModalSub;
        if (document.getElementById('liveSearchInput')) document.getElementById('liveSearchInput').placeholder = t.searchPlaceholder;
        if (document.getElementById('lblCloudDirect')) document.getElementById('lblCloudDirect').innerText = t.cloudDirect;
        if (document.getElementById('navAccueil')) document.getElementById('navAccueil').innerText = t.navAccueil;
        if (document.getElementById('navSuivi')) document.getElementById('navSuivi').innerText = t.navSuivi;
        if (document.getElementById('navSettings')) document.getElementById('navSettings').innerText = t.navSettings;
        if (document.getElementById('navCompte')) document.getElementById('navCompte').innerText = t.navCompte;
        
        if (document.getElementById('optAllStages')) document.getElementById('optAllStages').innerText = t.allStages;
        if (document.getElementById('optNavire')) document.getElementById('optNavire').innerText = t.navire;
        if (document.getElementById('optStock')) document.getElementById('optStock').innerText = t.stock;
        if (document.getElementById('optDouane')) document.getElementById('optDouane').innerText = t.douane;
        if (document.getElementById('optEmbarque')) document.getElementById('optEmbarque').innerText = t.embarque;

        if (document.getElementById('optAllStatus')) document.getElementById('optAllStatus').innerText = t.allStatus;
        if (document.getElementById('optBonEtat')) document.getElementById('optBonEtat').innerText = t.good;
        if (document.getElementById('optEndommage')) document.getElementById('optEndommage').innerText = t.damaged;

        if (document.getElementById('txtSuiviTitle')) document.getElementById('txtSuiviTitle').innerText = t.suiviTitle;
        if (document.getElementById('txtSuiviDesc')) document.getElementById('txtSuiviDesc').innerText = t.suiviDesc;
        if (document.getElementById('txtModelsTitle')) document.getElementById('txtModelsTitle').innerText = t.modelsTitle;
        if (document.getElementById('txtModelsDesc')) document.getElementById('txtModelsDesc').innerText = t.modelsDesc;
        if (document.getElementById('btnCreateModel')) document.getElementById('btnCreateModel').innerText = t.create;
        if (document.getElementById('lblModalTitle')) document.getElementById('lblModalTitle').innerText = t.modalTitle;
        if (document.getElementById('lblModel')) document.getElementById('lblModel').innerText = t.modelLbl;
        if (document.getElementById('lblContainerNo')) document.getElementById('lblContainerNo').innerText = t.containerNo;
        if (document.getElementById('lblType')) document.getElementById('lblType').innerText = t.typeLbl;
        if (document.getElementById('lblStatus')) document.getElementById('lblStatus').innerText = t.statusLbl;
        if (document.getElementById('optGood')) document.getElementById('optGood').innerText = t.good;
        if (document.getElementById('optDamaged')) document.getElementById('optDamaged').innerText = t.damaged;
        if (document.getElementById('lblLocation')) document.getElementById('lblLocation').innerText = t.locLbl;
        if (document.getElementById('lblSeal')) document.getElementById('lblSeal').innerText = t.sealLbl;
        if (document.getElementById('lblNotes')) document.getElementById('lblNotes').innerText = t.notesLbl;
        if (document.getElementById('btnCancel')) document.getElementById('btnCancel').innerText = t.cancel;
        if (document.getElementById('btnSaveSubmit')) document.getElementById('btnSaveSubmit').innerText = t.save;
        if (document.getElementById('txtLogoutBtn')) document.getElementById('txtLogoutBtn').innerText = t.logout;

        if (document.getElementById('lblMyCounts')) document.getElementById('lblMyCounts').innerText = t.myCounts;
        if (document.getElementById('lblCloudServer')) document.getElementById('lblCloudServer').innerText = t.cloudServer;
        if (document.getElementById('lblActiveState')) document.getElementById('lblActiveState').innerText = t.activeState;
        if (document.getElementById('lblTerminalDesc')) document.getElementById('lblTerminalDesc').innerText = t.terminalDesc;
        if (document.getElementById('lblLangSettings')) document.getElementById('lblLangSettings').innerHTML = `<i class="fa-solid fa-globe text-[#00ffaa]"></i> <span>${t.lblLangSettings}</span>`;

        if (document.getElementById('lblDamagePhotoTitle')) document.getElementById('lblDamagePhotoTitle').innerText = t.damageTitle;
        if (document.getElementById('btnTakeDamagePhoto')) document.getElementById('btnTakeDamagePhoto').innerText = t.btnTakeDamage;
        if (document.getElementById('kpiTotalLbl')) document.getElementById('kpiTotalLbl').innerText = t.kpiTotal;
        if (document.getElementById('kpiGoodLbl')) document.getElementById('kpiGoodLbl').innerText = t.kpiGood;
        if (document.getElementById('kpiDamagedLbl')) document.getElementById('kpiDamagedLbl').innerText = t.kpiDamaged;
        if (document.getElementById('kpiStockLbl')) document.getElementById('kpiStockLbl').innerText = t.kpiStock;
        if (document.getElementById('btnArchiveText')) document.getElementById('btnArchiveText').innerText = t.btnArchive;
        if (document.getElementById('lblExportModalTitle')) document.getElementById('lblExportModalTitle').innerText = t.exportTitle;
        if (document.getElementById('lblExportStage')) document.getElementById('lblExportStage').innerText = t.exportStage;
        if (document.getElementById('lblExportModel')) document.getElementById('lblExportModel').innerText = t.exportModel;
        if (document.getElementById('btnDownloadReport')) document.getElementById('btnDownloadReport').innerText = t.btnDownload;

        if (currentUser) updateUserUI(currentUser);
        filterContainers();
        renderTrackingList();
    }

    // ================= 🧭 NAVIGATION ENTRE LES ONGLETS =================
    function switchTab(tabName) {
        const tabs = ['tabAccueil', 'tabSuivi', 'tabSettings', 'tabCompte'];
        const btns = ['navBtnAccueil', 'navBtnSuivi', 'navBtnSettings', 'navBtnCompte'];

        tabs.forEach(t => {
            const el = document.getElementById(t);
            if (el) el.classList.add('hidden');
        });
        btns.forEach(b => {
            const el = document.getElementById(b);
            if (el) el.className = "flex flex-col items-center gap-1 py-1.5 nav-item-inactive transition-all duration-200";
        });

        if (tabName === 'accueil') {
            document.getElementById('tabAccueil').classList.remove('hidden');
            document.getElementById('navBtnAccueil').className = "flex flex-col items-center gap-1 py-1.5 nav-pill-active transition-all duration-200";
            filterContainers();
        } else if (tabName === 'suivi') {
            document.getElementById('tabSuivi').classList.remove('hidden');
            document.getElementById('navBtnSuivi').className = "flex flex-col items-center gap-1 py-1.5 nav-pill-active transition-all duration-200";
            renderTrackingList();
        } else if (tabName === 'settings') {
            document.getElementById('tabSettings').classList.remove('hidden');
            document.getElementById('navBtnSettings').className = "flex flex-col items-center gap-1 py-1.5 nav-pill-active transition-all duration-200";
            renderModelsList();
        } else if (tabName === 'compte') {
            document.getElementById('tabCompte').classList.remove('hidden');
            document.getElementById('navBtnCompte').className = "flex flex-col items-center gap-1 py-1.5 nav-pill-active transition-all duration-200";
            updateAccountStats();
        }
    }

    // ================= 🔔 NOTIFICATIONS TOAST & FEEDBACK =================
    function showToast(msg, isError = false) {
        const toast = document.getElementById('toastContainer');
        const icon = document.getElementById('toastIcon');
        const text = document.getElementById('toastMsg');
        if (!toast || !icon || !text) return;

        text.innerText = msg;
        if (isError) {
            icon.className = "fa-solid fa-circle-exclamation text-rose-400 text-base";
            toast.firstElementChild.className = "dpw-card px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border border-rose-500/40 bg-slate-900/95";
        } else {
            icon.className = "fa-solid fa-circle-check text-[#00ffaa] text-base";
            toast.firstElementChild.className = "dpw-card px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border border-[#00ffaa]/40 bg-slate-900/95";
        }

        toast.classList.remove('opacity-0', '-translate-y-4');
        toast.classList.add('opacity-100', 'translate-y-0');

        setTimeout(() => {
            toast.classList.add('opacity-0', '-translate-y-4');
            toast.classList.remove('opacity-100', 'translate-y-0');
        }, 2500);
    }

    function triggerHapticFeedback() {
        if ("vibrate" in navigator) navigator.vibrate(60);
        try {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtx) return;
            const audioCtx = new AudioCtx();
            const osc = audioCtx.createGain ? audioCtx.createOscillator() : null;
            if (!osc) return;
            const gain = audioCtx.createGain();
            osc.type = "sine";
            osc.frequency.setValueAtTime(800, audioCtx.currentTime);
            gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start();
            osc.stop(audioCtx.currentTime + 0.08);
        } catch(e) {}
    }

    function forceRefreshApp() {
        showToast(currentLang === 'ar' ? "جاري التحديث..." : "Actualisation...");
        if ('caches' in window) {
            caches.keys().then((names) => {
                names.forEach((name) => caches.delete(name));
            });
        }
        setTimeout(() => {
            window.location.reload(true);
        }, 300);
    }

    function setupPullToRefresh() {
        let touchStartY = 0;
        let isPulling = false;

        window.addEventListener('touchstart', (e) => {
            if (window.scrollY <= 2) {
                touchStartY = e.touches[0].clientY;
                isPulling = true;
            }
        }, { passive: true });

        window.addEventListener('touchmove', (e) => {
            if (!isPulling) return;
            const currentY = e.touches[0].clientY;
            const diff = currentY - touchStartY;

            if (diff > 45 && window.scrollY <= 2) {
                const indicator = document.getElementById('pullToRefreshIndicator');
                const spinnerIcon = document.getElementById('pullSpinnerIcon');
                if (indicator && spinnerIcon) {
                    indicator.classList.remove('opacity-0');
                    indicator.classList.add('opacity-100');
                    
                    const pullDistance = Math.min((diff - 45) * 0.35, 75);
                    indicator.style.transform = `translate(-50%, ${pullDistance}px)`;

                    if (pullDistance > 55) {
                        spinnerIcon.className = "fa-solid fa-rotate animate-spin text-sm text-[#00ffaa]";
                    } else {
                        spinnerIcon.className = "fa-solid fa-arrow-down text-sm text-[#00ffaa]";
                    }
                }
            }
        }, { passive: true });

        window.addEventListener('touchend', (e) => {
            if (!isPulling) return;
            const indicator = document.getElementById('pullToRefreshIndicator');
            const currentY = e.changedTouches[0].clientY;
            const diff = currentY - touchStartY;

            if (diff > 130 && window.scrollY <= 2) {
                triggerHapticFeedback();
                if (indicator) indicator.style.transform = `translate(-50%, 45px)`;
                forceRefreshApp();
            } else if (indicator) {
                indicator.style.transform = `translate(-50%, -80px)`;
                indicator.classList.remove('opacity-100');
                indicator.classList.add('opacity-0');
            }
            isPulling = false;
            touchStartY = 0;
        }, { passive: true });
    }

    function updateConnectionUI(isConnected) {
        const badge = document.getElementById('connectionBadge');
        const dot = document.getElementById('connectionDot');
        const label = document.getElementById('lblCloudDirect');
        const accountState = document.getElementById('accountCloudState');
        const accountDot = document.getElementById('accountCloudDot');
        const accountLabel = document.getElementById('lblActiveState');

        const t = translations[currentLang] || translations.fr;

        if (isConnected) {
            if (badge) badge.className = "text-[10px] text-[#00ffaa] flex items-center gap-1.5 font-semibold bg-[#15194a]/90 px-3 py-1 rounded-full border border-[#00ffaa]/40 transition-all duration-300";
            if (dot) dot.className = "w-1.5 h-1.5 rounded-full bg-[#00ffaa] animate-ping";
            if (label) label.innerText = t.cloudDirect;

            if (accountState) {
                accountState.className = "inline-flex items-center gap-1.5 text-xs font-bold text-emerald-400 mt-1";
                if (accountDot) accountDot.className = "w-2 h-2 rounded-full bg-emerald-400 animate-pulse";
                if (accountLabel) accountLabel.innerText = t.activeState;
            }
        } else {
            if (badge) badge.className = "text-[10px] text-amber-400 flex items-center gap-1.5 font-semibold bg-[#15194a]/90 px-3 py-1 rounded-full border border-amber-500/40 transition-all duration-300";
            if (dot) dot.className = "w-1.5 h-1.5 rounded-full bg-amber-400";
            if (label) label.innerText = currentLang === 'ar' ? "وضع IndexedDB المحلي" : "Mode IndexedDB Hors-ligne";

            if (accountState) {
                accountState.className = "inline-flex items-center gap-1.5 text-xs font-bold text-amber-400 mt-1";
                if (accountDot) accountDot.className = "w-2 h-2 rounded-full bg-amber-400";
                if (accountLabel) accountLabel.innerText = currentLang === 'ar' ? "IndexedDB محلي" : "IndexedDB Local";
            }
        }
    }

    function updateAccountStats() {
        const containers = getCleanContainersList();
        const agentName = currentUser ? (currentUser.displayName || currentUser.email.split('@')[0]) : 'Pointeur';
        const myCount = containers.length;

        if (document.getElementById('agentCountStat')) document.getElementById('agentCountStat').innerText = myCount;
        if (document.getElementById('kpiTotalVal')) document.getElementById('kpiTotalVal').innerText = containers.length;
        if (document.getElementById('kpiGoodVal')) document.getElementById('kpiGoodVal').innerText = containers.filter(c => c.status === 'Bon état').length;
        if (document.getElementById('kpiDamagedVal')) document.getElementById('kpiDamagedVal').innerText = containers.filter(c => c.status === 'Endommagé').length;
        if (document.getElementById('kpiStockVal')) document.getElementById('kpiStockVal').innerText = containers.filter(c => (c.stage || 'Stock') === 'Stock').length;
    }

    // ================= 🔍 VALIDATION ISO 6346 & OCR =================
    function validateISOContainer(code) {
        const badge = document.getElementById('isoValidationBadge');
        if (!badge) return;

        if (window.DPW_OCR && typeof window.DPW_OCR.validateISO6346 === 'function') {
            const result = window.DPW_OCR.validateISO6346(code);

            if (!code || code.trim().length !== 11) {
                badge.classList.add('hidden');
                return;
            }

            badge.classList.remove('hidden');
            if (result.isValid) {
                badge.className = "text-[10px] font-bold text-[#00ffaa]";
                badge.innerText = currentLang === 'ar' ? "✓ كود ISO صحيح" : "✓ ISO 6346 Valide";
            } else {
                badge.className = "text-[10px] font-bold text-rose-400";
                badge.innerText = currentLang === 'ar' 
                    ? `⚠ رقم الفحص غير مطابق (المتوقع: ${result.expectedCheckDigit})` 
                    : `⚠ ISO Invalide (Attendu: ${result.expectedCheckDigit})`;
            }
        }
    }

    function triggerCameraOCR() {
        const input = document.getElementById('ocrCameraInput');
        if (input) input.click();
    }

    function triggerBarcodeScan() {
        showToast(currentLang === 'ar' ? "فتح الكاميرا لمسح الباركود..." : "Ouverture du lecteur optique...");
        const input = document.getElementById('ocrCameraInput');
        if (input) input.click();
    }

    async function processOCRImage(event) {
        const file = event.target.files[0];
        if (!file) return;

        const statusEl = document.getElementById('ocrStatus');
        if (statusEl) {
            statusEl.classList.remove('hidden');
            statusEl.className = "text-[10px] text-yellow-400 mt-1 font-bold animate-pulse";
            statusEl.innerText = currentLang === 'ar' ? "جاري تحليل الصورة..." : "Analyse de la photo en cours...";
        }

        try {
            if (window.DPW_OCR && typeof window.DPW_OCR.processImage === 'function') {
                const result = await window.DPW_OCR.processImage(file, () => {
                    if (statusEl) statusEl.innerText = currentLang === 'ar' ? "جاري التعرف على الحروف..." : "Reconnaissance de texte...";
                });

                if (result.containerId) {
                    const inpId = document.getElementById('inpId');
                    if (inpId) inpId.value = result.containerId;
                    validateISOContainer(result.containerId);
                    if (statusEl) {
                        statusEl.className = "text-[10px] text-[#00ffaa] mt-1 font-bold";
                        statusEl.innerText = `✓ N° conteneur détecté (${result.method})!`;
                    }
                    triggerHapticFeedback();
                } else if (statusEl) {
                    statusEl.className = "text-[10px] text-red-400 mt-1 font-bold";
                    statusEl.innerText = currentLang === 'ar' ? "⚠ تعذر قراءة الحاوية." : "⚠ Impossible de lire le numéro.";
                }
            }
        } catch (err) {
            console.error("Erreur OCR:", err);
            if (statusEl) {
                statusEl.className = "text-[10px] text-red-400 mt-1 font-bold";
                statusEl.innerText = "Erreur OCR.";
            }
        }
    }

    // ================= 📸 GESTION PHOTO D'AVARIE =================
    function toggleDamageSection(status) {
        const section = document.getElementById('damagePhotoSection');
        if (!section) return;
        if (status === 'Endommagé') {
            section.classList.remove('hidden');
        } else {
            section.classList.add('hidden');
        }
    }

    async function handleDamagePhoto(event) {
        const file = event.target.files[0];
        if (!file) return;

        const progressContainer = document.getElementById('photoProgressBarContainer');
        const progressBar = document.getElementById('photoProgressBar');

        if (progressContainer && progressBar) {
            progressContainer.classList.remove('hidden');
            progressBar.style.width = '30%';
        }

        try {
            if (progressBar) progressBar.style.width = '70%';
            if (window.DPW_OCR && typeof window.DPW_OCR.compressImage === 'function') {
                const base64 = await window.DPW_OCR.compressImage(file, 640, 480, 0.65);
                currentDamagePhotoBase64 = base64;

                if (progressBar) progressBar.style.width = '100%';
                setTimeout(() => {
                    if (progressContainer) progressContainer.classList.add('hidden');
                    if (progressBar) progressBar.style.width = '0%';
                    const img = document.getElementById('damageImgTag');
                    const preview = document.getElementById('damagePhotoPreview');
                    if (img) img.src = currentDamagePhotoBase64;
                    if (preview) preview.classList.remove('hidden');
                    showToast(currentLang === 'ar' ? "✓ تم تجهيز الصورة بنجاح" : "✓ Photo de l'avarie prête");
                }, 300);
            }
        } catch (err) {
            console.error("Erreur compression photo:", err);
            if (progressContainer) progressContainer.classList.add('hidden');
            showToast("Erreur traitement photo", true);
        }
    }

    function removeDamagePhoto() {
        currentDamagePhotoBase64 = '';
        const img = document.getElementById('damageImgTag');
        const preview = document.getElementById('damagePhotoPreview');
        const input = document.getElementById('damagePhotoInput');
        const progress = document.getElementById('photoProgressBarContainer');

        if (img) img.src = '';
        if (preview) preview.classList.add('hidden');
        if (input) input.value = '';
        if (progress) progress.classList.add('hidden');
    }

    // ================= 📝 FORMULAIRE DE POINTAGE =================
    function populateModelSelect() {
        const selectEl = document.getElementById('inpModel');
        const exportSelect = document.getElementById('exportFilterModel');
        if (!selectEl || !exportSelect) return;

        const modelConfigs = (window.DPW_DB && window.DPW_DB.modelConfigs) ? window.DPW_DB.modelConfigs : { "Standard": [] };
        selectEl.innerHTML = '';
        exportSelect.innerHTML = '<option value="All">Tous les modèles</option>';

        Object.keys(modelConfigs).forEach(m => {
            const opt = document.createElement('option');
            opt.value = m;
            opt.innerText = m;
            selectEl.appendChild(opt);

            const optExp = document.createElement('option');
            optExp.value = m;
            optExp.innerText = m;
            exportSelect.appendChild(optExp);
        });

        updateDynamicFormFields();
    }

    function updateDynamicFormFields(presetValues = {}) {
        const selectEl = document.getElementById('inpModel');
        const container = document.getElementById('dynamicFieldsContainer');
        if (!selectEl || !container) return;

        const currentModel = selectEl.value;
        container.innerHTML = '';

        const modelConfigs = (window.DPW_DB && window.DPW_DB.modelConfigs) ? window.DPW_DB.modelConfigs : {};
        const fields = modelConfigs[currentModel] || [];

        if (fields.length > 0) {
            const title = document.createElement('p');
            title.className = "text-[11px] font-bold text-[#00ffaa] uppercase tracking-wider mb-2";
            title.innerText = currentLang === 'ar' ? `حقول خاصة بنموذج (${currentModel})` : `Champs spécifiques (${currentModel})`;
            container.appendChild(title);

            fields.forEach(fName => {
                const div = document.createElement('div');
                div.className = "mb-2";
                div.innerHTML = `
                    <label class="block text-gray-300 font-medium mb-1">${fName}</label>
                    <input type="text" data-custom-field="${fName}" value="${presetValues[fName] || ''}" placeholder="${currentLang === 'ar' ? 'أدخل ' + fName : 'Renseigner ' + fName}..." class="w-full input-dpw p-2.5 rounded-xl text-xs">
                `;
                container.appendChild(div);
            });
        }
    }

    function openModal() {
        document.getElementById('editContainerKey').value = '';
        document.getElementById('lblModalTitle').innerText = currentLang === 'ar' ? "تسجيل ورصد حاوية جديدة" : "Pointer un conteneur";
        document.getElementById('inpId').value = '';
        document.getElementById('inpLoc').value = '';
        document.getElementById('inpSeal').value = '';
        document.getElementById('inpNotes').value = '';
        const badge = document.getElementById('isoValidationBadge');
        if (badge) badge.classList.add('hidden');
        removeDamagePhoto();
        populateModelSelect();
        document.body.classList.add('modal-open');
        document.getElementById('modalOverlay').classList.remove('hidden');
    }

    function openEditModal(fbKey) {
        const containers = getCleanContainersList();
        const item = containers.find(c => c && (c.firebaseKey === fbKey || c.id === fbKey));
        if (!item) return;

        document.getElementById('editContainerKey').value = fbKey;
        document.getElementById('lblModalTitle').innerText = currentLang === 'ar' ? "تعديل بيانات الحاوية" : "Modifier le conteneur";
        const containerNo = item.containerNumber || item.id || '';
        document.getElementById('inpId').value = containerNo;
        validateISOContainer(containerNo);
        document.getElementById('inpType').value = item.type || '40HC';
        document.getElementById('inpStatus').value = item.status || 'Bon état';
        toggleDamageSection(item.status);
        document.getElementById('inpLoc').value = item.loc || '';
        document.getElementById('inpSeal').value = item.seal || '';
        document.getElementById('inpNotes').value = item.notes || '';

        if (item.damagePhoto) {
            currentDamagePhotoBase64 = item.damagePhoto;
            document.getElementById('damageImgTag').src = item.damagePhoto;
            document.getElementById('damagePhotoPreview').classList.remove('hidden');
        } else {
            removeDamagePhoto();
        }

        populateModelSelect();
        if (item.model) document.getElementById('inpModel').value = item.model;
        updateDynamicFormFields(item.customData || {});

        document.body.classList.add('modal-open');
        document.getElementById('modalOverlay').classList.remove('hidden');
    }

    function closeModal() {
        document.body.classList.remove('modal-open');
        document.getElementById('modalOverlay').classList.add('hidden');
        isSaving = false;
    }

    // ================= 🏗️ GESTION DU PARC (YARD MODAL) =================
    function openYardModal(selectMode = false) {
        document.body.classList.add('modal-open');
        if (window.DPW_YARD && typeof window.DPW_YARD.openYardModal === 'function') {
            window.DPW_YARD.openYardModal(selectMode);
        } else {
            const modal = document.getElementById('yardModalOverlay');
            if (modal) modal.classList.remove('hidden');
        }
    }

    function closeYardModal() {
        document.body.classList.remove('modal-open');
        if (window.DPW_YARD && typeof window.DPW_YARD.closeYardModal === 'function') {
            window.DPW_YARD.closeYardModal();
        } else {
            const modal = document.getElementById('yardModalOverlay');
            if (modal) modal.classList.add('hidden');
        }
    }

    function openYardModalWithSelectMode() {
        openYardModal(true);
    }

    async function handleSave(e) {
        e.preventDefault();
        if (isSaving) return;
        isSaving = true;

        const saveBtn = document.getElementById('btnSaveSubmit');
        const originalBtnText = saveBtn ? saveBtn.innerText : "Enregistrer";
        if (saveBtn) {
            saveBtn.innerText = currentLang === 'ar' ? "جاري الحفظ..." : "Enregistrement...";
            saveBtn.disabled = true;
        }

        try {
            const editKey = document.getElementById('editContainerKey').value;
            const now = new Date();
            const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
            const selectedModel = document.getElementById('inpModel').value;
            const inputIdVal = document.getElementById('inpId').value.toUpperCase().trim();
            const agentName = currentUser ? (currentUser.displayName || currentUser.email.split('@')[0]) : 'Pointeur';

            const customData = {};
            const customInputs = document.querySelectorAll('[data-custom-field]');
            customInputs.forEach(input => {
                const fieldName = input.getAttribute('data-custom-field');
                customData[fieldName] = input.value || '-';
            });

            if (editKey) {
                const updatedFields = {
                    id: inputIdVal,
                    containerNumber: inputIdVal,
                    model: selectedModel,
                    type: document.getElementById('inpType').value,
                    status: document.getElementById('inpStatus').value,
                    loc: document.getElementById('inpLoc').value.toUpperCase(),
                    seal: document.getElementById('inpSeal').value.toUpperCase() || 'SL-00000',
                    notes: document.getElementById('inpNotes').value || 'RAS',
                    customData: customData
                };
                if (currentDamagePhotoBase64) {
                    updatedFields.damagePhoto = currentDamagePhotoBase64;
                }

                if (window.DPW_DB && typeof window.DPW_DB.updateContainer === 'function') {
                    await window.DPW_DB.updateContainer(editKey, updatedFields);
                }
                showToast(currentLang === 'ar' ? "✓ تم تحديث بيانات الحاوية" : "✓ Conteneur mis à jour");
            } else {
                const newItem = {
                    id: inputIdVal,
                    containerNumber: inputIdVal,
                    model: selectedModel,
                    stage: 'Stock',
                    type: document.getElementById('inpType').value,
                    loc: document.getElementById('inpLoc').value.toUpperCase(),
                    status: document.getElementById('inpStatus').value,
                    seal: document.getElementById('inpSeal').value.toUpperCase() || 'SL-00000',
                    notes: document.getElementById('inpNotes').value || 'RAS',
                    damagePhoto: currentDamagePhotoBase64 || null,
                    customData: customData,
                    time: timeStr,
                    date: now.toLocaleDateString('fr-FR'),
                    agent: agentName,
                    timestamp: Date.now()
                };

                if (window.DPW_DB && typeof window.DPW_DB.saveContainer === 'function') {
                    await window.DPW_DB.saveContainer(newItem);
                }
                showToast(currentLang === 'ar' ? "✓ تم حفظ الحاوية في IndexedDB!" : "✓ Conteneur enregistré!");
            }

            triggerHapticFeedback();
            filterContainers();
            renderTrackingList();
            updateAccountStats();

            if (window.DPW_YARD && typeof window.DPW_YARD.updateContainers === 'function') {
                window.DPW_YARD.updateContainers();
            }

            closeModal();
        } catch (err) {
            console.error("Erreur enregistrement:", err);
            showToast(err.message || "Erreur lors de l'enregistrement", true);
        } finally {
            if (saveBtn) {
                saveBtn.innerText = originalBtnText;
                saveBtn.disabled = false;
            }
            isSaving = false;
        }
    }

    async function deleteContainer(fbKey) {
        const t = translations[currentLang] || translations.fr;

        // RBAC Check: Only Admin can delete records
        if (window.DPW_DB && typeof window.DPW_DB.hasPermission === 'function') {
            if (!window.DPW_DB.hasPermission('container:delete')) {
                showToast(t.accessDeniedDelete, true);
                return;
            }
        }

        const confirmMsg = currentLang === 'ar' ? "هل تريد حقاً حذف الحاوية نهائياً؟" : "Voulez-vous vraiment supprimer définitivement ce conteneur ?";
        if (confirm(confirmMsg)) {
            try {
                if (window.DPW_DB && typeof window.DPW_DB.deleteContainer === 'function') {
                    await window.DPW_DB.deleteContainer(fbKey);
                }
                filterContainers();
                renderTrackingList();
                updateAccountStats();
                if (window.DPW_YARD && typeof window.DPW_YARD.updateContainers === 'function') {
                    window.DPW_YARD.updateContainers();
                }
                showToast(currentLang === 'ar' ? "تم حذف الحاوية بنجاح" : "Conteneur supprimé avec succès");
            } catch (err) {
                showToast(err.message || "Erreur suppression", true);
            }
        }
    }

    async function updateContainerStage(fbKey, newStage) {
        try {
            if (window.DPW_DB && typeof window.DPW_DB.updateContainerStage === 'function') {
                await window.DPW_DB.updateContainerStage(fbKey, newStage);
            }
            renderTrackingList();
            filterContainers();
            triggerHapticFeedback();
            showToast(currentLang === 'ar' ? `تم تحديث المرحلة: ${newStage}` : `Position mise à jour: ${newStage}`);
        } catch (err) {
            showToast(err.message || "Erreur mise à jour position", true);
        }
    }

    async function archiveShiftData() {
        const t = translations[currentLang] || translations.fr;

        // RBAC Check: Only Admin can archive shift
        if (window.DPW_DB && typeof window.DPW_DB.hasPermission === 'function') {
            if (!window.DPW_DB.hasPermission('shift:archive')) {
                showToast(t.accessDeniedArchive, true);
                return;
            }
        }

        const confirmMsg = currentLang === 'ar' 
            ? "هل تريد أرشفة الوردية ومسح الحاويات من الواجهة لبدء وردية جديدة؟ (تأكد من تصدير الإكسل أولاً)" 
            : "Voulez-vous archiver cette vacation et réinitialiser la liste active ? (Assurez-vous d'avoir exporté l'Excel d'abord)";
        
        if (confirm(confirmMsg)) {
            try {
                if (window.DPW_DB && typeof window.DPW_DB.archiveShiftData === 'function') {
                    await window.DPW_DB.archiveShiftData();
                }
                filterContainers();
                renderTrackingList();
                updateAccountStats();
                if (window.DPW_YARD && typeof window.DPW_YARD.updateContainers === 'function') {
                    window.DPW_YARD.updateContainers();
                }
                showToast(currentLang === 'ar' ? "تمت أرشفة الوردية بنجاح!" : "Vacation archivée avec succès!");
            } catch (err) {
                showToast(err.message || "Erreur archivage", true);
            }
        }
    }

    // ================= 📊 RENDU DES LISTES =================
    function renderList(data = (window.DPW_DB ? window.DPW_DB.containers : [])) {
        const listEl = document.getElementById('containersList');
        if (!listEl) return;

        const currentUid = (window.DPW_DB && typeof window.DPW_DB.getCurrentUserId === 'function') ? window.DPW_DB.getCurrentUserId() : null;
        const isAdminUser = (window.DPW_DB && typeof window.DPW_DB.isAdmin === 'function') ? window.DPW_DB.isAdmin() : false;

        // Normalisation et validation stricte
        const sourceData = (data || [])
            .map(c => {
                if (c && !c.containerNumber && c.id) {
                    return { ...c, containerNumber: c.id };
                }
                return c;
            })
            .filter(c => {
                if (!c || !c.containerNumber || c.containerNumber === 'undefined') return false;
                if (currentUid && c.userId && c.userId !== currentUid) return false;
                return true;
            });

        const countEl = document.getElementById('containerCount');
        if (countEl) countEl.innerText = `${sourceData.length} ${currentLang === 'ar' ? 'حاوية' : 'conteneur(s)'}`;
        listEl.innerHTML = '';

        if (sourceData.length === 0) {
            listEl.innerHTML = `
                <div class="col-span-full text-center py-12 text-gray-500 font-medium text-xs">
                    <i class="fa-solid fa-box-open text-3xl mb-2 block text-gray-600"></i>
                    ${currentLang === 'ar' ? 'لا توجد حاويات مسجلة لهذا الحساب.' : 'Aucun conteneur trouvé pour cette session.'}
                </div>
            `;
            return;
        }

        const t = translations[currentLang] || translations.fr;

        sourceData.forEach((c) => {
            const item = c;
            const isGood = item.status === 'Bon état';
            const badgeClass = isGood ? 'badge-green' : 'badge-red';
            const currentStage = item.stage || 'Stock';
            const isDamaged = !isGood;
            const isReefer = item.type && item.type.includes('RF');
            const numAffiche = item.containerNumber;
            
            let stageBadgeClass = 'stage-stock';
            if (currentStage === 'Navire') stageBadgeClass = 'stage-navire';
            if (currentStage === 'Douane') stageBadgeClass = 'stage-douane';
            if (currentStage === 'Embarqué') stageBadgeClass = 'stage-embarque';

            const stageDisplayName = t.stageNames[currentStage] || currentStage;
            const statusDisplayName = isGood ? t.good : t.damaged;

            let customFieldsHTML = '';
            if (item.customData && Object.keys(item.customData).length > 0) {
                customFieldsHTML = `<div class="flex flex-wrap gap-1.5 pt-1 text-[11px] text-gray-300">`;
                for (const [key, val] of Object.entries(item.customData)) {
                    if (val && val !== '-') customFieldsHTML += `<span class="bg-[#1d2263] px-2 py-0.5 rounded border border-[#303796]"><b>${key}:</b> ${val}</span>`;
                }
                customFieldsHTML += `</div>`;
            }

            let damagePhotoHTML = '';
            if (item.damagePhoto) {
                damagePhotoHTML = `
                    <div class="pt-1">
                        <img src="${item.damagePhoto}" class="w-full h-24 object-cover rounded-xl border border-rose-500/40 cursor-pointer" onclick="window.open('${item.damagePhoto}')" alt="Photo de l'avarie">
                    </div>
                `;
            }

            // RBAC Delete Action Button
            const deleteButtonHTML = isAdminUser
                ? `<button onclick="deleteContainer('${item.firebaseKey}')" class="text-gray-400 hover:text-red-400 p-1.5 transition" title="Supprimer"><i class="fa-solid fa-trash-can text-sm"></i></button>`
                : `<button onclick="showToast('${t.accessDeniedDelete}', true)" class="text-gray-600 cursor-not-allowed p-1.5 opacity-40" title="Suppression réservée aux Administrateurs"><i class="fa-solid fa-lock text-xs"></i></button>`;

            const card = document.createElement('div');
            card.className = `dpw-card p-4 rounded-2xl space-y-2 text-xs shadow-sm relative ${isDamaged ? 'card-damaged' : ''}`;
            card.innerHTML = `
                <div class="flex items-center justify-between">
                    <div class="flex items-center gap-2">
                        <h4 class="font-extrabold text-base tracking-wider text-white font-container-id" dir="ltr">${numAffiche}</h4>
                        <span class="px-2.5 py-0.5 rounded-md font-semibold text-[10px] ${stageBadgeClass}">${stageDisplayName}</span>
                    </div>
                    <div class="flex items-center gap-1.5">
                        <span class="px-2.5 py-1 rounded-full font-bold text-[11px] ${badgeClass}">${statusDisplayName}</span>
                        <button onclick="openEditModal('${item.firebaseKey}')" class="text-gray-400 hover:text-[#00ffaa] p-1.5 transition" title="Modifier"><i class="fa-solid fa-pen-to-square text-sm"></i></button>
                        ${deleteButtonHTML}
                    </div>
                </div>
                <p class="text-gray-400 font-medium text-xs flex items-center gap-1.5">
                    ${isReefer ? '<i class="fa-solid fa-snowflake text-cyan-400" title="Frigorifique (Reefer)"></i>' : ''}
                    <span><b class="text-gray-200">${item.type || '40HC'}</b> • <i class="fa-solid fa-location-dot text-[#00ffaa] text-[10px]"></i> <span class="text-gray-200 font-bold" dir="ltr">${item.loc || 'B1-01-01-1'}</span> • <i class="fa-solid fa-shield-halved text-gray-400 text-[10px]"></i> <span dir="ltr">${item.seal || 'SL-00000'}</span></span>
                </p>
                ${customFieldsHTML}
                ${damagePhotoHTML}
                <div class="flex items-center justify-between text-gray-400 text-[11px] pt-1.5 border-t border-[#252b75]/80">
                    <div class="flex items-center gap-2">
                        <span>${item.time || '--:--'}</span>
                        <span>•</span>
                        <span>${item.date || ''}</span>
                    </div>
                    <span class="text-[10px] text-gray-400 font-mono bg-[#1d2263] px-2 py-0.5 rounded-md border border-[#303796]">${item.agent || 'Pointeur'}</span>
                </div>
            `;
            listEl.appendChild(card);
        });
    }

    function filterContainers() {
        const rawContainers = getCleanContainersList();
        const statusVal = document.getElementById('filterStatus')?.value || 'All';
        const stageVal = document.getElementById('filterStage')?.value || 'All';
        const searchVal = (document.getElementById('liveSearchInput')?.value || '').toLowerCase().trim();

        let filtered = rawContainers.filter(c => c && c.containerNumber && c.containerNumber !== 'undefined');
        if (statusVal !== 'All') filtered = filtered.filter(c => c.status === statusVal);
        if (stageVal !== 'All') filtered = filtered.filter(c => (c.stage || 'Stock') === stageVal);
        if (searchVal) {
            filtered = filtered.filter(c => {
                const num = (c.containerNumber || c.id || '').toLowerCase();
                const loc = (c.loc || '').toLowerCase();
                const seal = (c.seal || '').toLowerCase();
                return num.includes(searchVal) || loc.includes(searchVal) || seal.includes(searchVal);
            });
        }

        renderList(filtered);
    }

    function renderTrackingList() {
        const listEl = document.getElementById('trackingList');
        if (!listEl) return;
        listEl.innerHTML = '';

        const containers = getCleanContainersList()
            .filter(c => c && c.containerNumber && c.containerNumber !== 'undefined');

        if (containers.length === 0) {
            listEl.innerHTML = `<div class="col-span-full text-center py-12 text-gray-500 font-medium text-xs">${currentLang === 'ar' ? 'لا توجد حاويات لتتبعها.' : 'Aucun conteneur à suivre.'}</div>`;
            return;
        }

        const stagesOrder = ['Navire', 'Stock', 'Douane', 'Embarqué'];
        const t = translations[currentLang] || translations.fr;

        containers.forEach((c) => {
            if (!c || !c.containerNumber || c.containerNumber === 'undefined') return;

            const item = c;
            const currentStage = item.stage || 'Navire';
            const stageIndex = stagesOrder.indexOf(currentStage);

            const card = document.createElement('div');
            card.className = "dpw-card p-4 rounded-2xl space-y-3.5 text-xs";

            const getNodeClass = (nodeStage, nodeIdx) => {
                if (nodeStage === currentStage) return 'glow-node-current animate-pulse';
                if (nodeIdx < stageIndex) return 'glow-node-passed';
                return 'glow-node-future';
            };

            const stageDisplayName = t.stageNames[currentStage] || currentStage;

            card.innerHTML = `
                <div class="flex items-center justify-between">
                    <div>
                        <span class="font-extrabold text-base text-white tracking-wider font-container-id" dir="ltr">${item.containerNumber}</span>
                        <p class="text-[10px] text-gray-400 mt-0.5">${item.type || '40HC'} • ${currentLang === 'ar' ? 'الموقع:' : 'Emplacement:'} <b class="text-white" dir="ltr">${item.loc || 'B1-01-01-1'}</b></p>
                    </div>
                    <span class="px-2.5 py-1 rounded-full text-[10px] font-bold ${currentStage === 'Navire' ? 'stage-navire' : currentStage === 'Stock' ? 'stage-stock' : currentStage === 'Douane' ? 'stage-douane' : 'stage-embarque'}">
                        ${stageDisplayName}
                    </span>
                </div>

                <div class="relative flex items-center justify-between pt-2 px-1">
                    <div class="absolute left-5 right-5 top-1/2 -translate-y-1/2 h-1 glow-line-active z-0"></div>

                    <!-- Étape 1: Navire -->
                    <button onclick="updateContainerStage('${item.firebaseKey}', 'Navire')" class="relative z-10 flex flex-col items-center gap-1 focus:outline-none">
                        <div class="w-7 h-7 rounded-full flex items-center justify-center text-[11px] transition-all duration-300 ${getNodeClass('Navire', 0)}">
                            <i class="fa-solid fa-ship"></i>
                        </div>
                        <span class="text-[9px] font-bold ${currentStage === 'Navire' ? 'text-[#00ffaa]' : 'text-gray-300'}">${currentLang === 'ar' ? 'السفينة' : 'Navire'}</span>
                    </button>

                    <!-- Étape 2: Stockage -->
                    <button onclick="updateContainerStage('${item.firebaseKey}', 'Stock')" class="relative z-10 flex flex-col items-center gap-1 focus:outline-none">
                        <div class="w-7 h-7 rounded-full flex items-center justify-center text-[11px] transition-all duration-300 ${getNodeClass('Stock', 1)}">
                            <i class="fa-solid fa-boxes-stacked"></i>
                        </div>
                        <span class="text-[9px] font-bold ${currentStage === 'Stock' ? 'text-[#00ffaa]' : 'text-gray-300'}">${currentLang === 'ar' ? 'الساحة' : 'Stock'}</span>
                    </button>

                    <!-- Étape 3: Douane -->
                    <button onclick="updateContainerStage('${item.firebaseKey}', 'Douane')" class="relative z-10 flex flex-col items-center gap-1 focus:outline-none">
                        <div class="w-7 h-7 rounded-full flex items-center justify-center text-[11px] transition-all duration-300 ${getNodeClass('Douane', 2)}">
                            <i class="fa-solid fa-building-columns"></i>
                        </div>
                        <span class="text-[9px] font-bold ${currentStage === 'Douane' ? 'text-[#00ffaa]' : 'text-gray-300'}">${currentLang === 'ar' ? 'الجمارك' : 'Douane'}</span>
                    </button>

                    <!-- Étape 4: Embarqué / Livré -->
                    <button onclick="updateContainerStage('${item.firebaseKey}', 'Embarqué')" class="relative z-10 flex flex-col items-center gap-1 focus:outline-none">
                        <div class="w-7 h-7 rounded-full flex items-center justify-center text-[11px] transition-all duration-300 ${getNodeClass('Embarqué', 3)}">
                            <i class="fa-solid fa-circle-check"></i>
                        </div>
                        <span class="text-[9px] font-bold ${currentStage === 'Embarqué' ? 'text-[#00ffaa]' : 'text-gray-300'}">${currentLang === 'ar' ? 'خروج' : 'Sortie'}</span>
                    </button>
                </div>
            `;
            listEl.appendChild(card);
        });
    }

    // ================= 📑 TEMPLATES & MODÈLES =================
    function renderModelsList() {
        const listEl = document.getElementById('modelsList');
        if (!listEl) return;
        listEl.innerHTML = '';

        const modelConfigs = (window.DPW_DB && window.DPW_DB.modelConfigs) ? window.DPW_DB.modelConfigs : {};
        const modelTemplates = (window.DPW_DB && window.DPW_DB.modelTemplates) ? window.DPW_DB.modelTemplates : {};
        const templateMappings = (window.DPW_DB && window.DPW_DB.templateMappings) ? window.DPW_DB.templateMappings : {};
        const isAdminUser = (window.DPW_DB && typeof window.DPW_DB.isAdmin === 'function') ? window.DPW_DB.isAdmin() : false;
        const t = translations[currentLang] || translations.fr;

        Object.keys(modelConfigs).forEach(mName => {
            const fields = modelConfigs[mName] || [];
            const hasTemplate = !!modelTemplates[mName];
            const hasMapping = !!templateMappings[mName];

            const card = document.createElement('div');
            card.className = "bg-[#1d2263] p-3.5 rounded-2xl text-xs space-y-2.5 border border-[#303796]";
            
            const deleteModelBtn = isAdminUser
                ? `<button onclick="deleteModel('${mName}')" class="text-gray-400 hover:text-red-400 p-1" title="Supprimer le modèle"><i class="fa-solid fa-trash-can"></i></button>`
                : `<button onclick="showToast('${t.accessDeniedModel}', true)" class="text-gray-600 cursor-not-allowed p-1 opacity-40" title="Réservé aux Administrateurs"><i class="fa-solid fa-lock text-xs"></i></button>`;

            const deleteTemplateBtn = isAdminUser
                ? `<button onclick="deleteTemplate('${mName}')" class="px-2 py-1.5 rounded-lg text-[10px] font-bold flex items-center gap-1 bg-rose-600/20 hover:bg-rose-600 text-rose-400 hover:text-white border border-rose-500/30 transition" title="Supprimer le template Excel"><i class="fa-solid fa-xmark"></i></button>`
                : `<button onclick="showToast('${t.accessDeniedModel}', true)" class="px-2 py-1.5 rounded-lg text-[10px] font-bold flex items-center gap-1 bg-gray-800 text-gray-500 border border-gray-700 cursor-not-allowed opacity-40" title="Réservé aux Administrateurs"><i class="fa-solid fa-lock"></i></button>`;

            card.innerHTML = `
                <div class="flex items-center justify-between">
                    <span class="font-bold text-white text-sm">${mName}</span>
                    <div class="flex items-center gap-1.5">
                        <button onclick="triggerUploadTemplate('${mName}')" class="px-2 py-1.5 rounded-lg text-[10px] font-bold flex items-center gap-1 ${hasTemplate ? 'bg-emerald-600/90 text-white' : 'bg-blue-600/90 text-white'}" title="${hasTemplate ? 'Remplacer le template' : 'Upload Template'}">
                            <i class="fa-solid fa-file-excel"></i>
                            <span>${hasTemplate ? 'Template ✓' : '+ Template'}</span>
                        </button>
                        ${hasTemplate ? `
                            <button onclick="openMappingModal('${mName}')" class="px-2 py-1.5 rounded-lg text-[10px] font-bold flex items-center gap-1 bg-[#15194a] text-[#00ffaa] border border-[#00ffaa]/40" title="Configurer les colonnes">
                                <i class="fa-solid fa-table-cells"></i>
                                <span>${hasMapping ? 'Colonnes ✓' : 'Mapping'}</span>
                            </button>
                            ${deleteTemplateBtn}
                        ` : ''}
                        ${deleteModelBtn}
                    </div>
                </div>
                <div class="flex flex-wrap gap-1.5 pt-1">
                    ${fields.map(f => `<span class="bg-[#15194a] text-gray-300 px-2 py-0.5 rounded-md border border-[#252b75] text-[10px]">${f}</span>`).join('')}
                </div>
            `;
            listEl.appendChild(card);
        });
    }

    async function addNewModel() {
        const inp = document.getElementById('inpNewModel');
        const val = inp ? inp.value.trim() : '';
        const modelConfigs = (window.DPW_DB && window.DPW_DB.modelConfigs) ? window.DPW_DB.modelConfigs : {};

        if (val && !modelConfigs[val]) {
            try {
                if (window.DPW_DB && typeof window.DPW_DB.saveModelConfigs === 'function') {
                    await window.DPW_DB.saveModelConfigs(val, []);
                }
                if (inp) inp.value = '';
                renderModelsList();
                populateModelSelect();
                showToast(currentLang === 'ar' ? `تم إنشاء النموذج "${val}"!` : `Modèle "${val}" créé avec succès!`);
            } catch (err) {
                showToast(err.message || "Erreur création modèle", true);
            }
        }
    }

    async function deleteModel(modelName) {
        const t = translations[currentLang] || translations.fr;
        if (window.DPW_DB && typeof window.DPW_DB.hasPermission === 'function') {
            if (!window.DPW_DB.hasPermission('model:delete')) {
                showToast(t.accessDeniedModel, true);
                return;
            }
        }

        const confirmMsg = currentLang === 'ar' ? `هل تريد بالتأكيد حذف النموذج "${modelName}" ؟` : `Voulez-vous vraiment supprimer le modèle "${modelName}" ?`;
        if (confirm(confirmMsg)) {
            try {
                if (window.DPW_DB && typeof window.DPW_DB.deleteModel === 'function') {
                    await window.DPW_DB.deleteModel(modelName);
                }
                renderModelsList();
                populateModelSelect();
                showToast(currentLang === 'ar' ? `تم حذف النموذج "${modelName}"` : `Modèle "${modelName}" supprimé`);
            } catch (err) {
                showToast(err.message || "Erreur suppression modèle", true);
            }
        }
    }

    function triggerUploadTemplate(modelName) {
        currentUploadTemplateTarget = modelName;
        const input = document.getElementById('templateFileInput');
        if (input) {
            input.value = '';
            input.click();
        }
    }

    async function handleTemplateUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        const progressOverlay = document.getElementById('uploadProgressOverlay');
        const progressBar = document.getElementById('globalProgressBar');
        const progressPercent = document.getElementById('globalProgressPercent');
        const progressTitle = document.getElementById('uploadProgressTitle');

        if (progressOverlay) progressOverlay.classList.remove('hidden');
        if (progressBar) progressBar.style.width = '15%';
        if (progressPercent) progressPercent.innerText = '15%';
        if (progressTitle) progressTitle.innerText = currentLang === 'ar' ? `جاري قراءة قالب (${currentUploadTemplateTarget})...` : `Lecture du template (${currentUploadTemplateTarget})...`;

        try {
            if (window.DPW_EXCEL && typeof window.DPW_EXCEL.parseAndValidateTemplate === 'function') {
                const { base64 } = await window.DPW_EXCEL.parseAndValidateTemplate(file, (percent) => {
                    if (progressBar) progressBar.style.width = `${percent}%`;
                    if (progressPercent) progressPercent.innerText = `${percent}%`;
                });

                if (progressTitle) progressTitle.innerText = currentLang === 'ar' ? "حفظ القالب في IndexedDB..." : "Enregistrement dans IndexedDB...";
                if (window.DPW_DB && typeof window.DPW_DB.saveModelTemplate === 'function') {
                    await window.DPW_DB.saveModelTemplate(currentUploadTemplateTarget, base64);
                }

                if (progressBar) progressBar.style.width = '100%';
                if (progressPercent) progressPercent.innerText = '100%';

                setTimeout(() => {
                    if (progressOverlay) progressOverlay.classList.add('hidden');
                    if (progressBar) progressBar.style.width = '0%';
                    showToast(currentLang === 'ar' ? `✓ تم حفظ قالب "${currentUploadTemplateTarget}" بنجاح!` : `✓ Template "${currentUploadTemplateTarget}" validé et prêt!`);
                    renderModelsList();
                    openMappingModal(currentUploadTemplateTarget);
                }, 400);
            }
        } catch (err) {
            console.error("Erreur chargement template:", err);
            if (progressOverlay) progressOverlay.classList.add('hidden');
            if (progressBar) progressBar.style.width = '0%';
            showToast(currentLang === 'ar' ? "خطأ: الملف غير متوافق أو تالف" : "Erreur: Fichier Excel corrompu ou illisible", true);
        }
    }

    async function deleteTemplate(modelName) {
        const t = translations[currentLang] || translations.fr;
        if (window.DPW_DB && typeof window.DPW_DB.hasPermission === 'function') {
            if (!window.DPW_DB.hasPermission('template:delete')) {
                showToast(t.accessDeniedModel, true);
                return;
            }
        }

        const confirmMsg = currentLang === 'ar' 
            ? `هل تريد بالتأكيد حذف ملف قالب الإكسل للنموذج "${modelName}"؟` 
            : `Voulez-vous vraiment supprimer le fichier template Excel de "${modelName}" ?`;
        
        if (confirm(confirmMsg)) {
            try {
                if (window.DPW_DB && typeof window.DPW_DB.deleteModelTemplate === 'function') {
                    await window.DPW_DB.deleteModelTemplate(modelName);
                }
                renderModelsList();
                showToast(currentLang === 'ar' ? `✓ تم حذف قالب "${modelName}"` : `✓ Template "${modelName}" supprimé`);
            } catch (err) {
                showToast(err.message || "Erreur suppression template", true);
            }
        }
    }

    function openMappingModal(modelName) {
        document.body.classList.add('modal-open');
        document.getElementById('mappingModelKey').value = modelName;
        document.getElementById('txtMappingTargetModel').innerText = `Modèle : ${modelName}`;
        
        const templateMappings = (window.DPW_DB && window.DPW_DB.templateMappings) ? window.DPW_DB.templateMappings : {};
        const savedMapping = templateMappings[modelName] || {
            startRow: 2,
            columns: {
                id: 'A',
                type: 'B',
                loc: 'C',
                seal: 'D',
                status: 'E',
                date: 'F',
                time: 'G',
                agent: 'H',
                notes: 'I'
            }
        };

        document.getElementById('mappingStartRow').value = savedMapping.startRow || 2;
        const container = document.getElementById('mappingFieldsContainer');
        container.innerHTML = '';

        const standardFields = [
            { key: 'id', label: 'N° Conteneur (ID)', defaultCol: 'A' },
            { key: 'type', label: 'Type & Taille', defaultCol: 'B' },
            { key: 'loc', label: 'Emplacement Parc', defaultCol: 'C' },
            { key: 'seal', label: 'N° Plomb (Seal)', defaultCol: 'D' },
            { key: 'status', label: 'État (Statut)', defaultCol: 'E' },
            { key: 'date', label: 'Date Pointage', defaultCol: 'F' },
            { key: 'time', label: 'Heure Pointage', defaultCol: 'G' },
            { key: 'agent', label: 'Agent Pointeur', defaultCol: 'H' },
            { key: 'notes', label: 'Remarques', defaultCol: 'I' }
        ];

        const colOptions = ['None', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'];

        standardFields.forEach(f => {
            const currentVal = savedMapping.columns ? (savedMapping.columns[f.key] || f.defaultCol) : f.defaultCol;
            const div = document.createElement('div');
            div.className = "bg-[#15194a] p-2 rounded-lg border border-[#252b75]";
            div.innerHTML = `
                <label class="block text-[11px] font-semibold text-gray-200 mb-1">${f.label}</label>
                <select data-mapping-key="${f.key}" class="w-full input-dpw p-1.5 rounded text-xs font-bold text-[#00ffaa]">
                    ${colOptions.map(c => `<option value="${c}" ${c === currentVal ? 'selected' : ''}>Colonne ${c}</option>`).join('')}
                </select>
            `;
            container.appendChild(div);
        });

        const modelConfigs = (window.DPW_DB && window.DPW_DB.modelConfigs) ? window.DPW_DB.modelConfigs : {};
        const customFields = modelConfigs[modelName] || [];
        customFields.forEach((cf, idx) => {
            const customKey = `custom_${cf}`;
            const autoCol = colOptions[10 + idx] || 'J';
            const currentVal = savedMapping.columns ? (savedMapping.columns[customKey] || autoCol) : autoCol;
            
            const div = document.createElement('div');
            div.className = "bg-[#15194a] p-2 rounded-lg border border-amber-500/40";
            div.innerHTML = `
                <label class="block text-[11px] font-semibold text-amber-300 mb-1">${cf} (Specifique)</label>
                <select data-mapping-key="${customKey}" class="w-full input-dpw p-1.5 rounded text-xs font-bold text-amber-400">
                    ${colOptions.map(c => `<option value="${c}" ${c === currentVal ? 'selected' : ''}>Colonne ${c}</option>`).join('')}
                </select>
            `;
            container.appendChild(div);
        });

        document.getElementById('templateMappingModal').classList.remove('hidden');
    }

    function closeMappingModal() {
        document.body.classList.remove('modal-open');
        document.getElementById('templateMappingModal').classList.add('hidden');
    }

    async function saveTemplateMapping(e) {
        e.preventDefault();
        const modelName = document.getElementById('mappingModelKey').value;
        const startRow = parseInt(document.getElementById('mappingStartRow').value, 10) || 2;

        const columns = {};
        const selects = document.querySelectorAll('[data-mapping-key]');
        selects.forEach(s => {
            const key = s.getAttribute('data-mapping-key');
            const val = s.value;
            if (val !== 'None') {
                columns[key] = val;
            }
        });

        try {
            if (window.DPW_DB && typeof window.DPW_DB.saveTemplateMapping === 'function') {
                await window.DPW_DB.saveTemplateMapping(modelName, { startRow, columns });
            }
            closeMappingModal();
            renderModelsList();
            showToast(`✓ Configuration enregistrée pour "${modelName}"`);
        } catch (err) {
            showToast(err.message || "Erreur enregistrement mapping", true);
        }
    }

    // ================= 📥 EXPORTATION EXCEL =================
    function openExportModal() {
        document.body.classList.add('modal-open');
        document.getElementById('exportModalOverlay').classList.remove('hidden');
    }

    function closeExportModal() {
        document.body.classList.remove('modal-open');
        document.getElementById('exportModalOverlay').classList.add('hidden');
    }

    async function executeAdvancedExport() {
        const stageFilter = document.getElementById('exportFilterStage').value;
        const modelFilter = document.getElementById('exportFilterModel').value;

        if (window.DPW_EXCEL && typeof window.DPW_EXCEL.export === 'function') {
            const result = await window.DPW_EXCEL.export({
                containers: getCleanContainersList(),
                modelConfigs: window.DPW_DB ? window.DPW_DB.modelConfigs : {},
                modelTemplates: window.DPW_DB ? window.DPW_DB.modelTemplates : {},
                templateMappings: window.DPW_DB ? window.DPW_DB.templateMappings : {},
                stageFilter,
                modelFilter
            });

            if (!result.success) {
                if (result.reason === 'empty') {
                    showToast(currentLang === 'ar' ? "لا توجد حاويات تطابق شروط التصدير" : "Aucun conteneur ne correspond à ces critères.", true);
                } else {
                    showToast("Erreur lors de l'exportation Excel", true);
                }
                return;
            }

            closeExportModal();
            if (result.mode === 'template') {
                showToast(currentLang === 'ar' ? "✓ تم ملء وتنزيل قالب الشركة بنجاح!" : "✓ Template officiel rempli et téléchargé!");
            } else {
                showToast(currentLang === 'ar' ? "✓ تم تنزيل تقرير الإكسل القياسي!" : "✓ Rapport Excel généré!");
            }
        }
    }

    // Enregistrement du Service Worker PWA
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./sw.js')
                .then(() => console.log('✓ Service Worker PWA actif'))
                .catch(err => console.log('SW Error:', err));
        });
    }

    // Exposition globale des méthodes pour les événements HTML (onclick, onchange...)
    window.switchAuthTab = switchAuthTab;
    window.handleAuthAction = handleAuthAction;
    window.logoutFirebase = logoutFirebase;
    window.setLanguage = setLanguage;
    window.switchTab = switchTab;
    window.showToast = showToast;
    window.triggerHapticFeedback = triggerHapticFeedback;
    window.forceRefreshApp = forceRefreshApp;
    window.validateISOContainer = validateISOContainer;
    window.triggerCameraOCR = triggerCameraOCR;
    window.triggerBarcodeScan = triggerBarcodeScan;
    window.processOCRImage = processOCRImage;
    window.toggleDamageSection = toggleDamageSection;
    window.handleDamagePhoto = handleDamagePhoto;
    window.removeDamagePhoto = removeDamagePhoto;
    window.populateModelSelect = populateModelSelect;
    window.updateDynamicFormFields = updateDynamicFormFields;
    window.openModal = openModal;
    window.openEditModal = openEditModal;
    window.closeModal = closeModal;
    window.openYardModal = openYardModal;
    window.closeYardModal = closeYardModal;
    window.openYardModalWithSelectMode = openYardModalWithSelectMode;
    window.handleSave = handleSave;
    window.deleteContainer = deleteContainer;
    window.updateContainerStage = updateContainerStage;
    window.archiveShiftData = archiveShiftData;
    window.filterContainers = filterContainers;
    window.renderTrackingList = renderTrackingList;
    window.renderModelsList = renderModelsList;
    window.addNewModel = addNewModel;
    window.deleteModel = deleteModel;
    window.triggerUploadTemplate = triggerUploadTemplate;
    window.handleTemplateUpload = handleTemplateUpload;
    window.deleteTemplate = deleteTemplate;
    window.openMappingModal = openMappingModal;
    window.closeMappingModal = closeMappingModal;
    window.saveTemplateMapping = saveTemplateMapping;
    window.openExportModal = openExportModal;
    window.closeExportModal = closeExportModal;
    window.executeAdvancedExport = executeAdvancedExport;

})(window);
