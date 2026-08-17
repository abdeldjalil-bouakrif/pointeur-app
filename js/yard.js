/**
 * DP WORLD DJENDJEN - CONTAINER TALLYING PWA
 * Visual Yard Matrix Engine (Yard 2D / 3D Layout, Slot Mapping & Inspection)
 */

(function(window) {
    'use strict';

    // Yard Block Configurations
    const YARD_CONFIG = {
        blocks: {
            'A': { name: 'BLOC A (Dry)', type: 'Dry', bays: 24, rows: 6, maxTiers: 4, defaultType: "40' HC" },
            'B': { name: 'BLOC B (Dry)', type: 'Dry', bays: 24, rows: 6, maxTiers: 4, defaultType: "20' ST" },
            'C': { name: 'BLOC C (Empty)', type: 'Empty', bays: 20, rows: 6, maxTiers: 5, defaultType: "Empty" },
            'R': { name: 'BLOC R (Reefer)', type: 'Reefer', bays: 16, rows: 4, maxTiers: 3, defaultType: "40' RF" }
        }
    };

    // Internal State
    let currentBlock = 'A';
    let currentBay = 1;
    let currentFilter = 'all';
    let searchQuery = '';
    let selectedSlotData = null;
    let isSelectMode = false; // When opened directly from Tally form "Choisir sur Parc"

    // ================= 🧭 LOCATION PARSER & NORMALIZER =================
    /**
     * Parses diverse location string formats entered by tallymen
     * Supported formats:
     * - B01-R04-T2, B1-R4-T2
     * - A-B01-R04-T2, A-01-04-02
     * - A010402, BLK A BAY 01 R 04 T 02
     * - 01-04-02
     */
    function parseLocation(locStr) {
        if (!locStr || typeof locStr !== 'string') {
            return null;
        }

        const clean = locStr.trim().toUpperCase();

        // 1. Try format: [Block]-[Bay]-[Row]-[Tier] or [Block]-B[Bay]-R[Row]-T[Tier]
        // Examples: A-B01-R04-T2, A-01-04-02, B-B12-R02-T3
        const blockMatch = clean.match(/^([ABCR])-?B?(\d{1,2})-?R?(\d{1,2})-?T?(\d{1,2})$/);
        if (blockMatch) {
            return {
                block: blockMatch[1],
                bay: parseInt(blockMatch[2], 10),
                row: parseInt(blockMatch[3], 10),
                tier: parseInt(blockMatch[4], 10),
                standard: `${blockMatch[1]}-B${String(blockMatch[2]).padStart(2, '0')}-R${String(blockMatch[3]).padStart(2, '0')}-T${blockMatch[4]}`
            };
        }

        // 2. Try standard 3-part: B[Bay]-R[Row]-T[Tier] or [Bay]-[Row]-[Tier]
        // Examples: B01-R04-T2, B1-R4-T2, 01-04-02
        const bayMatch = clean.match(/^B?(\d{1,2})-?R?(\d{1,2})-?T?(\d{1,2})$/);
        if (bayMatch) {
            return {
                block: currentBlock || 'A',
                bay: parseInt(bayMatch[1], 10),
                row: parseInt(bayMatch[2], 10),
                tier: parseInt(bayMatch[3], 10),
                standard: `B${String(bayMatch[1]).padStart(2, '0')}-R${String(bayMatch[2]).padStart(2, '0')}-T${bayMatch[3]}`
            };
        }

        // 3. Try natural space-separated: "BLK A BAY 01 R 04 T 02"
        const naturalMatch = clean.match(/(?:BLK|BLOCK)?\s*([ABCR])?\s*(?:BAY|B)?\s*(\d{1,2})\s*(?:ROW|R)?\s*(\d{1,2})\s*(?:TIER|T)?\s*(\d{1,2})/);
        if (naturalMatch && naturalMatch[2] && naturalMatch[3] && naturalMatch[4]) {
            const blk = naturalMatch[1] || currentBlock || 'A';
            return {
                block: blk,
                bay: parseInt(naturalMatch[2], 10),
                row: parseInt(naturalMatch[3], 10),
                tier: parseInt(naturalMatch[4], 10),
                standard: `${blk}-B${String(naturalMatch[2]).padStart(2, '0')}-R${String(naturalMatch[3]).padStart(2, '0')}-T${naturalMatch[4]}`
            };
        }

        return null;
    }

    function formatSlotKey(block, bay, row, tier) {
        return `${block}_${parseInt(bay, 10)}_${parseInt(row, 10)}_${parseInt(tier, 10)}`;
    }

    function formatDisplayLocation(block, bay, row, tier) {
        return `${block}-B${String(bay).padStart(2, '0')}-R${String(row).padStart(2, '0')}-T${tier}`;
    }

    // ================= 🏗️ YARD GRID MAPPING & RENDERING =================
    function buildYardMap() {
        const containers = (window.DPW_DB && window.DPW_DB.containers) ? window.DPW_DB.containers : [];
        const slotMap = new Map();
        const containerIndex = [];

        containers.forEach(container => {
            if (!container.loc) return;
            const parsed = parseLocation(container.loc);
            if (parsed) {
                const key = formatSlotKey(parsed.block, parsed.bay, parsed.row, parsed.tier);
                slotMap.set(key, container);
                containerIndex.push({
                    parsed,
                    container
                });
            }
        });

        return { slotMap, containerIndex };
    }

    function populateBaySelector() {
        const baySelect = document.getElementById('yardBaySelect');
        if (!baySelect) return;

        const config = YARD_CONFIG.blocks[currentBlock] || YARD_CONFIG.blocks['A'];
        const totalBays = config.bays;

        baySelect.innerHTML = '';
        for (let b = 1; b <= totalBays; b++) {
            const opt = document.createElement('option');
            opt.value = b;
            opt.innerText = `Bay ${String(b).padStart(2, '0')}${b % 2 === 0 ? " (40')" : " (20')"}`;
            if (b === currentBay) opt.selected = true;
            baySelect.appendChild(opt);
        }
    }

    function renderYardMatrix(highlightKey = null) {
        const containerEl = document.getElementById('yardGridContainer');
        if (!containerEl) return;

        const config = YARD_CONFIG.blocks[currentBlock] || YARD_CONFIG.blocks['A'];
        const numRows = config.rows;
        const numTiers = config.maxTiers;
        const { slotMap } = buildYardMap();

        // Calculate statistics for current Bay
        let bayOccupiedCount = 0;
        let bayDamagedCount = 0;
        let bayReeferCount = 0;
        const bayTotalSlots = numRows * numTiers;

        for (let r = 1; r <= numRows; r++) {
            for (let t = 1; t <= numTiers; t++) {
                const k = formatSlotKey(currentBlock, currentBay, r, t);
                const c = slotMap.get(k);
                if (c) {
                    bayOccupiedCount++;
                    if (c.status === 'Endommagé') bayDamagedCount++;
                    if (c.type && c.type.includes('RF')) bayReeferCount++;
                }
            }
        }

        const bayEmptyCount = bayTotalSlots - bayOccupiedCount;
        const occRate = Math.round((bayOccupiedCount / bayTotalSlots) * 100);

        // Update Occupancy badge & filter counts
        const occRateEl = document.getElementById('yardOccupancyRate');
        if (occRateEl) occRateEl.innerText = `${occRate}% OCC (${bayOccupiedCount}/${bayTotalSlots})`;

        if (document.getElementById('countFilterAll')) document.getElementById('countFilterAll').innerText = bayTotalSlots;
        if (document.getElementById('countFilterOccupied')) document.getElementById('countFilterOccupied').innerText = bayOccupiedCount;
        if (document.getElementById('countFilterEmpty')) document.getElementById('countFilterEmpty').innerText = bayEmptyCount;
        if (document.getElementById('countFilterDamaged')) document.getElementById('countFilterDamaged').innerText = bayDamagedCount;
        if (document.getElementById('countFilterReefer')) document.getElementById('countFilterReefer').innerText = bayReeferCount;

        // Build HTML Table Matrix (Tiers Top-to-Bottom, Rows Left-to-Right)
        let html = `
            <div class="w-full overflow-x-auto pb-2">
                <table class="yard-matrix-table mx-auto">
                    <thead>
                        <tr>
                            <th class="p-1 w-10"></th>
                            ${Array.from({ length: numRows }, (_, i) => `
                                <th class="p-1 text-center">
                                    <div class="yard-row-badge">
                                        R${String(i + 1).padStart(2, '0')}
                                    </div>
                                </th>
                            `).join('')}
                            <th class="p-1 w-10"></th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        // Render Tiers from Highest (e.g. 4) down to 1
        for (let t = numTiers; t >= 1; t--) {
            html += `
                <tr>
                    <td class="p-1 align-middle">
                        <div class="yard-tier-badge">T${t}</div>
                    </td>
            `;

            for (let r = 1; r <= numRows; r++) {
                const slotKey = formatSlotKey(currentBlock, currentBay, r, t);
                const container = slotMap.get(slotKey);
                const isOccupied = !!container;
                const isHighlighted = highlightKey === slotKey;

                // Determine filter visibility
                let isDimmed = false;
                if (currentFilter === 'occupied' && !isOccupied) isDimmed = true;
                if (currentFilter === 'empty' && isOccupied) isDimmed = true;
                if (currentFilter === 'damaged' && (!isOccupied || container.status !== 'Endommagé')) isDimmed = true;
                if (currentFilter === 'reefer' && (!isOccupied || !container.type || !container.type.includes('RF'))) isDimmed = true;

                if (isOccupied) {
                    const isDamaged = container.status === 'Endommagé';
                    const isReefer = container.type && container.type.includes('RF');
                    
                    let slotClass = 'yard-slot-good';
                    if (isDamaged) slotClass = 'yard-slot-damaged';
                    else if (isReefer) slotClass = 'yard-slot-reefer';

                    html += `
                        <td class="p-1 align-middle">
                            <div onclick="DPW_YARD.onSlotClicked('${currentBlock}', ${currentBay}, ${r}, ${t})" 
                                 id="slot_${slotKey}"
                                 class="yard-slot yard-slot-occupied ${slotClass} ${isHighlighted ? 'yard-slot-active-target' : ''} ${isDimmed ? 'yard-slot-dimmed' : ''}"
                                 title="${container.id} (${container.type}) - ${container.status}">
                                
                                <div class="flex items-center justify-between pointer-events-none">
                                    <span class="text-[9px] font-black font-container-id text-white truncate max-w-[85px] tracking-wide" dir="ltr">
                                        ${container.id}
                                    </span>
                                    <span class="text-[8px] font-bold px-1 rounded bg-black/40 text-[#00ffaa]">
                                        ${container.type ? container.type.split(' ')[0] : "40'"}
                                    </span>
                                </div>

                                <div class="flex items-center justify-between text-[8px] text-gray-300 font-semibold pointer-events-none">
                                    <span class="flex items-center gap-0.5">
                                        ${isReefer ? '<i class="fa-solid fa-snowflake text-cyan-300 text-[9px]"></i>' : ''}
                                        ${isDamaged ? '<i class="fa-solid fa-triangle-exclamation text-rose-300 text-[9px]"></i>' : ''}
                                        <span dir="ltr">${container.seal ? container.seal.substring(0, 7) : 'SL-00'}</span>
                                    </span>
                                    <span class="text-[7.5px] font-mono text-gray-400">R${r}T${t}</span>
                                </div>
                            </div>
                        </td>
                    `;
                } else {
                    html += `
                        <td class="p-1 align-middle">
                            <div onclick="DPW_YARD.onSlotClicked('${currentBlock}', ${currentBay}, ${r}, ${t})" 
                                 id="slot_${slotKey}"
                                 class="yard-slot yard-slot-empty ${isHighlighted ? 'yard-slot-active-target' : ''} ${isDimmed ? 'yard-slot-dimmed' : ''}"
                                 title="Slot Disponible : R${r}-T${t}">
                                
                                <div class="flex items-center justify-between text-[8px] text-gray-500 font-mono font-bold pointer-events-none">
                                    <span>R${r}T${t}</span>
                                    <span class="text-[7.5px] text-gray-500 font-semibold">LIBRE</span>
                                </div>

                                <div class="w-full flex items-center justify-center py-1 yard-empty-plus pointer-events-none">
                                    <i class="fa-solid fa-plus text-xs"></i>
                                </div>

                                <div class="text-[7.5px] text-center text-gray-500/70 font-semibold pointer-events-none">
                                    ${config.type}
                                </div>
                            </div>
                        </td>
                    `;
                }
            }

            html += `
                    <td class="p-1 align-middle">
                        <div class="yard-tier-badge">T${t}</div>
                    </td>
                </tr>
            `;
        }

        // Ground asphalt bar
        html += `
                    </tbody>
                </table>

                <!-- Yard Asphalt / Rail Track Ground Line -->
                <div class="max-w-3xl mx-auto h-3 mt-2 yard-ground-track flex items-center justify-center">
                    <span class="text-[8px] font-extrabold tracking-widest text-[#00ffaa]/70 uppercase">SOL PARC DJENDJEN (GROUND TRACK)</span>
                </div>
            </div>
        `;

        containerEl.innerHTML = html;
    }

    // ================= 🔍 SLOT INSPECTOR & ACTIONS =================
    function onSlotClicked(block, bay, row, tier) {
        const slotKey = formatSlotKey(block, bay, row, tier);
        const { slotMap } = buildYardMap();
        const container = slotMap.get(slotKey);
        const locStr = formatDisplayLocation(block, bay, row, tier);

        selectedSlotData = { block, bay, row, tier, locStr, container };

        const inspectorEl = document.getElementById('yardSlotInspector');
        const contentEl = document.getElementById('yardInspectorContent');
        if (!inspectorEl || !contentEl) return;

        if (window.triggerHapticFeedback) window.triggerHapticFeedback();

        if (container) {
            // OCCUPIED SLOT INSPECTOR
            const isGood = container.status === 'Bon état';
            const isReefer = container.type && container.type.includes('RF');

            let damagePhotoThumbnail = '';
            if (container.damagePhoto) {
                damagePhotoThumbnail = `
                    <img src="${container.damagePhoto}" onclick="window.open('${container.damagePhoto}')" class="w-12 h-12 rounded-xl object-cover border border-rose-500/50 cursor-pointer shrink-0" title="Voir photo grand format">
                `;
            }

            contentEl.innerHTML = `
                <div class="flex items-center gap-3">
                    ${damagePhotoThumbnail}
                    <div>
                        <div class="flex items-center gap-2">
                            <span class="font-extrabold text-sm sm:text-base text-white font-container-id tracking-wider" dir="ltr">${container.id}</span>
                            <span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold ${isGood ? 'bg-emerald-600/80 text-white' : 'bg-rose-600/80 text-white'}">
                                ${container.status}
                            </span>
                            ${isReefer ? '<span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-cyan-600/80 text-white"><i class="fa-solid fa-snowflake"></i> RF</span>' : ''}
                        </div>
                        <p class="text-[11px] text-gray-300 mt-0.5">
                            <span class="text-[#00ffaa] font-bold" dir="ltr">${locStr}</span> • ${container.type} • Plomb: <b class="text-white" dir="ltr">${container.seal || 'N/A'}</b>
                        </p>
                    </div>
                </div>

                <div class="flex items-center gap-2">
                    <button onclick="DPW_YARD.editSelectedContainer('${container.firebaseKey}')" class="btn-dpw-green px-3.5 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 shadow active:scale-95 transition">
                        <i class="fa-solid fa-pen-to-square"></i>
                        <span>Modifier</span>
                    </button>
                    <button onclick="DPW_YARD.moveContainerPrompt('${container.firebaseKey}', '${container.id}', '${locStr}')" class="bg-[#1d2263] hover:bg-[#252b75] text-[#00ffaa] border border-[#00ffaa]/40 px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 active:scale-95 transition">
                        <i class="fa-solid fa-arrows-up-down-left-right"></i>
                        <span>Déplacer</span>
                    </button>
                    <button onclick="DPW_YARD.closeInspector()" class="text-gray-400 hover:text-white p-2 text-sm">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>
            `;
        } else {
            // EMPTY SLOT INSPECTOR
            contentEl.innerHTML = `
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-xl bg-[#1d2263] border border-[#00ffaa]/40 flex items-center justify-center text-[#00ffaa] font-black text-base">
                        <i class="fa-solid fa-map-pin"></i>
                    </div>
                    <div>
                        <h4 class="font-extrabold text-sm text-white">Slot Disponible</h4>
                        <p class="text-[11px] text-gray-300 font-mono">
                            Emplacement: <span class="text-[#00ffaa] font-bold" dir="ltr">${locStr}</span> (${YARD_CONFIG.blocks[block].name})
                        </p>
                    </div>
                </div>

                <div class="flex items-center gap-2">
                    <button onclick="DPW_YARD.tallyAtSlot('${locStr}')" class="btn-dpw-gradient px-4 py-2 rounded-xl text-xs font-black flex items-center gap-2 shadow-lg active:scale-95 transition">
                        <i class="fa-solid fa-plus"></i>
                        <span>Pointer ce Slot</span>
                    </button>
                    <button onclick="DPW_YARD.closeInspector()" class="text-gray-400 hover:text-white p-2 text-sm">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>
            `;
        }

        inspectorEl.classList.remove('hidden');
    }

    function closeInspector() {
        const inspectorEl = document.getElementById('yardSlotInspector');
        if (inspectorEl) inspectorEl.classList.add('hidden');
    }

    function tallyAtSlot(locStr) {
        closeYardModal();
        if (isSelectMode) {
            // Fill into active form
            const inp = document.getElementById('inpLoc');
            if (inp) inp.value = locStr;
            isSelectMode = false;
        } else {
            // Open modal fresh with location prefilled
            if (window.openModal) {
                window.openModal();
                const inp = document.getElementById('inpLoc');
                if (inp) inp.value = locStr;
            }
        }
    }

    function editSelectedContainer(fbKey) {
        closeYardModal();
        if (window.openEditModal) {
            window.openEditModal(fbKey);
        }
    }

    async function moveContainerPrompt(fbKey, containerId, oldLoc) {
        const newLoc = prompt(`Déplacer le conteneur ${containerId} vers un nouvel emplacement (ex: B02-R01-T3) :`, oldLoc);
        if (newLoc && newLoc.trim() !== '' && newLoc.trim().toUpperCase() !== oldLoc) {
            const formatted = newLoc.trim().toUpperCase();
            await window.DPW_DB.updateContainer(fbKey, { loc: formatted });
            if (window.showToast) window.showToast(`✓ Conteneur ${containerId} déplacé vers ${formatted}`);
            renderYardMatrix();
            closeInspector();
        }
    }

    // ================= 🔍 QUICK CONTAINER LOCATOR & SEARCH =================
    function searchYardContainer(query) {
        searchQuery = (query || '').trim().toUpperCase();
        if (!searchQuery) {
            renderYardMatrix();
            return;
        }

        const { containerIndex } = buildYardMap();
        const match = containerIndex.find(item => 
            item.container.id.toUpperCase().includes(searchQuery)
        );

        if (match) {
            const { parsed, container } = match;
            currentBlock = parsed.block;
            currentBay = parsed.bay;

            // Sync Block Pills UI
            updateBlockTabsUI();
            populateBaySelector();

            const targetKey = formatSlotKey(parsed.block, parsed.bay, parsed.row, parsed.tier);
            renderYardMatrix(targetKey);
            onSlotClicked(parsed.block, parsed.bay, parsed.row, parsed.tier);

            if (window.showToast) {
                window.showToast(`✓ Conteneur trouvé: ${container.id} (${parsed.standard})`);
            }
        }
    }

    // ================= 🎛️ CONTROLS & INTERACTION DISPATCHERS =================
    function selectYardBlock(blockKey) {
        if (!YARD_CONFIG.blocks[blockKey]) return;
        currentBlock = blockKey;
        currentBay = 1;
        updateBlockTabsUI();
        populateBaySelector();
        renderYardMatrix();
        closeInspector();
    }

    function updateBlockTabsUI() {
        const container = document.getElementById('yardBlockTabsContainer');
        if (!container) return;

        const btns = container.querySelectorAll('[data-yard-block]');
        btns.forEach(btn => {
            const b = btn.getAttribute('data-yard-block');
            if (b === currentBlock) {
                btn.className = "px-3 py-1.5 rounded-lg text-xs font-black transition yard-block-pill-active";
            } else {
                btn.className = "px-3 py-1.5 rounded-lg text-xs font-bold text-gray-400 hover:text-white transition";
            }
        });
    }

    function changeYardBay(bayVal) {
        currentBay = parseInt(bayVal, 10) || 1;
        renderYardMatrix();
        closeInspector();
    }

    function stepYardBay(delta) {
        const config = YARD_CONFIG.blocks[currentBlock] || YARD_CONFIG.blocks['A'];
        let nextBay = currentBay + delta;
        if (nextBay < 1) nextBay = config.bays;
        if (nextBay > config.bays) nextBay = 1;

        currentBay = nextBay;
        const baySelect = document.getElementById('yardBaySelect');
        if (baySelect) baySelect.value = currentBay;
        renderYardMatrix();
        closeInspector();
    }

    function setYardFilter(filterName) {
        currentFilter = filterName;
        const filterBtns = document.querySelectorAll('.yard-filter-btn');
        filterBtns.forEach(btn => {
            const f = btn.getAttribute('data-yard-filter');
            if (f === filterName) {
                btn.className = "yard-filter-btn px-2.5 py-1 rounded-lg text-[11px] font-bold bg-[#00ffaa] text-[#0d1033] shadow";
            } else {
                btn.className = "yard-filter-btn px-2.5 py-1 rounded-lg text-[11px] font-bold bg-[#1d2263] text-gray-300 hover:text-white border border-[#252b75]";
            }
        });

        renderYardMatrix();
    }

    function refreshYardMatrix() {
        renderYardMatrix();
        if (window.showToast) window.showToast("✓ Parc 2D actualisé");
    }

    function openYardModal(selectMode = false) {
        isSelectMode = selectMode;
        const modal = document.getElementById('yardModalOverlay');
        if (!modal) return;

        updateBlockTabsUI();
        populateBaySelector();
        renderYardMatrix();
        modal.classList.remove('hidden');
    }

    function closeYardModal() {
        const modal = document.getElementById('yardModalOverlay');
        if (modal) modal.classList.add('hidden');
        closeInspector();
    }

    // Public API
    window.DPW_YARD = {
        config: YARD_CONFIG,
        parseLocation,
        formatDisplayLocation,
        openYardModal,
        closeYardModal,
        selectYardBlock,
        changeYardBay,
        stepYardBay,
        setYardFilter,
        searchYardContainer,
        refreshYardMatrix,
        onSlotClicked,
        closeInspector,
        tallyAtSlot,
        editSelectedContainer,
        moveContainerPrompt,
        updateContainers: () => renderYardMatrix()
    };

    // Global helper mappings for inline HTML onclick attributes
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
