// Forza l'esportazione delle variabili sul contesto globale della finestra (Window)
window.db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
window.allClients = [];
window.listLavoratori = [];
window.currentClienteId = null;
window.currentCommessaId = null;
window.currentCommessa = null;
window.currentFilterSubTab = 'all'; // Ripristinato lo stato del filtro

window.workflowOrdinato = [
    "PRIMO_CONTATTO",
    "PREVENTIVAZIONE",
    "MISURE_ESECUTIVE",
    "FATTURA_ACCONTO",
    "ORDINI_FORNITORI",
    "INSTALLAZIONE",
    "SALDO_CONCLUSO"
];

window.navigateTo = function(screen) {
    if(document.getElementById('mainScreen')) document.getElementById('mainScreen').classList.add('hidden');
    if(document.getElementById('clientHubScreen')) document.getElementById('clientHubScreen').classList.add('hidden');
    if(document.getElementById('detailScreen')) document.getElementById('detailScreen').classList.add('hidden');
    if(document.getElementById('settingsScreen')) document.getElementById('settingsScreen').classList.add('hidden');
    
    document.getElementById('navBtnClienti').className = "flex flex-col items-center text-slate-400 font-medium flex-1";
    document.getElementById('navBtnSettings').className = "flex flex-col items-center text-slate-400 font-medium flex-1";

    if (screen === 'main') {
        document.getElementById('navBtnClienti').className = "flex flex-col items-center text-blue-600 font-semibold flex-1";
        if(document.getElementById('mainScreen')) document.getElementById('mainScreen').classList.remove('hidden');
        window.fetchClienti();
    } else if (screen === 'hub') {
        if(document.getElementById('clientHubScreen')) document.getElementById('clientHubScreen').classList.remove('hidden');
        window.renderClientHub();
    } else if (screen === 'detail') {
        if(document.getElementById('detailScreen')) document.getElementById('detailScreen').classList.remove('hidden');
    } else if (screen === 'settings') {
        document.getElementById('navBtnSettings').className = "flex flex-col items-center text-blue-600 font-semibold flex-1";
        if(document.getElementById('settingsScreen')) document.getElementById('settingsScreen').classList.remove('hidden');
        window.renderSettingsScreen();
    }
}

window.initLists = async function() {
    try {
        let { data: w, error } = await window.db.from('lavoratori').select('*').order('nome', { ascending: true });
        if (error) throw error;
        window.listLavoratori = w || [];
        window.populateSelects();
        window.initSediDefaultLocalStorage();
    } catch (err) {
        console.error("Errore inizializzazione lavoratori:", err.message);
    }
}

window.populateSelects = function() {
    const sels = ['workerContattoSelect', 'workerAssegnatoSelect', 'workerMisureSelect', 'workerPreventivoSelect'];
    sels.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = `<option value="">-- Seleziona Operatore --</option>` + window.listLavoratori.map(l => `<option value="${l.id}">${l.nome}</option>`).join('');
    });
}

window.populateSediSelect = function() {
    const el = document.getElementById('modalSedeInput');
    if (!el) return;
    const sedi = window.getSediFromLocal();
    if(sedi.length === 0) {
        el.innerHTML = `<option value="">--⚠️ Nessuna sede! Configurala in Impostazioni --</option>`;
    } else {
        el.innerHTML = sedi.map(s => `<option value="${s}">${s}</option>`).join('');
    }
}

window.fetchClienti = async function() {
    try {
        const { data, error } = await window.db.from('clienti').select('*, commesse(*)').order('denominazione', { ascending: true });
        if (error) throw error;
        if (data) window.allClients = data;
        if (document.getElementById('mainScreen') && !document.getElementById('mainScreen').classList.contains('hidden')) window.renderClientsList();
    } catch (err) {
        console.error("Errore nel recupero clienti:", err.message);
        alert("Impossibile scaricare l'elenco dei clienti.");
    }
}

window.renderClientsList = function() {
    const container = document.getElementById('clientList'); 
    if (!container) return;
    container.innerHTML = "";
    if(document.getElementById('loading')) document.getElementById('loading').classList.add('hidden'); 
    container.classList.remove('hidden');
    const term = document.getElementById('searchClient').value.toLowerCase().trim();

    // Filtro avanzato in corso / completati basato sulle commesse dello stato macro
    let listFiltrata = window.allClients.filter(c => {
        const matchesSearch = c.denominazione.toLowerCase().includes(term);
        if (!matchesSearch) return false;

        if (window.currentFilterSubTab === 'all') return true;
        
        const haCommesseAttive = c.commesse && c.commesse.some(com => com.stato_macro !== 'SALDO_CONCLUSE' && com.stato_macro !== 'SALDO_CONCLUSO');
        if (window.currentFilterSubTab === 'incorso') return haCommesseAttive;
        if (window.currentFilterSubTab === 'conclusi') return (c.commesse && c.commesse.length > 0 && !haCommesseAttive);
        return true;
    });
    
    if (listFiltrata.length === 0) {
        container.innerHTML = `<p class="text-xs p-4 text-center text-slate-400">Nessun cliente corrisponde.</p>`;
        return;
    }

    listFiltrata.forEach(cliente => {
        const card = document.createElement('div');
        card.className = "bg-white p-4 rounded-xl shadow-sm border border-slate-200 cursor-pointer text-sm font-semibold flex justify-between items-center";
        
        const mainClickable = document.createElement('div');
        mainClickable.className = "flex-1 pr-2";
        mainClickable.onclick = () => { window.currentClienteId = cliente.id; window.navigateTo('hub'); };
        mainClickable.innerHTML = `👤 ${cliente.denominazione}<p class="text-xs font-normal text-slate-400 mt-1">📍 ${cliente.indirizzo_fatturazione || 'Non indicato'}</p>`;
        
        const actionsContainer = document.createElement('div');
        actionsContainer.className = "flex items-center space-x-3 shrink-0 pl-1";
        
        if (cliente.telefono) {
            const telBtn = document.createElement('button');
            telBtn.className = "p-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-base shadow-sm";
            telBtn.innerText = "📞";
            telBtn.onclick = (e) => {
                e.stopPropagation();
                if(confirm(`Chiamare il numero?\n📞 Tel: ${cliente.telefono}`)) window.location.href = `tel:${cliente.telefono}`;
            };
            actionsContainer.appendChild(telBtn);
        }
        
        if (cliente.email) {
            const mailBtn = document.createElement('button');
            mailBtn.className = "p-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-base shadow-sm";
            mailBtn.innerText = "✉️";
            mailBtn.onclick = (e) => { e.stopPropagation(); window.location.href = `mailto:${cliente.email}`; };
            actionsContainer.appendChild(mailBtn);
        }
        card.appendChild(mainClickable); card.appendChild(actionsContainer); container.appendChild(card);
    });
}

window.filterClients = function() { window.renderClientsList(); }

// Ripristinata la funzione per lo switch dei sotto tab della home
window.switchClientSubTab = function(tab) {
    window.currentFilterSubTab = tab;
    ['all', 'incorso', 'conclusi'].forEach(t => {
        const btn = document.getElementById(`subTabClienti${t.charAt(0).toUpperCase() + t.slice(1)}`);
        if(btn) btn.className = "flex-1 py-1.5 text-center rounded-lg transition-all";
    });
    const activeBtn = document.getElementById(`subTabClienti${tab.charAt(0).toUpperCase() + tab.slice(1)}`);
    if(activeBtn) activeBtn.className = "flex-1 py-1.5 text-center rounded-lg bg-white text-slate-900 shadow-sm transition-all";
    window.renderClientsList();
}

window.renderClientHub = function() {
    const cliente = window.allClients.find(c => c.id === window.currentClienteId);
    if (!cliente) return;
    document.getElementById('hubClientName').innerText = cliente.denominazione;
    document.getElementById('hubClientInfo').innerText = `📞 ${cliente.telefono || 'N/D'} | ✉️ ${cliente.email || 'N/D'}`;
    
    let piva = cliente.partita_iva ? `P.IVA: ${cliente.partita_iva}` : '';
    let cf = cliente.codice_fiscale ? `C.F.: ${cliente.codice_fiscale}` : '';
    document.getElementById('hubClientFiscale').innerText = [piva, cf].filter(Boolean).join(' | ') || 'Nessun dato fiscale';

    const listContainer = document.getElementById('hubCommesseList'); if(!listContainer) return;
    listContainer.innerHTML = "";

    if (!cliente.commesse || cliente.commesse.length === 0) { 
        listContainer.innerHTML = `<p class="text-xs p-4 text-center text-slate-400">Nessuna commessa registrata.</p>`; return; 
    }
    
    cliente.commesse.forEach(com => {
        const div = document.createElement('div'); div.className = "bg-white p-4 rounded-xl border flex justify-between items-center text-xs mt-2 shadow-sm font-medium";
        const mainInfo = document.createElement('div'); mainInfo.className = "flex-1 pr-4 cursor-pointer";
        mainInfo.onclick = () => { window.openCommessaWorkspace(com.id); };
        const dataCreazione = new Date(com.created_at).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });

        mainInfo.innerHTML = `
            <div class="flex items-center space-x-1.5 flex-wrap gap-y-1">
                <span class="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded macro-${com.stato_macro}">${com.stato_macro}</span>
                <span class="text-[9px] font-bold bg-slate-100 border text-slate-600 px-1.5 py-0.5 rounded uppercase">🏢 ${com.sede_assegnazione || 'Sede N/D'}</span>
                <span class="text-xs font-bold text-blue-600 ml-1 flex-1">${com.titolo_lavoro || 'Lavoro Senza Titolo'}</span>
            </div>
            <h4 class="font-semibold text-slate-700 mt-1">📍 Cantiere: ${com.indirizzo_cantiere}</h4>
            <p class="text-[10px] text-slate-400 mt-0.5">📅 Creazione: ${dataCreazione}</p>
        `;
        
        const btnOpt = document.createElement('button'); btnOpt.className = "p-2 text-xs bg-slate-50 hover:bg-slate-100 border text-slate-500 rounded-lg font-bold ml-2"; btnOpt.innerText = "⚙️";
        btnOpt.onclick = (e) => {
            e.stopPropagation();
            document.getElementById('commessaModalTitle').innerText = "Modifica Dati Commessa";
            document.getElementById('modalCommessaId').value = com.id;
            document.getElementById('modalTitoloInput').value = com.titolo_lavoro || '';
            document.getElementById('modalCantiereInput').value = com.indirizzo_cantiere;
            window.populateSediSelect();
            document.getElementById('modalSedeInput').value = com.sede_assegnazione || '';
            document.getElementById('commessaModal').classList.remove('hidden');
        };
        div.appendChild(mainInfo); div.appendChild(btnOpt); listContainer.appendChild(div);
    });
}

window.openCommessaWorkspace = function(commessaId) {
    const cliente = window.allClients.find(c => c.id === window.currentClienteId);
    if(!cliente) return;
    window.currentCommessa = cliente.commesse.find(com => com.id === commessaId); window.currentCommessaId = commessaId;
    if(!window.currentCommessa) return;

    document.getElementById('commessaClientName').innerText = cliente.denominazione;
    document.getElementById('commessaTitleHeader').innerText = window.currentCommessa.titolo_lavoro || 'Senza Titolo';
    
    const sBadge = document.getElementById('commessaBadgeSede');
    if(sBadge) sBadge.innerText = window.currentCommessa.sede_assegnazione ? `🏢 ${window.currentCommessa.sede_assegnazione}` : '🏢 Sede non assegnata';

    const cantiereBox = document.getElementById('commessaCantiereBox');
    if (cantiereBox) {
        if (window.currentCommessa.indirizzo_cantiere) {
            const encodedAddr = encodeURIComponent(window.currentCommessa.indirizzo_cantiere);
            cantiereBox.innerHTML = `<a href="http://googleusercontent.com/maps.google.com/maps?q=${encodedAddr}" target="_blank" class="text-blue-600 font-medium hover:underline">📍 Cantiere: ${window.currentCommessa.indirizzo_cantiere} 🗺️</a>`;
        } else { cantiereBox.innerHTML = `<span class="text-slate-400 italic">📍 Cantiere: non specificato</span>`; }
    }
    
    document.getElementById('commessaMacroSelect').value = window.currentCommessa.stato_macro;
    if(document.getElementById('workerContattoSelect')) document.getElementById('workerContattoSelect').value = window.currentCommessa.contatto_gestito_da || '';
    if(document.getElementById('workerAssegnatoSelect')) document.getElementById('workerAssegnatoSelect').value = window.currentCommessa.preventivo_assegnato_a || '';
    if(document.getElementById('subStatoPreventivo')) document.getElementById('subStatoPreventivo').value = window.currentCommessa.preventivo_stato || 'IN_CORSO';
    if(document.getElementById('dateInvioPrev')) document.getElementById('dateInvioPrev').value = window.currentWorkspaceValue('preventivo_data_invio');
    
    if(document.getElementById('dateReminderPrev')) {
        const dataScadenzaMappata = window.currentWorkspaceValue('preventivo_scadenza_promemoria');
        if(dataScadenzaMappata) {
            const scadenzaDate = new Date(dataScadenzaMappata); const oggiDate = new Date();
            oggiDate.setHours(0,0,0,0); scadenzaDate.setHours(0,0,0,0);
            const diffTempo = scadenzaDate.getTime() - oggiDate.getTime();
            const diffGiorni = Math.ceil(diffTempo / (1000 * 60 * 60 * 24));
            document.getElementById('dateReminderPrev').value = diffGiorni > 0 ? diffGiorni : 0;
        } else {
            const savedDefault = localStorage.getItem('defaultDaysToExpiry');
            document.getElementById('dateReminderPrev').value = savedDefault ? savedDefault : "";
        }
    }
    
    if(document.getElementById('workerMisureSelect')) document.getElementById('workerMisureSelect').value = window.currentWorkspaceValue('tecnico_misure');
    if(document.getElementById('subStatoContratto')) document.getElementById('subStatoContratto').value = window.currentCommessa.contract_stato || 'REDZIONE';
    if(document.getElementById('workerPreventivoSelect')) document.getElementById('workerPreventivoSelect').value = "";

    document.getElementById('faseAnnotazioniInput').value = ""; document.getElementById('annotazioniPreventivoInput').value = "";
    document.getElementById('charCounter').innerText = "0 / 150";

    window.adjustWorkerLabels(window.currentCommessa.stato_macro); window.fetchDiarioTimeline(); 
    if (typeof window.fetchPreventivoTimeline === 'function') window.fetchPreventivoTimeline(); 
    window.navigateTo('detail'); window.renderTabPrivileges(window.currentCommessa.stato_macro);
}

window.currentWorkspaceValue = function(field) { return (window.currentCommessa && window.currentCommessa[field]) ? window.currentCommessa[field] : ''; }

window.adjustWorkerLabels = function(fase) {
    const lblWorker1 = document.getElementById('lblWorkerContatto'); const boxWorker2 = document.getElementById('boxWorkerAssegnato');
    if (fase === 'PRIMO_CONTATTO') { if (lblWorker1) lblWorker1.innerText = "Contatto preso da: *"; if (boxWorker2) boxWorker2.classList.remove('hidden'); } 
    else { if (lblWorker1) lblWorker1.innerText = "Incaricato: *"; if (boxWorker2) boxWorker2.classList.add('hidden'); }
}

window.switchTab = function(tab) {
    if (window.currentCommessa && window.currentCommessa.stato_macro === 'PRIMO_CONTATTO' && tab !== 'diario') { alert("🔒 SEZIONE BLOCCATA:\nAccessibile dallo stato '2. PREVENTIVAZIONE'."); return; }
    ['diario', 'preventiviTab', 'contrattoTab'].forEach(t => {
        const target = document.getElementById(`tabContent${t === 'diario' ? 'Diario' : (t === 'preventiviTab' ? 'PreventiviTab' : 'ContrattoTab')}`); if(target) target.classList.add('hidden');
        const btn = document.getElementById(`tabBtn${t.charAt(0).toUpperCase() + t.slice(1)}`); if(btn) btn.className = "flex-1 py-2 text-center rounded-lg transition-all";
    });
    const contentId = tab === 'diario' ? 'tabContentDiario' : (tab === 'preventiviTab' ? 'tabContentPreventiviTab' : (tab === 'contrattoTab' ? 'tabContentContrattoTab' : 'tabContentDiario'));
    if(document.getElementById(contentId)) document.getElementById(contentId).classList.remove('hidden');
    const activeBtn = document.getElementById(`tabBtn${tab.charAt(0).toUpperCase() + tab.slice(1)}`); if(activeBtn) activeBtn.className = "flex-1 py-2 text-center rounded-lg bg-white text-slate-900 shadow-sm transition-all";
}

window.fetchDiarioTimeline = function() {
    const container = document.getElementById('diarioTimeline'); if(!container) return; container.innerHTML = "";
    if (!window.currentCommessa || !window.currentCommessa.note_cantiere) { container.innerHTML = `<p class="text-xs text-slate-400 text-center py-4">Nessuna azione.</p>`; return; }
    window.currentCommessa.note_cantiere.split('\n').reverse().forEach(l => { if(l.trim()) { const r = document.createElement('div'); r.className = "bg-white p-2.5 rounded-xl border text-xs mt-1 text-slate-700 shadow-sm"; r.innerText = l; container.appendChild(r); } });
}

window.addDiarioNote = async function() {
    const input = document.getElementById('newDiarioNote'); const btn = document.getElementById('btnSendDiario'); const txt = input.value.trim(); if (!txt) return;
    try {
        btn.disabled = true; const t = new Date().toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute:'2-digit' });
        let full = window.currentCommessa.note_cantiere ? window.currentCommessa.note_cantiere + '\n' + `📝 [${t}] - Nota: ${txt}` : `📝 [${t}] - Nota: ${txt}`;
        await window.db.from('commesse').update({ note_cantiere: full }).eq('id', window.currentCommessaId); window.currentCommessa.note_cantiere = full; input.value = ""; window.fetchDiarioTimeline();
    } catch (err) { console.error(err); } finally { btn.disabled = false; }
}

window.updateCommessaField = async function(field, value) { try { await window.db.from('commesse').update({ [field]: value }).eq('id', window.currentCommessaId); if(window.currentCommessa) window.currentCommessa[field] = value; } catch (err) { console.error(err); } }
window.updateWorker = async function(field, value) { await window.updateCommessaField(field, value === "" ? null : value); }

window.openNewCommessaModal = function() { document.getElementById('commessaModalTitle').innerText = "Nuova Commessa"; document.getElementById('modalCommessaId').value = ""; document.getElementById('modalTitoloInput').value = ""; document.getElementById('modalCantiereInput').value = ""; window.populateSediSelect(); document.getElementById('commessaModal').classList.remove('hidden'); }
window.openCommessaEditModalCurrent = function() { document.getElementById('commessaModalTitle').innerText = "Modifica Dati"; document.getElementById('modalCommessaId').value = window.currentCommessaId; document.getElementById('modalTitoloInput').value = window.currentCommessa.titolo_lavoro || ''; document.getElementById('modalCantiereInput').value = window.currentCommessa.indirizzo_cantiere; window.populateSediSelect(); document.getElementById('modalSedeInput').value = window.currentCommessa.sede_assegnazione || ''; document.getElementById('commessaModal').classList.remove('hidden'); }
window.closeCommessaModal = function() { document.getElementById('commessaModal').classList.add('hidden'); }

window.saveCommessaDati = async function() {
    const id = document.getElementById('modalCommessaId').value; const btn = document.getElementById('btnSaveCommessa'); const titolo = document.getElementById('modalTitoloInput').value.trim(); const cantiere = document.getElementById('modalCantiereInput').value.trim(); const sedeScelta = document.getElementById('modalSedeInput').value;
    if (!cantiere || !titolo || !sedeScelta) { alert("Campi obbligatori!"); return; }
    try {
        btn.disabled = true;
        if (id) { 
            await window.db.from('commesse').update({ titolo_lavoro: titolo, indirizzo_cantiere: cantiere, sede_assegnazione: sedeScelta }).eq('id', id);
            if(window.currentCommessa) { window.currentCommessa.titolo_lavoro = titolo; window.currentCommessa.indirizzo_cantiere = cantiere; window.currentCommessa.sede_assegnazione = sedeScelta; const sBadge = document.getElementById('commessaBadgeSede'); if(sBadge) sBadge.innerText = `🏢 ${sedeScelta}`; } 
        } else { await window.db.from('commesse').insert([{ cliente_id: window.currentClienteId, titolo_lavoro: titolo, indirizzo_cantiere: cantiere, stato_macro: 'PRIMO_CONTATTO', sede_assegnazione: sedeScelta }]); }
        window.closeCommessaModal(); await window.fetchClienti(); window.renderClientHub();
    } catch (err) { alert(err.message); } finally { btn.disabled = false; }
}

window.openAnagraficaModal = function() { const c = window.allClients.find(cl => cl.id === window.currentClienteId); if (!c) return; document.getElementById('editDenominazione').value = c.denominazione || ''; document.getElementById('editIndirizzo').value = c.indirizzo_fatturazione || ''; document.getElementById('editTelefono').value = c.telefono || ''; document.getElementById('editEmail').value = c.email || ''; document.getElementById('editPartitaIva').value = c.partita_iva || ''; document.getElementById('editCodiceFiscale').value = c.codice_fiscale || ''; document.getElementById('editNote').value = c.note_generali || ''; document.getElementById('anagraficaModal').classList.remove('hidden'); }
window.closeAnagraficaModal = function() { document.getElementById('anagraficaModal').classList.add('hidden'); }

window.updateAnagrafica = async function() {
    const btn = document.getElementById('btnUpdateAnagrafica'); const d = document.getElementById('editDenominazione').value.trim(); const i = document.getElementById('editIndirizzo').value.trim(); const tel = document.getElementById('editTelefono').value.trim(); const em = document.getElementById('editEmail').value.trim(); const piva = document.getElementById('editPartitaIva').value.trim(); const cf = document.getElementById('editCodiceFiscale').value.trim(); const n = document.getElementById('editNote').value.trim(); if(!d) return;
    try { btn.disabled = true; await window.db.from('clienti').update({ denominazione: d, indirizzo_fatturazione: i, telefono: tel, email: em, partita_iva: piva, codice_fiscale: cf, note_generali: n }).eq('id', window.currentClienteId); window.closeAnagraficaModal(); await window.fetchClienti(); window.renderClientHub(); } catch (err) { console.error(err); } finally { btn.disabled = false; }
}

window.saveCliente = async function() {
    const btn = document.getElementById('btnSaveCliente'); const d = document.getElementById('newDenominazione').value.trim(); const i = document.getElementById('newIndirizzo').value.trim(); const tel = document.getElementById('newTelefono').value.trim(); const em = document.getElementById('newEmail').value.trim(); const piva = document.getElementById('newPartitaIva').value.trim(); const cf = document.getElementById('newCodiceFiscale').value.trim(); const n = document.getElementById('newNote').value.trim(); if (!d) return;
    try { btn.disabled = true; const { data } = await window.db.from('clienti').insert([{ tipo_cliente: document.getElementById('newTipo').value, denominazione: d, indirizzo_fatturazione: i, telefono: tel, email: em, partita_iva: piva, codice_fiscale: cf, note_generali: n ]).select(); if (data && data.length > 0) { window.closeModal(); await window.fetchClienti(); window.currentClienteId = data[0].id; window.navigateTo('hub'); } } catch (err) { console.error(err); } finally { btn.disabled = false; }
}

window.openNewClientModal = function() { document.getElementById('newDenominazione').value = ""; document.getElementById('newIndirizzo').value = ""; document.getElementById('newTelefono').value = ""; document.getElementById('newEmail').value = ""; document.getElementById('newPartitaIva').value = ""; document.getElementById('newCodiceFiscale').value = ""; document.getElementById('newNote').value = ""; document.getElementById('clientModal').classList.remove('hidden'); }
window.closeModal = function() { document.getElementById('clientModal').classList.add('hidden'); }

window.initSediDefaultLocalStorage = function() { if(!localStorage.getItem('sediAziendaliList')) { localStorage.setItem('sediAziendaliList', JSON.stringify(["Sede Principale", "Sede Secondaria"])); } }
window.getSediFromLocal = function() { const raw = localStorage.getItem('sediAziendaliList'); return raw ? JSON.parse(raw) : []; }
window.renderSediSettingsList = function() {
    const container = document.getElementById('settingsSediList'); if(!container) return; container.innerHTML = "";
    window.getSediFromLocal().forEach((sede, index) => {
        const div = document.createElement('div'); div.className = "bg-slate-50 p-2 rounded-lg text-xs font-semibold text-slate-700 border flex justify-between items-center shadow-sm";
        div.innerHTML = `<span>🏢 ${sede}</span><button onclick="deleteSedeLocal(${index})" class="text-red-500 font-bold px-1">✕</button>`; container.appendChild(div);
    });
}
window.toggleAddSedeForm = function() { const form = document.getElementById('addSedeForm'); if(form) form.classList.toggle('hidden'); document.getElementById('newSedeName').value = ""; }
window.addNewSedeLocal = function() { const nomeSede = document.getElementById('newSedeName').value.trim(); if(!nomeSede) return; let sedi = window.getSediFromLocal(); if(sedi.includes(nomeSede)) return; sedi.push(nomeSede); localStorage.setItem('sediAziendaliList', JSON.stringify(sedi)); window.toggleAddSedeForm(); window.renderSediSettingsList(); }
window.deleteSedeLocal = function(index) { if(confirm("Eliminare questa sede?")) { let sedi = window.getSediFromLocal(); sedi.splice(index, 1); localStorage.setItem('sediAziendaliList', JSON.stringify(sedi)); window.renderSediSettingsList(); } }

window.enableWorkerEdit = function(id, nomeAttuale, ruoloAttuale) {
    const row = document.getElementById(`workerRow-${id}`); if(!row) return;
    row.innerHTML = `<div class="flex-1 grid grid-cols-2 gap-1"><input type="text" id="wEditName-${id}" value="${nomeAttuale}" class="p-1 border rounded text-xs font-bold text-slate-800"><input type="text" id="wEditRole-${id}" value="${ruoloAttuale}" class="p-1 border rounded text-[11px]"></div><div class="flex items-center space-x-1"><button onclick="saveWorkerEdit('${id}')" class="bg-green-600 text-white px-2 py-1 rounded text-[10px] font-bold">Salva</button><button onclick="renderSettingsScreen()" class="bg-slate-200 px-1.5 py-1 rounded text-[10px]">✕</button></div>`;
}
window.saveWorkerEdit = async function(id) {
    const nomeNuovo = document.getElementById(`wEditName-${id}`).value.trim(); const ruoloNuovo = document.getElementById(`wEditRole-${id}`).value.trim(); if(!nomeNuovo) return;
    try {
        await window.db.from('lavoratori').update({ nome: nomeNuovo, ruolo: ruoloNuovo === "" ? null : ruoloNuovo }).eq('id', id);
        const dip = window.listLavoratori.find(l => l.id == id); if(dip) { dip.nome = nomeNuovo; dip.ruolo = ruoloNuovo; } window.populateSelects(); window.renderSettingsScreen();
    } catch(err) { console.error(err); }
}
window.toggleAddWorkerForm = function() { const form = document.getElementById('addWorkerForm'); if(!form) return; form.classList.toggle('hidden'); }
window.addNewWorker = async function() {
    const nome = document.getElementById('newWorkerName').value.trim(); const ruolo = document.getElementById('newWorkerRole').value.trim(); if(!nome) return;
    try {
        const { data } = await window.db.from('lavoratori').insert([{ nome: nome, ruolo: ruolo === "" ? null : ruolo }]).select();
        if (data) { window.listLavoratori.push(data[0]); window.listLavoratori.sort((a,b) => a.nome.localeCompare(b.nome)); window.populateSelects(); window.toggleAddWorkerForm(); window.renderSettingsScreen(); }
    } catch(err) { console.error(err); }
}
window.saveDefaultDaysSetting = function() { const input = document.getElementById('settingDefaultDays'); if(!input) return; const value = input.value.trim(); if(value === "") { localStorage.removeItem('defaultDaysToExpiry'); } else { localStorage.setItem('defaultDaysToExpiry', value); } alert("Aggiornato."); }

window.renderSettingsScreen = function() {
    const savedDays = localStorage.getItem('defaultDaysToExpiry'); const inputDays = document.getElementById('settingDefaultDays');
    if(inputDays) inputDays.value = savedDays ? savedDays : "";
    window.renderSediSettingsList();
    const container = document.getElementById('settingsWorkersList'); if (!container) return; container.innerHTML = "";
    if (window.listLavoratori.length === 0) { container.innerHTML = `<p class="text-xs text-slate-400 p-2">Nessun operatore.</p>`; return; }
    window.listLavoratori.forEach(emp => {
        const row = document.createElement('div'); row.id = `workerRow-${emp.id}`; row.className = "bg-slate-50 p-2 rounded-lg text-xs font-semibold text-slate-700 border flex justify-between items-center space-x-2";
        row.innerHTML = `<div class="flex-1 flex items-center justify-between pr-1"><span>👤 ${emp.nome}</span><span class="text-[10px] bg-slate-200 text-slate-600 px-2 py-0.5 rounded-md font-mono">${emp.ruolo || 'Operatore'}</span></div><button onclick="enableWorkerEdit('${emp.id}', '${emp.nome.replace(/'/g, "\\'")}', '${(emp.ruolo || '').replace(/'/g, "\\'")}')" class="text-slate-400 hover:text-blue-600">✏️</button>`;
        container.appendChild(row);
    });
}
window.switchClientSubTab = function(tab) {}

window.onload = async () => { await window.initLists(); await window.fetchClienti(); };
