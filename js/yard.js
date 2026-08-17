/**
 * DP WORLD DJENDJEN - CONTAINER TALLYING PWA
 * Moteur de Matrice Visuelle du Parc à Conteneurs (Yard 2D Engine)
 * Terminologie Maritime Francophone Unifiée (Bloc, Travée, Rangée, Hauteur, Occupé, Disponible)
 */

(function(window) {
    'use strict';

    // Configuration des Blocs du Parc Portuaire DP World Djendjen
    const CONFIG_PARC = {
        blocs: {
            'A': { nom: 'BLOC A (Standard)', type: 'Dry', travees: 24, rangees: 6, maxHauteurs: 4, typeDefaut: "40' HC" },
            'B': { nom: 'BLOC B (Standard)', type: 'Dry', travees: 24, rangees: 6, maxHauteurs: 4, typeDefaut: "20' ST" },
            'C': { nom: 'BLOC C (Vides)', type: 'Empty', travees: 20, rangees: 6, maxHauteurs: 5, typeDefaut: "20' ST" },
            'R': { nom: 'BLOC R (Frigorifique)', type: 'Reefer', travees: 16, rangees: 4, maxHauteurs: 3, typeDefaut: "40' RF" }
        }
    };

    // État interne du module Parc
    let blocActif = 'A';
    let traveeActive = 1;
    let filtreActif = 'all';
    let requeteRecherche = '';
    let slotSelectionne = null;
    let modeSelectionSeule = false; // Activé lorsque appelé depuis le formulaire de pointage ("Choisir sur Parc")

    // ================= 🧭 ANALYSEUR & NORMALISATEUR D'EMPLACEMENT =================
    /**
     * Analyse tout format d'emplacement saisi par les pointeurs et le convertit
     * en coordonnées structurées : { bloc, travee, rangee, hauteur, standard }
     * Formats supportés :
     * - A-T01-R04-H2, B01-R04-H2, B01-R04-T2, A-01-04-02
     * - BLOC A TRAVEE 01 RANGEE 04 HAUTEUR 02
     * - 01-04-02, B1-R4-H2
     */
    function analyserEmplacement(locStr) {
        if (!locStr || typeof locStr !== 'string') {
            return null;
        }

        const texte = locStr.trim().toUpperCase();

        // 1. Format Complet : [Bloc]-[Travée/Bay]-[Rangée/Row]-[Hauteur/Tier]
        // Exemples : A-T01-R04-H2, A-B01-R04-T2, B-01-04-02
        const matchComplet = texte.match(/^([ABCR])-?(?:T|B)?(\d{1,2})-?R?(\d{1,2})-?(?:H|T)?(\d{1,2})$/);
        if (matchComplet) {
            return {
                bloc: matchComplet[1],
                travee: parseInt(matchComplet[2], 10),
                rangee: parseInt(matchComplet[3], 10),
                hauteur: parseInt(matchComplet[4], 10),
                standard: `${matchComplet[1]}-T${String(matchComplet[2]).padStart(2, '0')}-R${String(matchComplet[3]).padStart(2, '0')}-H${matchComplet[4]}`
            };
        }

        // 2. Format 3 éléments : T[Travée]-R[Rangée]-H[Hauteur] ou B[Bay]-R[Row]-T[Tier]
        // Exemples : T01-R04-H2, B01-R04-T2, 01-04-02
        const matchCourt = texte.match(/^(?:T|B)?(\d{1,2})-?R?(\d{1,2})-?(?:H|T)?(\d{1,2})$/);
        if (matchCourt) {
            const blk = blocActif || 'A';
            return {
                bloc: blk,
                travee: parseInt(matchCourt[1], 10),
                rangee: parseInt(matchCourt[2], 10),
                hauteur: parseInt(matchCourt[3], 10),
                standard: `${blk}-T${String(matchCourt[1]).padStart(2, '0')}-R${String(matchCourt[2]).padStart(2, '0')}-H${matchCourt[3]}`
            };
        }

        // 3. Format texte naturel : "BLOC A TRAVEE 01 RANGEE 04 HAUTEUR 02"
        const matchTexte = texte.match(/(?:BLOC|BLOCK)?\s*([ABCR])?\s*(?:TRAVEE|TRAVÉE|BAY|T|B)?\s*(\d{1,2})\s*(?:RANGEE|RANGÉE|ROW|R)?\s*(\d{1,2})\s*(?:HAUTEUR|TIER|H|T)?\s*(\d{1,2})/);
        if (matchTexte && matchTexte[2] && matchTexte[3] && matchTexte[4]) {
            const blk = matchTexte[1] || blocActif || 'A';
            return {
                bloc: blk,
                travee: parseInt(matchTexte[2], 10),
                rangee: parseInt(matchTexte[3], 10),
                hauteur: parseInt(matchTexte[4], 10),
                standard: `${blk}-T${String(matchTexte[2]).padStart(2, '0')}-R${String(matchTexte[3]).padStart(2, '0')}-H${matchTexte[4]}`
            };
        }

        return null;
    }

    function genererCleSlot(bloc, travee, rangee, hauteur) {
        return `${bloc}_${parseInt(travee, 10)}_${parseInt(rangee, 10)}_${parseInt(hauteur, 10)}`;
    }

    function formaterEmplacementMaritime(bloc, travee, rangee, hauteur) {
        return `${bloc}-T${String(travee).padStart(2, '0')}-R${String(rangee).padStart(2, '0')}-H${hauteur}`;
    }

    // ================= 🏗️ MAPPAGE DU PARC & FILTRAGE STRICT =================
    function construireCarteParc() {
        const rawContainers = (window.DPW_DB && Array.isArray(window.DPW_DB.containers)) 
            ? window.DPW_DB.containers 
            : JSON.parse(localStorage.getItem('dpw_local_containers') || '[]');

        // Filtre strict anti-undefined et normalisation
        const conteneurs = (rawContainers || [])
            .map(c => {
                if (!c) return null;
                const num = String(c.containerNumber || c.id || '').trim();
                return { ...c, containerNumber: num, id: num };
            })
            .filter(c => c && c.containerNumber && c.containerNumber.trim() !== '' && c.containerNumber !== 'undefined' && c.containerNumber !== 'null');

        const carteSlots = new Map();
        const indexConteneurs = [];

        conteneurs.forEach(c => {
            if (!c.loc) return;
            const pos = analyserEmplacement(c.loc);
            if (pos) {
                const cle = genererCleSlot(pos.bloc, pos.travee, pos.rangee, pos.hauteur);
                carteSlots.set(cle, c);
                indexConteneurs.push({
                    pos,
                    conteneur: c
                });
            }
        });

        return { carteSlots, indexConteneurs };
    }

    function peuplerSelecteurTravees() {
        const selectEl = document.getElementById('yardBaySelect');
        if (!selectEl) return;

        const config = CONFIG_PARC.blocs[blocActif] || CONFIG_PARC.blocs['A'];
        const total = config.travees;

        selectEl.innerHTML = '';
        for (let t = 1; t <= total; t++) {
            const opt = document.createElement('option');
            opt.value = t;
            const descriptionTaille = t % 2 === 0 ? " (40' HC)" : " (20' ST)";
            opt.innerText = `Travée ${String(t).padStart(2, '0')}${descriptionTaille}`;
            if (t === traveeActive) opt.selected = true;
            selectEl.appendChild(opt);
        }
    }

    // ================= 🎨 RENDU DE LA GRILLE DU PARC (2D MATRIX) =================
    function afficherGrilleParc(cleSurbrillance = null) {
        const conteneurGrille = document.getElementById('yardGridContainer');
        if (!conteneurGrille) return;

        const config = CONFIG_PARC.blocs[blocActif] || CONFIG_PARC.blocs['A'];
        const nbRangees = config.rangees;
        const nbHauteurs = config.maxHauteurs;
        const { carteSlots } = construireCarteParc();

        // Calcul des statistiques de la travée
        let nbOccupes = 0;
        let nbAvaries = 0;
        let nbFrigorifiques = 0;
        const totalSlots = nbRangees * nbHauteurs;

        for (let r = 1; r <= nbRangees; r++) {
            for (let h = 1; h <= nbHauteurs; h++) {
                const k = genererCleSlot(blocActif, traveeActive, r, h);
                const item = carteSlots.get(k);
                if (item) {
                    nbOccupes++;
                    if (item.status === 'Endommagé') nbAvaries++;
                    if (item.type && item.type.includes('RF')) nbFrigorifiques++;
                }
            }
        }

        const nbDisponibles = totalSlots - nbOccupes;
        const tauxOccupation = totalSlots > 0 ? Math.round((nbOccupes / totalSlots) * 100) : 0;

        // Mise à jour de l'indicateur d'occupation & badges
        const occRateEl = document.getElementById('yardOccupancyRate');
        if (occRateEl) {
            occRateEl.innerText = `${tauxOccupation}% OCCUPÉ (${nbOccupes}/${totalSlots})`;
        }

        if (document.getElementById('countFilterAll')) document.getElementById('countFilterAll').innerText = totalSlots;
        if (document.getElementById('countFilterOccupied')) document.getElementById('countFilterOccupied').innerText = nbOccupes;
        if (document.getElementById('countFilterEmpty')) document.getElementById('countFilterEmpty').innerText = nbDisponibles;
        if (document.getElementById('countFilterDamaged')) document.getElementById('countFilterDamaged').innerText = nbAvaries;
        if (document.getElementById('countFilterReefer')) document.getElementById('countFilterReefer').innerText = nbFrigorifiques;

        // Construction du tableau matriciel (Hauteurs du haut vers le bas, Rangées de gauche à droite)
        let html = `
            <div class="w-full overflow-x-auto pb-2">
                <table class="yard-matrix-table mx-auto">
                    <thead>
                        <tr>
                            <th class="p-1 w-10 sm:w-12 text-center text-[10px] text-gray-400 font-bold">HAUTEUR</th>
                            ${Array.from({ length: nbRangees }, (_, i) => `
                                <th class="p-1 text-center">
                                    <div class="yard-row-badge">
                                        R${String(i + 1).padStart(2, '0')}
                                    </div>
                                </th>
                            `).join('')}
                            <th class="p-1 w-10 sm:w-12 text-center text-[10px] text-gray-400 font-bold">HAUTEUR</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        // Rendu vertical des hauteurs : de la plus haute (ex: H4) vers le sol (H1)
        for (let h = nbHauteurs; h >= 1; h--) {
            html += `
                <tr>
                    <td class="p-1 align-middle">
                        <div class="yard-tier-badge">H${h}</div>
                    </td>
            `;

            for (let r = 1; r <= nbRangees; r++) {
                const cleSlot = genererCleSlot(blocActif, traveeActive, r, h);
                const conteneur = carteSlots.get(cleSlot);
                const estOccupe = !!conteneur;
                const estEnSurbrillance = cleSurbrillance === cleSlot;

                // Filtrage visuel
                let estAttenue = false;
                if (filtreActif === 'occupied' && !estOccupe) estAttenue = true;
                if (filtreActif === 'empty' && estOccupe) estAttenue = true;
                if (filtreActif === 'damaged' && (!estOccupe || conteneur.status !== 'Endommagé')) estAttenue = true;
                if (filtreActif === 'reefer' && (!estOccupe || !conteneur.type || !conteneur.type.includes('RF'))) estAttenue = true;

                if (estOccupe) {
                    const estAvarie = conteneur.status === 'Endommagé';
                    const estFrigo = conteneur.type && conteneur.type.includes('RF');
                    const idAffiche = conteneur.containerNumber || conteneur.id || '';
                    
                    let classeSlot = 'yard-slot-good';
                    if (estAvarie) classeSlot = 'yard-slot-damaged';
                    else if (estFrigo) classeSlot = 'yard-slot-reefer';

                    html += `
                        <td class="p-1 align-middle">
                            <div onclick="DPW_YARD.onSlotClicked('${blocActif}', ${traveeActive}, ${r}, ${h})" 
                                 id="slot_${cleSlot}"
                                 class="yard-slot yard-slot-occupied ${classeSlot} ${estEnSurbrillance ? 'yard-slot-active-target' : ''} ${estAttenue ? 'yard-slot-dimmed' : ''}"
                                 title="Conteneur : ${idAffiche} (${conteneur.type}) - ${conteneur.status}">
                                
                                <div class="flex items-center justify-between pointer-events-none">
                                    <span class="text-[9.5px] font-black font-container-id text-white truncate max-w-[85px] tracking-wide" dir="ltr">
                                        ${idAffiche}
                                    </span>
                                    <span class="text-[8px] font-extrabold px-1 rounded bg-black/40 text-[#00ffaa]">
                                        ${conteneur.type ? conteneur.type.split(' ')[0] : "40'"}
                                    </span>
                                </div>

                                <div class="flex items-center justify-between text-[8px] text-gray-300 font-semibold pointer-events-none">
                                    <span class="flex items-center gap-0.5">
                                        ${estFrigo ? '<i class="fa-solid fa-snowflake text-cyan-300 text-[9px]" title="Frigorifique"></i>' : ''}
                                        ${estAvarie ? '<i class="fa-solid fa-triangle-exclamation text-rose-300 text-[9px]" title="Avarié"></i>' : ''}
                                        <span dir="ltr">${conteneur.seal ? conteneur.seal.substring(0, 7) : 'SL-00'}</span>
                                    </span>
                                    <span class="text-[7.5px] font-mono text-gray-400">R${r}H${h}</span>
                                </div>
                            </div>
                        </td>
                    `;
                } else {
                    html += `
                        <td class="p-1 align-middle">
                            <div onclick="DPW_YARD.onSlotClicked('${blocActif}', ${traveeActive}, ${r}, ${h})" 
                                 id="slot_${cleSlot}"
                                 class="yard-slot yard-slot-empty ${estEnSurbrillance ? 'yard-slot-active-target' : ''} ${estAttenue ? 'yard-slot-dimmed' : ''}"
                                 title="Emplacement Libre : Rangée ${r} - Hauteur ${h} (Cliquer pour assigner)">
                                
                                <div class="flex items-center justify-between text-[8px] text-gray-500 font-mono font-bold pointer-events-none">
                                    <span>R${r}H${h}</span>
                                    <span class="text-[7.5px] text-emerald-400/80 font-bold">DISPONIBLE</span>
                                </div>

                                <div class="w-full flex items-center justify-center py-0.5 yard-empty-plus pointer-events-none text-emerald-400">
                                    <i class="fa-solid fa-plus text-xs"></i>
                                </div>

                                <div class="text-[7.5px] text-center text-gray-400/80 font-semibold pointer-events-none">
                                    ${config.typeDefaut}
                                </div>
                            </div>
                        </td>
                    `;
                }
            }

            html += `
                    <td class="p-1 align-middle">
                        <div class="yard-tier-badge">H${h}</div>
                    </td>
                </tr>
            `;
        }

        // Voie de circulation au sol
        html += `
                    </tbody>
                </table>

                <!-- Voie de circulation portuaire au sol -->
                <div class="max-w-3xl mx-auto h-3.5 mt-2.5 yard-ground-track flex items-center justify-center">
                    <span class="text-[8px] font-extrabold tracking-widest text-[#00ffaa]/80 uppercase">SOL DU PARC - VOIE DE CIRCULATION QUAI</span>
                </div>
            </div>
        `;

        conteneurGrille.innerHTML = html;
    }

    // ================= 🔍 INSPECTION & GESTION DES SLOTS =================
    function onSlotClicked(bloc, travee, rangee, hauteur) {
        const cleSlot = genererCleSlot(bloc, travee, rangee, hauteur);
        const { carteSlots } = construireCarteParc();
        const conteneur = carteSlots.get(cleSlot);
        const locMaritime = formaterEmplacementMaritime(bloc, travee, rangee, hauteur);

        slotSelectionne = { bloc, travee, rangee, hauteur, locMaritime, conteneur };

        const inspecteurEl = document.getElementById('yardSlotInspector');
        const contenuEl = document.getElementById('yardInspectorContent');
        if (!inspecteurEl || !contenuEl) return;

        if (window.triggerHapticFeedback) window.triggerHapticFeedback();

        if (conteneur) {
            // ================= 📦 SLOT OCCUPÉ : DÉTAILS & ACTIONS =================
            const estBonEtat = conteneur.status === 'Bon état';
            const estFrigo = conteneur.type && conteneur.type.includes('RF');
            const idAffiche = conteneur.containerNumber || conteneur.id || '';

            let vignettePhoto = '';
            if (conteneur.damagePhoto) {
                vignettePhoto = `
                    <img src="${conteneur.damagePhoto}" onclick="window.open('${conteneur.damagePhoto}')" class="w-12 h-12 rounded-xl object-cover border border-rose-500/60 cursor-pointer shrink-0" title="Agrandir la photo d'avarie">
                `;
            }

            contenuEl.innerHTML = `
                <div class="flex items-center gap-3">
                    ${vignettePhoto}
                    <div>
                        <div class="flex items-center gap-2">
                            <span class="font-extrabold text-sm sm:text-base text-white font-container-id tracking-wider" dir="ltr">${idAffiche}</span>
                            <span class="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold ${estBonEtat ? 'bg-emerald-600/90 text-white' : 'bg-rose-600/90 text-white'}">
                                ${conteneur.status}
                            </span>
                            ${estFrigo ? '<span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-cyan-600/90 text-white"><i class="fa-solid fa-snowflake"></i> Frigo</span>' : ''}
                        </div>
                        <p class="text-[11px] text-gray-300 mt-0.5">
                            Emplacement: <span class="text-[#00ffaa] font-bold font-mono" dir="ltr">${locMaritime}</span> • Type: <b class="text-white">${conteneur.type}</b> • Plomb: <b class="text-white" dir="ltr">${conteneur.seal || 'SL-00000'}</b>
                        </p>
                        <p class="text-[10px] text-gray-400">
                            Pointeur: <b class="text-gray-200">${conteneur.agent || 'Pointeur'}</b> • Date: ${conteneur.date || '-'} ${conteneur.time || ''}
                        </p>
                    </div>
                </div>

                <div class="flex items-center gap-2">
                    <button onclick="DPW_YARD.modifierConteneur('${conteneur.firebaseKey}')" class="btn-dpw-green px-3.5 py-2.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 shadow active:scale-95 transition" title="Modifier les données du conteneur">
                        <i class="fa-solid fa-pen-to-square"></i>
                        <span>Modifier</span>
                    </button>

                    <button onclick="DPW_YARD.deplacerConteneur('${conteneur.firebaseKey}', '${idAffiche}', '${locMaritime}')" class="bg-[#1d2263] hover:bg-[#252b75] text-[#00ffaa] border border-[#00ffaa]/50 px-3.5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-1.5 active:scale-95 transition" title="Déplacer vers un autre slot">
                        <i class="fa-solid fa-arrows-up-down-left-right"></i>
                        <span>Déplacer</span>
                    </button>

                    <button onclick="DPW_YARD.retirerConteneur('${conteneur.firebaseKey}', '${idAffiche}')" class="bg-rose-600/20 hover:bg-rose-600 text-rose-400 hover:text-white border border-rose-500/40 px-3.5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-1.5 active:scale-95 transition" title="Retirer ou libérer ce slot">
                        <i class="fa-solid fa-truck-ramp-box"></i>
                        <span>Retirer</span>
                    </button>

                    <button onclick="DPW_YARD.fermerInspecteur()" class="text-gray-400 hover:text-white p-2 text-sm">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>
            `;
        } else {
            // ================= 🟢 SLOT DISPONIBLE : ASSIGNATION RAPIDE =================
            contenuEl.innerHTML = `
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-xl bg-[#1d2263] border border-[#00ffaa]/40 flex items-center justify-center text-[#00ffaa] font-black text-base shadow">
                        <i class="fa-solid fa-map-pin"></i>
                    </div>
                    <div>
                        <h4 class="font-extrabold text-sm text-white">Emplacement Disponible</h4>
                        <p class="text-[11px] text-gray-300 font-mono">
                            Slot: <span class="text-[#00ffaa] font-bold" dir="ltr">${locMaritime}</span> (${CONFIG_PARC.blocs[bloc].nom})
                        </p>
                    </div>
                </div>

                <div class="flex items-center gap-2">
                    <button onclick="DPW_YARD.assignerConteneurAuSlot('${locMaritime}')" class="btn-dpw-gradient px-4 py-2.5 rounded-xl text-xs font-black flex items-center gap-2 shadow-lg active:scale-95 transition">
                        <i class="fa-solid fa-plus"></i>
                        <span>Assigner un Conteneur</span>
                    </button>
                    <button onclick="DPW_YARD.fermerInspecteur()" class="text-gray-400 hover:text-white p-2 text-sm">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>
            `;
        }

        inspecteurEl.classList.remove('hidden');
    }

    function fermerInspecteur() {
        const inspecteurEl = document.getElementById('yardSlotInspector');
        if (inspecteurEl) inspecteurEl.classList.add('hidden');
    }

    // ================= 📝 ACTIONS UTILISATEUR & PERSISTANCE =================
    function assignerConteneurAuSlot(locMaritime) {
        closeYardModal();
        if (modeSelectionSeule) {
            const inp = document.getElementById('inpLoc');
            if (inp) inp.value = locMaritime;
            modeSelectionSeule = false;
        } else {
            if (window.openModal) {
                window.openModal();
                const inp = document.getElementById('inpLoc');
                if (inp) inp.value = locMaritime;
                
                // Pré-sélectionner le type suggéré selon le bloc
                const selType = document.getElementById('inpType');
                if (selType && locMaritime.startsWith('R-')) {
                    selType.value = "40' RF";
                } else if (selType && locMaritime.startsWith('B-')) {
                    selType.value = "20' ST";
                }

                // Focus sur le champ N° Conteneur
                setTimeout(() => {
                    const idInp = document.getElementById('inpId');
                    if (idInp) idInp.focus();
                }, 150);
            }
        }
    }

    function modifierConteneur(fbKey) {
        closeYardModal();
        if (window.openEditModal) {
            window.openEditModal(fbKey);
        }
    }

    async function deplacerConteneur(fbKey, idConteneur, ancienEmplacement) {
        const saisie = prompt(
            `Déplacer le conteneur ${idConteneur}\nAncien emplacement : ${ancienEmplacement}\n\nSaisissez le nouvel emplacement (ex: ${blocActif}-T02-R03-H2 ou B02-R03-H2) :`,
            ancienEmplacement
        );

        if (!saisie || saisie.trim() === '' || saisie.trim().toUpperCase() === ancienEmplacement) {
            return;
        }

        const analyse = analyserEmplacement(saisie.trim());
        if (!analyse) {
            if (window.showToast) window.showToast("Format d'emplacement invalide (ex: A-T01-R02-H3)", true);
            return;
        }

        const nouvelEmplacement = analyse.standard;

        // Vérifier si le slot de destination est déjà occupé
        const { carteSlots } = construireCarteParc();
        const cleDest = genererCleSlot(analyse.bloc, analyse.travee, analyse.rangee, analyse.hauteur);
        const occupant = carteSlots.get(cleDest);

        if (occupant && occupant.firebaseKey !== fbKey) {
            const occupantId = occupant.containerNumber || occupant.id || 'autre conteneur';
            const confirmerEcrasement = confirm(`Attention: Le slot ${nouvelEmplacement} est déjà occupé par ${occupantId}. Voulez-vous continuer et déplacer quand même ?`);
            if (!confirmerEcrasement) return;
        }

        try {
            if (window.DPW_DB && typeof window.DPW_DB.updateContainer === 'function') {
                await window.DPW_DB.updateContainer(fbKey, { loc: nouvelEmplacement });
            }

            if (window.showToast) {
                window.showToast(`✓ Conteneur ${idConteneur} déplacé vers ${nouvelEmplacement}`);
            }

            // Mettre à jour la vue sur le nouveau bloc / travée
            blocActif = analyse.bloc;
            traveeActive = analyse.travee;
            majOngletsBlocsUI();
            peuplerSelecteurTravees();
            afficherGrilleParc(cleDest);
            onSlotClicked(analyse.bloc, analyse.travee, analyse.rangee, analyse.hauteur);
        } catch (err) {
            console.error("Erreur déplacement:", err);
            if (window.showToast) window.showToast("Erreur lors du déplacement", true);
        }
    }

    async function retirerConteneur(fbKey, idConteneur) {
        const choix = confirm(
            `Voulez-vous retirer le conteneur ${idConteneur} du parc ?\n\n- Cliquez OK pour enregistrer sa sortie / livraison.\n- Cliquez Annuler pour conserver.`
        );

        if (!choix) return;

        try {
            if (window.DPW_DB && typeof window.DPW_DB.updateContainerStage === 'function') {
                await window.DPW_DB.updateContainerStage(fbKey, 'Embarqué');
            } else if (window.DPW_DB && typeof window.DPW_DB.deleteContainer === 'function') {
                await window.DPW_DB.deleteContainer(fbKey);
            }

            if (window.showToast) {
                window.showToast(`✓ Conteneur ${idConteneur} retiré du parc`);
            }

            afficherGrilleParc();
            fermerInspecteur();
        } catch (err) {
            console.error("Erreur retrait conteneur:", err);
            if (window.showToast) window.showToast("Erreur lors du retrait", true);
        }
    }

    // ================= 🔍 RECHERCHE & LOCALISATION RAPIDE =================
    function searchYardContainer(query) {
        requeteRecherche = (query || '').trim().toUpperCase();
        if (!requeteRecherche) {
            afficherGrilleParc();
            return;
        }

        const { indexConteneurs } = construireCarteParc();
        const resultat = indexConteneurs.find(item => {
            const num = item.conteneur.containerNumber || item.conteneur.id || '';
            return num.toUpperCase().includes(requeteRecherche);
        });

        if (resultat) {
            const { pos, conteneur } = resultat;
            blocActif = pos.bloc;
            traveeActive = pos.travee;

            majOngletsBlocsUI();
            peuplerSelecteurTravees();

            const cleCible = genererCleSlot(pos.bloc, pos.travee, pos.rangee, pos.hauteur);
            afficherGrilleParc(cleCible);
            onSlotClicked(pos.bloc, pos.travee, pos.rangee, pos.hauteur);

            const numAffiche = conteneur.containerNumber || conteneur.id || '';
            if (window.showToast) {
                window.showToast(`✓ Conteneur localisé : ${numAffiche} (${pos.standard})`);
            }
        }
    }

    // ================= 🎛️ CONTRÔLES D'INTERACTION =================
    function selectYardBlock(blocKey) {
        if (!CONFIG_PARC.blocs[blocKey]) return;
        blocActif = blocKey;
        traveeActive = 1;
        majOngletsBlocsUI();
        peuplerSelecteurTravees();
        afficherGrilleParc();
        fermerInspecteur();
    }

    function majOngletsBlocsUI() {
        const conteneur = document.getElementById('yardBlockTabsContainer');
        if (!conteneur) return;

        const boutons = conteneur.querySelectorAll('[data-yard-block]');
        boutons.forEach(btn => {
            const b = btn.getAttribute('data-yard-block');
            if (b === blocActif) {
                btn.className = "px-3 py-1.5 rounded-lg text-xs font-black transition yard-block-pill-active";
            } else {
                btn.className = "px-3 py-1.5 rounded-lg text-xs font-bold text-gray-400 hover:text-white transition";
            }
        });
    }

    function changeYardBay(valeurTravee) {
        traveeActive = parseInt(valeurTravee, 10) || 1;
        afficherGrilleParc();
        fermerInspecteur();
    }

    function stepYardBay(delta) {
        const config = CONFIG_PARC.blocs[blocActif] || CONFIG_PARC.blocs['A'];
        let suivante = traveeActive + delta;
        if (suivante < 1) suivante = config.travees;
        if (suivante > config.travees) suivante = 1;

        traveeActive = suivante;
        const selectEl = document.getElementById('yardBaySelect');
        if (selectEl) selectEl.value = traveeActive;
        afficherGrilleParc();
        fermerInspecteur();
    }

    function setYardFilter(nomFiltre) {
        filtreActif = nomFiltre;
        const boutons = document.querySelectorAll('.yard-filter-btn');
        boutons.forEach(btn => {
            const f = btn.getAttribute('data-yard-filter');
            if (f === nomFiltre) {
                btn.className = "yard-filter-btn px-2.5 py-1 rounded-lg text-[11px] font-bold bg-[#00ffaa] text-[#0d1033] shadow";
            } else {
                btn.className = "yard-filter-btn px-2.5 py-1 rounded-lg text-[11px] font-bold bg-[#1d2263] text-gray-300 hover:text-white border border-[#252b75]";
            }
        });

        afficherGrilleParc();
    }

    function refreshYardMatrix() {
        afficherGrilleParc();
        if (window.showToast) window.showToast("✓ Parc à conteneurs actualisé");
    }

    function openYardModal(modeSelection = false) {
        modeSelectionSeule = modeSelection;
        const modal = document.getElementById('yardModalOverlay');
        if (!modal) return;

        majOngletsBlocsUI();
        peuplerSelecteurTravees();
        afficherGrilleParc();
        modal.classList.remove('hidden');
    }

    function closeYardModal() {
        const modal = document.getElementById('yardModalOverlay');
        if (modal) modal.classList.add('hidden');
        fermerInspecteur();
    }

    // Exposition de l'API globale
    window.DPW_YARD = {
        config: CONFIG_PARC,
        analyserEmplacement,
        formaterEmplacementMaritime,
        openYardModal,
        closeYardModal,
        selectYardBlock,
        changeYardBay,
        stepYardBay,
        setYardFilter,
        searchYardContainer,
        refreshYardMatrix,
        onSlotClicked,
        fermerInspecteur,
        assignerConteneurAuSlot,
        modifierConteneur,
        deplacerConteneur,
        retirerConteneur,
        updateContainers: () => afficherGrilleParc()
    };

    // Mappages globaux pour les attributs onclick du DOM
    window.openYardModal = () => openYardModal(false);
    window.openYardModalWithSelectMode = () => openYardModal(true);
    window.closeYardModal = closeYardModal;
    window.selectYardBlock = selectYardBlock;
    window.changeYardBay = changeYardBay;
    window.stepYardBay = stepYardBay;
    window.setYardFilter = setYardFilter;
    window.searchYardContainer = searchYardContainer;
    window.refreshYardMatrix = refreshYardMatrix;

})(window);
