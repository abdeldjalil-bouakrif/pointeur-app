// ==========================================
// FILE: js/excel.js
// ==========================================
/**
 * DP WORLD DJENDJEN - CONTAINER TALLYING PWA
 * ExcelJS Template Injection, Clean Export Engine & UI Controller
 */

(function(window) {
    'use strict';

    /**
     * Convert Excel column letter (A, B, ... Z, AA, AB...) to 1-based index (1, 2, ... 26, 27, 28...)
     */
    function colLetterToNumber(letter) {
        if (!letter || typeof letter !== 'string' || letter === 'None') return 0;
        let column = 0;
        const clean = letter.toUpperCase().trim();
        for (let i = 0; i < clean.length; i++) {
            column += (clean.charCodeAt(i) - 64) * Math.pow(26, clean.length - i - 1);
        }
        return column > 0 ? column : 0;
    }

    /**
     * Convert 1-based number (1, 2, ... 26, 27) to Excel column letter (A, B, ... Z, AA)
     */
    function numberToColLetter(num) {
        let temp, letter = '';
        while (num > 0) {
            temp = (num - 1) % 26;
            letter = String.fromCharCode(65 + temp) + letter;
            num = Math.floor((num - temp) / 26);
        }
        return letter || 'A';
    }

    /**
     * Converts ArrayBuffer to Base64 string safely
     */
    function arrayBufferToBase64(arrayBuffer) {
        const bytes = new Uint8Array(arrayBuffer);
        let binary = '';
        const chunkSize = 8192;
        for (let i = 0; i < bytes.length; i += chunkSize) {
            const chunk = bytes.subarray(i, i + chunkSize);
            binary += String.fromCharCode.apply(null, chunk);
        }
        return window.btoa(binary);
    }

    /**
     * Converts Base64 string to ArrayBuffer safely
     */
    function base64ToArrayBuffer(base64) {
        const binaryString = window.atob(base64);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes.buffer;
    }

    /**
     * Clean container list helper
     */
    function getCleanContainers(containers) {
        const raw = (containers || (window.DPW_DB ? window.DPW_DB.containers : []));
        return raw
            .map(c => {
                if (!c) return null;
                const num = String(c.containerNumber || c.id || '').trim();
                return { ...c, containerNumber: num, id: num };
            })
            .filter(c => c && c.containerNumber && c.containerNumber.trim() !== '' && c.containerNumber !== 'undefined' && c.containerNumber !== 'null');
    }

    class ExcelEngine {
        constructor() {}

        /**
         * Parses and validates an uploaded Excel file for use as a template
         */
        async parseAndValidateTemplate(file, onProgress) {
            if (typeof ExcelJS === 'undefined') {
                throw new Error('ExcelJS library is not loaded');
            }

            return new Promise((resolve, reject) => {
                const reader = new FileReader();

                reader.onprogress = (e) => {
                    if (e.lengthComputable && onProgress) {
                        const percent = Math.round((e.loaded / e.total) * 60);
                        onProgress(percent);
                    }
                };

                reader.onload = async (e) => {
                    try {
                        if (onProgress) onProgress(75);
                        const arrayBuffer = e.target.result;

                        const testWb = new ExcelJS.Workbook();
                        await testWb.xlsx.load(arrayBuffer);

                        if (!testWb.worksheets || testWb.worksheets.length === 0) {
                            throw new Error('Aucune feuille valide trouvée dans le classeur.');
                        }

                        const sheetNames = testWb.worksheets.map(w => w.name);
                        const base64Data = arrayBufferToBase64(arrayBuffer);

                        if (onProgress) onProgress(100);
                        resolve({ base64: base64Data, sheetNames });
                    } catch (err) {
                        reject(err);
                    }
                };

                reader.onerror = () => reject(new Error('Échec de lecture du fichier'));
                reader.readAsArrayBuffer(file);
            });
        }

        /**
         * Injects container data directly into a predefined Excel template using column mapping
         */
        async injectIntoTemplate(base64Template, mappingConfig, dataToExport, modelName) {
            if (typeof ExcelJS === 'undefined') {
                throw new Error('ExcelJS library is not loaded');
            }

            const arrayBuffer = base64ToArrayBuffer(base64Template);
            const workbook = new ExcelJS.Workbook();
            await workbook.xlsx.load(arrayBuffer);

            const worksheet = workbook.worksheets[0];
            if (!worksheet) throw new Error('Worksheet not found in template');

            let currentRow = parseInt(mappingConfig?.startRow, 10) || 2;
            const cols = mappingConfig?.columns || {};

            dataToExport.forEach((c) => {
                const setVal = (colKey, val) => {
                    const colLetter = cols[colKey];
                    if (colLetter && colLetter !== 'None') {
                        const cell = worksheet.getCell(`${colLetter.toUpperCase()}${currentRow}`);
                        cell.value = val !== undefined && val !== null ? String(val) : '';
                    }
                };

                setVal('id', c.id || c.containerNumber || '');
                setVal('type', c.type || '');
                setVal('loc', c.loc || '');
                setVal('seal', c.seal || '');
                setVal('status', c.status || '');
                setVal('stage', c.stage || 'Stock');
                setVal('date', c.date || '');
                setVal('time', c.time || '');
                setVal('agent', c.agent || '');
                setVal('notes', c.notes || '');

                if (c.customData) {
                    for (const [k, v] of Object.entries(c.customData)) {
                        setVal(`custom_${k}`, v || '-');
                    }
                }
                currentRow++;
            });

            const buffer = await workbook.xlsx.writeBuffer();
            return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        }

        /**
         * Generates a clean, branded Excel sheet automatically using the active column mapping
         */
        async generateCleanModelReport(dataToExport, modelName, mappingConfig, customFields = []) {
            if (typeof ExcelJS === 'undefined') {
                throw new Error('ExcelJS library is not loaded');
            }

            const workbook = new ExcelJS.Workbook();
            workbook.creator = 'DP World Djendjen';
            workbook.created = new Date();

            const safeSheetName = (modelName || 'Pointage').replace(/[*?:/\\\[\]]/g, '').substring(0, 30);
            const worksheet = workbook.addWorksheet(safeSheetName || 'Pointage');

            const startRow = parseInt(mappingConfig?.startRow, 10) || 2;
            const cols = mappingConfig?.columns || {};

            // Map field labels
            const fieldLabels = {
                id: 'N° CONTENEUR',
                type: 'TYPE & TAILLE',
                loc: 'EMPLACEMENT PARC',
                seal: 'N° PLOMB (SEAL)',
                status: 'ÉTAT',
                stage: 'ÉTAPE / FLUX',
                date: 'DATE POINTAGE',
                time: 'HEURE POINTAGE',
                agent: 'AGENT POINTEUR',
                notes: 'REMARQUES'
            };

            customFields.forEach(cf => {
                fieldLabels[`custom_${cf}`] = cf.toUpperCase();
            });

            // Build active columns sorted by letter position
            const mappedEntries = Object.entries(cols)
                .filter(([k, col]) => col && col !== 'None' && colLetterToNumber(col) > 0)
                .sort((a, b) => colLetterToNumber(a[1]) - colLetterToNumber(b[1]));

            const headerRowNum = (startRow > 1) ? startRow - 1 : 1;

            if (mappedEntries.length > 0) {
                // 1. Write Header Row using configured columns
                mappedEntries.forEach(([key, colLetter]) => {
                    const cell = worksheet.getCell(`${colLetter.toUpperCase()}${headerRowNum}`);
                    const label = fieldLabels[key] || key.replace(/^custom_/, '').toUpperCase();
                    cell.value = label;
                    cell.font = { name: 'Segoe UI', bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF15194A' } };
                    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
                    cell.border = {
                        top: { style: 'thin', color: { argb: 'FF303796' } },
                        bottom: { style: 'medium', color: { argb: 'FF00FFAA' } },
                        left: { style: 'thin', color: { argb: 'FF303796' } },
                        right: { style: 'thin', color: { argb: 'FF303796' } }
                    };
                });
                worksheet.getRow(headerRowNum).height = 28;

                // 2. Write Data Rows
                let currentRow = startRow;
                dataToExport.forEach((c, rowIndex) => {
                    const isEven = rowIndex % 2 === 0;
                    const rowBgColor = isEven ? 'FFFFFFFF' : 'FFF8FAFC';

                    mappedEntries.forEach(([key, colLetter]) => {
                        const cell = worksheet.getCell(`${colLetter.toUpperCase()}${currentRow}`);
                        let val = '';

                        if (key === 'id') val = c.id || c.containerNumber || '';
                        else if (key === 'type') val = c.type || '';
                        else if (key === 'loc') val = c.loc || '';
                        else if (key === 'seal') val = c.seal || '';
                        else if (key === 'status') val = c.status || '';
                        else if (key === 'stage') val = c.stage || 'Stock';
                        else if (key === 'date') val = c.date || '';
                        else if (key === 'time') val = c.time || '';
                        else if (key === 'agent') val = c.agent || '';
                        else if (key === 'notes') val = c.notes || '';
                        else if (key.startsWith('custom_')) {
                            const rawKey = key.replace('custom_', '');
                            val = (c.customData && c.customData[rawKey] !== undefined) ? c.customData[rawKey] : (c[rawKey] || '-');
                        }

                        cell.value = val;
                        cell.font = { name: 'Segoe UI', size: 10 };
                        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBgColor } };
                        cell.border = {
                            top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                            bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                            left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                            right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
                        };

                        const isCentered = ['id', 'date', 'time', 'status', 'seal', 'stage'].includes(key);
                        cell.alignment = { vertical: 'middle', horizontal: isCentered ? 'center' : 'left' };
                    });

                    worksheet.getRow(currentRow).height = 20;
                    currentRow++;
                });

                // Auto-adjust column widths
                mappedEntries.forEach(([key, colLetter]) => {
                    const colNum = colLetterToNumber(colLetter);
                    const col = worksheet.getColumn(colNum);
                    let maxLen = 14;
                    const headerLabel = fieldLabels[key] || '';
                    if (headerLabel.length > maxLen) maxLen = headerLabel.length;
                    
                    dataToExport.forEach(c => {
                        let v = '';
                        if (key === 'id') v = c.id || c.containerNumber || '';
                        else if (key === 'notes') v = c.notes || '';
                        else if (key === 'loc') v = c.loc || '';
                        else if (key.startsWith('custom_')) v = (c.customData && c.customData[key.replace('custom_', '')]) || '';
                        if (String(v).length > maxLen) maxLen = String(v).length;
                    });
                    col.width = Math.min(Math.max(maxLen + 4, 14), 40);
                });

            } else {
                // Fallback default clean layout
                const columns = [
                    { header: "DATE", key: "date", width: 14 },
                    { header: "HEURE", key: "time", width: 12 },
                    { header: "N° CONTENEUR", key: "id", width: 18 },
                    { header: "ÉTAPE FLUX", key: "stage", width: 16 },
                    { header: "TYPE & TAILLE", key: "type", width: 15 },
                    { header: "EMPLACEMENT", key: "loc", width: 16 },
                    { header: "ÉTAT", key: "status", width: 14 },
                    { header: "N° PLOMB", key: "seal", width: 14 },
                    { header: "POINTEUR", key: "agent", width: 15 }
                ];

                customFields.forEach(cf => {
                    columns.push({ header: cf.toUpperCase(), key: `custom_${cf}`, width: 18 });
                });

                columns.push({ header: "REMARQUES", key: "notes", width: 25 });
                worksheet.columns = columns;

                const headerRow = worksheet.getRow(1);
                headerRow.font = { name: 'Segoe UI', bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
                headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF15194A' } };
                headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
                headerRow.height = 28;

                dataToExport.forEach((c, idx) => {
                    const rowData = {
                        date: c.date || '',
                        time: c.time || '',
                        id: c.id || c.containerNumber || '',
                        stage: c.stage || "Stock",
                        type: c.type || '',
                        loc: c.loc || '',
                        status: c.status || '',
                        seal: c.seal || '',
                        agent: c.agent || "",
                        notes: c.notes || ""
                    };

                    if (c.customData) {
                        for (const [k, v] of Object.entries(c.customData)) {
                            rowData[`custom_${k}`] = v;
                        }
                    }

                    const addedRow = worksheet.addRow(rowData);
                    addedRow.height = 20;
                    const bg = idx % 2 === 0 ? 'FFFFFFFF' : 'FFF8FAFC';
                    addedRow.eachCell(cell => {
                        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
                        cell.border = {
                            top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                            bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                            left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                            right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
                        };
                    });
                });
            }

            worksheet.views = [{ showGridLines: true }];
            const buffer = await workbook.xlsx.writeBuffer();
            return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        }

        /**
         * Universal direct export for ANY model card
         */
        async exportModel(modelName, stageFilter = 'All') {
            const allContainers = getCleanContainers();
            let modelData = allContainers.filter(c => c.model === modelName);

            if (stageFilter && stageFilter !== 'All') {
                modelData = modelData.filter(c => (c.stage || 'Stock') === stageFilter);
            }

            if (modelData.length === 0) {
                if (window.showToast) {
                    window.showToast(`Aucun conteneur trouvé pour le modèle "${modelName}"`, true);
                }
                return { success: false, reason: 'empty' };
            }

            const modelTemplates = (window.DPW_DB && window.DPW_DB.modelTemplates) ? window.DPW_DB.modelTemplates : {};
            const templateMappings = (window.DPW_DB && window.DPW_DB.templateMappings) ? window.DPW_DB.templateMappings : {};
            const modelConfigs = (window.DPW_DB && window.DPW_DB.modelConfigs) ? window.DPW_DB.modelConfigs : {};

            const templateBase64 = modelTemplates[modelName];
            const mappingConfig = (window.DPW_DB && typeof window.DPW_DB.getTemplateMapping === 'function')
                ? window.DPW_DB.getTemplateMapping(modelName)
                : (templateMappings[modelName] || {});

            const dateStr = new Date().toISOString().split('T')[0];
            const safeName = modelName.replace(/\s+/g, '_');
            const fileName = `DPW_${safeName}_${dateStr}.xlsx`;

            try {
                let blob;
                let mode;

                if (templateBase64) {
                    blob = await this.injectIntoTemplate(templateBase64, mappingConfig, modelData, modelName);
                    mode = 'template';
                } else {
                    const customFields = modelConfigs[modelName] || [];
                    blob = await this.generateCleanModelReport(modelData, modelName, mappingConfig, customFields);
                    mode = 'clean_sheet';
                }

                if (typeof window.saveAs !== 'undefined') {
                    window.saveAs(blob, fileName);
                } else {
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = fileName;
                    a.click();
                    setTimeout(() => URL.revokeObjectURL(url), 2000);
                }

                if (window.showToast) {
                    const msg = mode === 'template'
                        ? `✓ Template officiel "${modelName}" rempli et téléchargé !`
                        : `✓ Export Excel "${modelName}" généré avec succès !`;
                    window.showToast(msg);
                }

                return { success: true, mode, fileName };
            } catch (err) {
                console.error(`Export error for model ${modelName}:`, err);
                if (window.showToast) {
                    window.showToast(`Erreur lors de l'exportation Excel: ${err.message}`, true);
                }
                return { success: false, error: err };
            }
        }

        /**
         * Multi-model and advanced export dispatcher
         */
        async export({ containers, modelConfigs, modelTemplates, templateMappings, stageFilter = 'All', modelFilter = 'All' }) {
            let dataToExport = getCleanContainers(containers);

            if (stageFilter !== 'All') {
                dataToExport = dataToExport.filter(c => (c.stage || 'Stock') === stageFilter);
            }
            if (modelFilter !== 'All') {
                dataToExport = dataToExport.filter(c => c.model === modelFilter);
            }

            if (dataToExport.length === 0) {
                return { success: false, reason: 'empty' };
            }

            if (modelFilter !== 'All') {
                return await this.exportModel(modelFilter, stageFilter);
            }

            // Export multi-sheet for all models
            const dateStr = new Date().toISOString().split('T')[0];
            const workbook = new ExcelJS.Workbook();
            workbook.creator = 'DP World Djendjen';
            workbook.created = new Date();

            const models = Object.keys(modelConfigs || {});
            let sheetAdded = 0;

            for (const mName of models) {
                const filtered = dataToExport.filter(c => c.model === mName);
                if (filtered.length > 0) {
                    sheetAdded++;
                    const mappingConfig = (window.DPW_DB && typeof window.DPW_DB.getTemplateMapping === 'function')
                        ? window.DPW_DB.getTemplateMapping(mName)
                        : (templateMappings[mName] || {});
                    const customFields = modelConfigs[mName] || [];

                    const safeSheetName = mName.replace(/[*?:/\\\[\]]/g, '').substring(0, 30);
                    const worksheet = workbook.addWorksheet(safeSheetName || 'Pointage');

                    const startRow = parseInt(mappingConfig?.startRow, 10) || 2;
                    const cols = mappingConfig?.columns || {};
                    const mappedEntries = Object.entries(cols)
                        .filter(([k, col]) => col && col !== 'None' && colLetterToNumber(col) > 0)
                        .sort((a, b) => colLetterToNumber(a[1]) - colLetterToNumber(b[1]));

                    const headerRowNum = (startRow > 1) ? startRow - 1 : 1;

                    if (mappedEntries.length > 0) {
                        mappedEntries.forEach(([key, colLetter]) => {
                            const cell = worksheet.getCell(`${colLetter.toUpperCase()}${headerRowNum}`);
                            const label = key.startsWith('custom_') ? key.replace('custom_', '').toUpperCase() : key.toUpperCase();
                            cell.value = label;
                            cell.font = { name: 'Segoe UI', bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
                            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF15194A' } };
                            cell.alignment = { vertical: 'middle', horizontal: 'center' };
                        });

                        let curR = startRow;
                        filtered.forEach(c => {
                            mappedEntries.forEach(([key, colLetter]) => {
                                const cell = worksheet.getCell(`${colLetter.toUpperCase()}${curR}`);
                                let val = '';
                                if (key === 'id') val = c.id || c.containerNumber || '';
                                else if (key === 'type') val = c.type || '';
                                else if (key === 'loc') val = c.loc || '';
                                else if (key === 'seal') val = c.seal || '';
                                else if (key === 'status') val = c.status || '';
                                else if (key === 'stage') val = c.stage || 'Stock';
                                else if (key === 'date') val = c.date || '';
                                else if (key === 'time') val = c.time || '';
                                else if (key === 'agent') val = c.agent || '';
                                else if (key === 'notes') val = c.notes || '';
                                else if (key.startsWith('custom_')) val = (c.customData && c.customData[key.replace('custom_', '')]) || '-';

                                cell.value = val;
                            });
                            curR++;
                        });
                    }
                }
            }

            if (sheetAdded === 0) {
                return { success: false, reason: 'empty' };
            }

            const buffer = await workbook.xlsx.writeBuffer();
            const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            const fileName = `DPW_Djendjen_Pointage_Complet_${dateStr}.xlsx`;

            if (typeof window.saveAs !== 'undefined') {
                window.saveAs(blob, fileName);
            } else {
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = fileName;
                a.click();
            }

            return { success: true, mode: 'multi_sheet', fileName };
        }
    }

    // Expose global engine instance
    window.DPW_EXCEL = new ExcelEngine();

    // ================= 🎨 DYNAMIC UI CONTROLLER FOR MODELS & TAGS =================

    /**
     * Render enhanced model cards into #modelsList
     * Every card has: Universal Exporter, +Template, Colonnes (Always active), Delete, Tags with (X), +Champ
     */
    function renderEnhancedModelsList() {
        const listEl = document.getElementById('modelsList');
        if (!listEl) return;

        const modelConfigs = (window.DPW_DB && window.DPW_DB.modelConfigs) ? window.DPW_DB.modelConfigs : {};
        const modelTemplates = (window.DPW_DB && window.DPW_DB.modelTemplates) ? window.DPW_DB.modelTemplates : {};
        const templateMappings = (window.DPW_DB && window.DPW_DB.templateMappings) ? window.DPW_DB.templateMappings : {};
        const allContainers = getCleanContainers();

        listEl.innerHTML = '';

        // Inject "+ Nouveau Modèle" button at the section title if not present
        const titleEl = document.getElementById('txtConfiguredModels');
        if (titleEl && !document.getElementById('btnDynamicNewModelTop')) {
            const parent = titleEl.parentElement;
            if (parent && !parent.querySelector('#btnDynamicNewModelTop')) {
                const headerWrap = document.createElement('div');
                headerWrap.className = "flex items-center justify-between gap-2 pb-1";
                titleEl.replaceWith(headerWrap);
                headerWrap.appendChild(titleEl);

                const newModelBtn = document.createElement('button');
                newModelBtn.id = 'btnDynamicNewModelTop';
                newModelBtn.type = 'button';
                newModelBtn.className = "btn-dpw-gradient px-3 py-1.5 rounded-xl text-[11px] font-extrabold flex items-center gap-1.5 shadow active:scale-95 transition";
                newModelBtn.innerHTML = `<i class="fa-solid fa-plus text-xs"></i> <span>+ Nouveau Modèle</span>`;
                newModelBtn.onclick = () => {
                    if (window.DPW_DB && typeof window.DPW_DB.promptAddNewModel === 'function') {
                        window.DPW_DB.promptAddNewModel();
                    } else {
                        const inp = document.getElementById('inpNewModel');
                        if (inp) inp.focus();
                    }
                };
                headerWrap.appendChild(newModelBtn);
            }
        }

        const modelNames = Object.keys(modelConfigs);
        if (modelNames.length === 0) {
            listEl.innerHTML = `<div class="col-span-full text-center py-8 text-gray-400 text-xs font-semibold">Aucun modèle configuré. Cliquez sur "+ Nouveau Modèle" pour commencer.</div>`;
            return;
        }

        modelNames.forEach(mName => {
            const fields = modelConfigs[mName] || [];
            const hasTemplate = !!modelTemplates[mName];
            const hasMapping = !!templateMappings[mName];
            const count = allContainers.filter(c => c.model === mName).length;

            const card = document.createElement('div');
            card.className = "dpw-enhanced-card bg-[#1d2263] p-4 rounded-2xl text-xs space-y-3 border border-[#303796] shadow-lg flex flex-col justify-between hover:border-[#00ffaa]/50 transition duration-200";

            card.innerHTML = `
                <!-- Top Header: Model Name, Stats & Export/Delete Actions -->
                <div class="flex items-center justify-between gap-2">
                    <div class="flex items-center gap-2.5 min-w-0">
                        <div class="w-9 h-9 rounded-xl bg-[#15194a] flex items-center justify-center text-[#00ffaa] border border-[#252b75] shrink-0 shadow-inner">
                            <i class="fa-solid fa-file-invoice text-sm"></i>
                        </div>
                        <div class="min-w-0">
                            <h4 class="font-extrabold text-white text-sm truncate" title="${mName}">${mName}</h4>
                            <span class="text-[10px] text-gray-300 font-mono font-bold">${count} conteneur(s)</span>
                        </div>
                    </div>
                    
                    <div class="flex items-center gap-1.5 shrink-0">
                        <!-- Universal Export Button (Works for ALL models) -->
                        <button onclick="DPW_EXCEL.exportModel('${mName}')" class="btn-dpw-green px-2.5 py-1.5 rounded-xl text-[11px] font-bold flex items-center gap-1 shadow active:scale-95 transition" title="Exporter ce modèle en Excel">
                            <i class="fa-solid fa-file-arrow-down text-xs"></i>
                            <span>Exporter</span>
                        </button>
                        
                        <!-- Delete Model Button -->
                        <button onclick="deleteModel('${mName}')" class="text-gray-400 hover:text-rose-400 p-1.5 rounded-lg hover:bg-rose-500/10 transition" title="Supprimer le modèle">
                            <i class="fa-solid fa-trash-can text-xs"></i>
                        </button>
                    </div>
                </div>

                <!-- Template & Colonnes Buttons -->
                <div class="flex items-center gap-2 pt-1 border-t border-[#252b75]/70 flex-wrap">
                    <!-- Template Upload / Replace -->
                    <button onclick="triggerUploadTemplate('${mName}')" class="px-2.5 py-1.5 rounded-xl text-[10px] font-bold flex items-center gap-1.5 transition ${hasTemplate ? 'bg-emerald-600/30 text-emerald-300 border border-emerald-500/40' : 'bg-blue-600/30 text-blue-300 border border-blue-500/40'}" title="${hasTemplate ? 'Remplacer le template' : 'Charger un template Excel'}">
                        <i class="fa-solid fa-file-excel text-xs"></i>
                        <span>${hasTemplate ? 'Template ✓' : '+ Template'}</span>
                    </button>

                    <!-- Colonnes (Always active on every model) -->
                    <button onclick="openMappingModal('${mName}')" class="px-2.5 py-1.5 rounded-xl text-[10px] font-bold flex items-center gap-1.5 bg-[#15194a] text-[#00ffaa] hover:bg-[#252b75] border border-[#00ffaa]/40 transition shadow-sm active:scale-95" title="Configurer les colonnes Excel">
                        <i class="fa-solid fa-table-columns text-xs"></i>
                        <span>${hasMapping ? 'Colonnes ✓' : 'Colonnes'}</span>
                    </button>

                    ${hasTemplate ? `
                        <button onclick="deleteTemplate('${mName}')" class="px-2 py-1.5 rounded-xl text-[10px] font-bold flex items-center gap-1 bg-rose-600/20 hover:bg-rose-600 text-rose-400 hover:text-white border border-rose-500/30 transition" title="Supprimer le fichier template">
                            <i class="fa-solid fa-xmark text-xs"></i>
                        </button>
                    ` : ''}
                </div>

                <!-- Dynamic Custom Field Tags Section -->
                <div class="pt-2 border-t border-[#252b75]/70 space-y-1.5">
                    <div class="flex items-center justify-between text-[10px] text-gray-400 font-bold uppercase tracking-wider">
                        <span>Champs spécifiques (Tags)</span>
                        <span class="text-[9px] text-[#00ffaa] font-mono">${fields.length} champ(s)</span>
                    </div>

                    <div class="flex flex-wrap gap-1.5 items-center pt-0.5">
                        ${fields.map(f => `
                            <span class="inline-flex items-center gap-1.5 bg-[#15194a] text-cyan-300 px-2 py-1 rounded-lg border border-cyan-500/30 text-[10px] font-semibold group hover:border-cyan-400 transition">
                                <span>${f}</span>
                                <button type="button" onclick="DPW_DB.deleteModelTag('${mName}', '${f}')" class="text-gray-400 hover:text-rose-400 transition p-0.5" title="Supprimer le tag">✕</button>
                            </span>
                        `).join('')}

                        <!-- Add Tag Button -->
                        <button type="button" onclick="DPW_DB.promptAddModelTag('${mName}')" class="inline-flex items-center gap-1 bg-[#15194a]/80 hover:bg-[#252b75] text-[#00ffaa] px-2 py-1 rounded-lg border border-[#00ffaa]/40 text-[10px] font-bold transition active:scale-95" title="Ajouter un nouveau champ à ce modèle">
                            <i class="fa-solid fa-plus text-[9px]"></i>
                            <span>+ Champ</span>
                        </button>
                    </div>
                </div>
            `;

            listEl.appendChild(card);
        });
    }

    /**
     * Enhanced open mapping modal loading latest persistent configuration from IndexedDB
     */
    function openEnhancedMappingModal(modelName) {
        document.body.classList.add('modal-open');
        const keyInp = document.getElementById('mappingModelKey');
        const titleTarget = document.getElementById('txtMappingTargetModel');
        if (keyInp) keyInp.value = modelName;
        if (titleTarget) titleTarget.innerText = `Modèle : ${modelName}`;

        const savedMapping = (window.DPW_DB && typeof window.DPW_DB.getTemplateMapping === 'function')
            ? window.DPW_DB.getTemplateMapping(modelName)
            : { startRow: 2, columns: {} };

        const startRowInp = document.getElementById('mappingStartRow');
        if (startRowInp) startRowInp.value = savedMapping.startRow || 2;

        const container = document.getElementById('mappingFieldsContainer');
        if (!container) return;
        container.innerHTML = '';

        const standardFields = (window.DPW_DB && typeof window.DPW_DB.getStandardFields === 'function')
            ? window.DPW_DB.getStandardFields()
            : [
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

        const colOptions = (window.DPW_DB && typeof window.DPW_DB.getColumnLetterList === 'function')
            ? window.DPW_DB.getColumnLetterList()
            : ['None', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'];

        // Standard fields mapping
        standardFields.forEach(f => {
            const currentVal = savedMapping.columns ? (savedMapping.columns[f.key] || f.defaultCol) : f.defaultCol;
            const div = document.createElement('div');
            div.className = "bg-[#15194a] p-2.5 rounded-xl border border-[#252b75] space-y-1";
            div.innerHTML = `
                <label class="block text-[11px] font-semibold text-gray-200 truncate" title="${f.label}">${f.label}</label>
                <select data-mapping-key="${f.key}" class="w-full input-dpw p-1.5 rounded-lg text-xs font-bold text-[#00ffaa] bg-[#1d2263]">
                    ${colOptions.map(c => `<option value="${c}" ${c === currentVal ? 'selected' : ''}>${c === 'None' ? 'Ne pas exporter' : 'Colonne ' + c}</option>`).join('')}
                </select>
            `;
            container.appendChild(div);
        });

        // Custom fields / tags mapping
        const modelConfigs = (window.DPW_DB && window.DPW_DB.modelConfigs) ? window.DPW_DB.modelConfigs : {};
        const customFields = modelConfigs[modelName] || [];
        customFields.forEach((cf, idx) => {
            const customKey = `custom_${cf}`;
            const autoCol = colOptions[11 + idx] || 'K';
            const currentVal = savedMapping.columns ? (savedMapping.columns[customKey] || autoCol) : autoCol;

            const div = document.createElement('div');
            div.className = "bg-[#15194a] p-2.5 rounded-xl border border-amber-500/40 space-y-1";
            div.innerHTML = `
                <label class="block text-[11px] font-semibold text-amber-300 truncate" title="${cf}">${cf} (Tag Spécifique)</label>
                <select data-mapping-key="${customKey}" class="w-full input-dpw p-1.5 rounded-lg text-xs font-bold text-amber-400 bg-[#1d2263]">
                    ${colOptions.map(c => `<option value="${c}" ${c === currentVal ? 'selected' : ''}>${c === 'None' ? 'Ne pas exporter' : 'Colonne ' + c}</option>`).join('')}
                </select>
            `;
            container.appendChild(div);
        });

        const modal = document.getElementById('templateMappingModal');
        if (modal) modal.classList.remove('hidden');
    }

    /**
     * Enhanced save template mapping instantly overwriting IndexedDB
     */
    async function saveEnhancedTemplateMapping(e) {
        if (e) e.preventDefault();
        const modelName = document.getElementById('mappingModelKey')?.value;
        if (!modelName) return;

        const startRow = parseInt(document.getElementById('mappingStartRow')?.value, 10) || 2;
        const columns = {};
        const selects = document.querySelectorAll('[data-mapping-key]');
        selects.forEach(s => {
            const key = s.getAttribute('data-mapping-key');
            const val = s.value;
            if (val && val !== 'None') {
                columns[key] = val;
            }
        });

        if (window.DPW_DB && typeof window.DPW_DB.saveTemplateMapping === 'function') {
            await window.DPW_DB.saveTemplateMapping(modelName, { startRow, columns });
        }

        const modal = document.getElementById('templateMappingModal');
        if (modal) modal.classList.add('hidden');
        document.body.classList.remove('modal-open');

        renderEnhancedModelsList();
        if (window.showToast) {
            window.showToast(`✓ Configuration des colonnes enregistrée pour "${modelName}"`);
        }
    }

    // Expose enhanced global functions
    window.renderModelsList = renderEnhancedModelsList;
    window.openMappingModal = openEnhancedMappingModal;
    window.saveTemplateMapping = saveEnhancedTemplateMapping;
    window.exportModelCard = (mName) => window.DPW_EXCEL.exportModel(mName);

    // Setup MutationObserver & Auto-sync for UI rendering
    function initUIHooks() {
        const modelsList = document.getElementById('modelsList');
        if (modelsList) {
            const observer = new MutationObserver((mutations) => {
                let needsEnhance = false;
                for (const m of mutations) {
                    if (m.type === 'childList') {
                        const hasUnenhanced = Array.from(modelsList.children).some(c => !c.classList.contains('dpw-enhanced-card'));
                        if (hasUnenhanced) {
                            needsEnhance = true;
                            break;
                        }
                    }
                }
                if (needsEnhance) {
                    observer.disconnect();
                    renderEnhancedModelsList();
                    observer.observe(modelsList, { childList: true });
                }
            });
            observer.observe(modelsList, { childList: true });
        }

        if (window.DPW_DB) {
            window.DPW_DB.on('models', () => renderEnhancedModelsList());
            window.DPW_DB.on('templates', () => renderEnhancedModelsList());
            window.DPW_DB.on('mappings', () => renderEnhancedModelsList());
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initUIHooks);
    } else {
        initUIHooks();
    }

})(window);
