/**
 * DP WORLD DJENDJEN - CONTAINER TALLYING PWA
 * ExcelJS Template Injection & Export Engine
 */

(function(window) {
    'use strict';

    class ExcelEngine {
        constructor() {}

        /**
         * Converts ArrayBuffer to Base64 string in chunks to prevent stack overflow
         * @param {ArrayBuffer} arrayBuffer 
         * @returns {string} Base64 string
         */
        arrayBufferToBase64(arrayBuffer) {
            const bytes = new Uint8Array(arrayBuffer);
            let binary = '';
            const chunkSize = 8192;
            for (let i = 0; i < bytes.length; i += chunkSize) {
                const chunk = bytes.subarray(i, i + chunkSize);
                binary += String.fromCharCode.apply(null, chunk);
            }
            return btoa(binary);
        }

        /**
         * Converts Base64 string to ArrayBuffer
         * @param {string} base64 
         * @returns {ArrayBuffer}
         */
        base64ToArrayBuffer(base64) {
            const binaryString = atob(base64);
            const len = binaryString.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            return bytes.buffer;
        }

        /**
         * Parses and validates an uploaded Excel file for use as a template
         * @param {File} file 
         * @param {function} onProgress 
         * @returns {Promise<{ base64: string, sheetNames: string[] }>}
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
                        const base64Data = this.arrayBufferToBase64(arrayBuffer);

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
         * @param {string} base64Template 
         * @param {object} mappingConfig { startRow: number, columns: { [key]: string } }
         * @param {Array} dataToExport 
         * @param {string} modelName 
         * @returns {Promise<Blob>}
         */
        async injectIntoTemplate(base64Template, mappingConfig, dataToExport, modelName) {
            const arrayBuffer = this.base64ToArrayBuffer(base64Template);
            const workbook = new ExcelJS.Workbook();
            await workbook.xlsx.load(arrayBuffer);

            const worksheet = workbook.worksheets[0];
            if (!worksheet) throw new Error('Worksheet not found in template');

            let currentRow = parseInt(mappingConfig.startRow, 10) || 2;
            const cols = mappingConfig.columns || {};

            dataToExport.forEach((c) => {
                if (cols.id) worksheet.getCell(`${cols.id}${currentRow}`).value = String(c.id || '');
                if (cols.type) worksheet.getCell(`${cols.type}${currentRow}`).value = String(c.type || '');
                if (cols.loc) worksheet.getCell(`${cols.loc}${currentRow}`).value = String(c.loc || '');
                if (cols.seal) worksheet.getCell(`${cols.seal}${currentRow}`).value = String(c.seal || '');
                if (cols.status) worksheet.getCell(`${cols.status}${currentRow}`).value = String(c.status || '');
                if (cols.date) worksheet.getCell(`${cols.date}${currentRow}`).value = String(c.date || '');
                if (cols.time) worksheet.getCell(`${cols.time}${currentRow}`).value = String(c.time || '');
                if (cols.agent) worksheet.getCell(`${cols.agent}${currentRow}`).value = String(c.agent || '');
                if (cols.notes) worksheet.getCell(`${cols.notes}${currentRow}`).value = String(c.notes || '');

                if (c.customData) {
                    for (const [k, v] of Object.entries(c.customData)) {
                        const customColKey = `custom_${k}`;
                        if (cols[customColKey]) {
                            worksheet.getCell(`${cols[customColKey]}${currentRow}`).value = String(v || '-');
                        }
                    }
                }
                currentRow++;
            });

            const buffer = await workbook.xlsx.writeBuffer();
            return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        }

        /**
         * Generates a standard multi-sheet branded Excel report
         * @param {Array} dataToExport 
         * @param {object} modelConfigs 
         * @param {string} selectedModel 
         * @returns {Promise<Blob>}
         */
        async generateStandardReport(dataToExport, modelConfigs, selectedModel = 'All') {
            const workbook = new ExcelJS.Workbook();
            const models = (selectedModel === 'All') ? Object.keys(modelConfigs) : [selectedModel];

            let addedSheetCount = 0;

            models.forEach(mName => {
                const filtered = (selectedModel === 'All') 
                    ? dataToExport.filter(c => c.model === mName) 
                    : dataToExport;

                if (filtered.length > 0) {
                    addedSheetCount++;
                    const safeSheetName = mName.replace(/[*?:/\\\[\]]/g, '').substring(0, 30);
                    const worksheet = workbook.addWorksheet(safeSheetName || 'Pointage');

                    const customFields = modelConfigs[mName] || [];
                    const columns = [
                        { header: "Date", key: "date", width: 12 },
                        { header: "Heure", key: "time", width: 10 },
                        { header: "N° Conteneur", key: "id", width: 18 },
                        { header: "Étape Flux", key: "stage", width: 16 },
                        { header: "Type & Taille", key: "type", width: 14 },
                        { header: "Emplacement", key: "loc", width: 16 },
                        { header: "État", key: "status", width: 14 },
                        { header: "N° Plomb", key: "seal", width: 14 },
                        { header: "Pointeur", key: "agent", width: 14 }
                    ];

                    customFields.forEach(cf => {
                        columns.push({ header: cf, key: `custom_${cf}`, width: 16 });
                    });

                    columns.push({ header: "Remarques", key: "notes", width: 25 });
                    worksheet.columns = columns;

                    // Header styling
                    const headerRow = worksheet.getRow(1);
                    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
                    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF15194A' } };
                    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

                    filtered.forEach(c => {
                        const rowData = {
                            date: c.date || '',
                            time: c.time || '',
                            id: c.id || '',
                            stage: c.stage || "En Stockage",
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
                        worksheet.addRow(rowData);
                    });
                }
            });

            // If no model specific sheets were created, create a fallback general sheet
            if (addedSheetCount === 0 && dataToExport.length > 0) {
                const worksheet = workbook.addWorksheet('Conteneurs');
                worksheet.columns = [
                    { header: "Date", key: "date", width: 12 },
                    { header: "Heure", key: "time", width: 10 },
                    { header: "N° Conteneur", key: "id", width: 18 },
                    { header: "Modèle", key: "model", width: 16 },
                    { header: "Étape", key: "stage", width: 14 },
                    { header: "Type", key: "type", width: 14 },
                    { header: "Emplacement", key: "loc", width: 14 },
                    { header: "État", key: "status", width: 12 },
                    { header: "Plomb", key: "seal", width: 12 },
                    { header: "Pointeur", key: "agent", width: 14 },
                    { header: "Remarques", key: "notes", width: 25 }
                ];

                const headerRow = worksheet.getRow(1);
                headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
                headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF15194A' } };

                dataToExport.forEach(c => {
                    worksheet.addRow({
                        date: c.date || '',
                        time: c.time || '',
                        id: c.id || '',
                        model: c.model || '',
                        stage: c.stage || '',
                        type: c.type || '',
                        loc: c.loc || '',
                        status: c.status || '',
                        seal: c.seal || '',
                        agent: c.agent || '',
                        notes: c.notes || ''
                    });
                });
            }

            const buffer = await workbook.xlsx.writeBuffer();
            return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        }

        /**
         * High-level export dispatcher: uses template injection if available, otherwise generates standard report
         */
        async export({ containers, modelConfigs, modelTemplates, templateMappings, stageFilter = 'All', modelFilter = 'All' }) {
            let dataToExport = [...containers];
            if (stageFilter !== 'All') {
                dataToExport = dataToExport.filter(c => (c.stage || 'Stock') === stageFilter);
            }
            if (modelFilter !== 'All') {
                dataToExport = dataToExport.filter(c => c.model === modelFilter);
            }

            if (dataToExport.length === 0) {
                return { success: false, reason: 'empty' };
            }

            const targetModel = (modelFilter !== 'All') ? modelFilter : (dataToExport[0]?.model || Object.keys(modelConfigs)[0]);
            const base64Template = modelTemplates ? modelTemplates[targetModel] : null;
            const mappingConfig = templateMappings ? templateMappings[targetModel] : null;

            // 1. If custom template & mapping exists, perform direct ExcelJS injection
            if (base64Template && mappingConfig) {
                try {
                    const blob = await this.injectIntoTemplate(base64Template, mappingConfig, dataToExport, targetModel);
                    const safeName = targetModel.replace(/\s+/g, '_');
                    const fileName = `DPW_${safeName}_${new Date().toISOString().slice(0, 10)}.xlsx`;
                    
                    if (typeof saveAs !== 'undefined') {
                        saveAs(blob, fileName);
                    }
                    return { success: true, mode: 'template', fileName };
                } catch (err) {
                    console.warn('Template injection failed, falling back to standard export:', err);
                }
            }

            // 2. Standard multi-sheet formatted workbook
            const blob = await this.generateStandardReport(dataToExport, modelConfigs, modelFilter);
            const fileName = `Pointeur_DPW_Rapport_${new Date().toISOString().slice(0, 10)}.xlsx`;
            if (typeof saveAs !== 'undefined') {
                saveAs(blob, fileName);
            }
            return { success: true, mode: 'standard', fileName };
        }
    }

    // Expose global singleton instance
    window.DPW_EXCEL = new ExcelEngine();

})(window);
