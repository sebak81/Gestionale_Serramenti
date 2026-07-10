// GESTIONE SEPARATA DEL FLUSSO PREVENTIVAZIONE SU COLONNA NATIVA
async function saveStatoPreventivoDettagli() {
    if (!currentCommessa) return;

    const btn = document.getElementById('btnSaveSubPreventivo');
    const selectStato = document.getElementById('subStatoPreventivo');
    const opPrevSelect = document.getElementById('workerPreventivoSelect');
    
    const nuovoSubStato = selectStato.value;
    const testoStato = selectStato.options[selectStato.selectedIndex].text;
    const opPrevValue = opPrevSelect ? opPrevSelect.value : '';
    const opPrevText = opPrevSelect ? (opPrevSelect.options[opPrevSelect.selectedIndex]?.text || 'Nessuno') : 'Nessuno';
    
    const dataInizio = document.getElementById('dateInvioPrev').value;
    const inputGiorni = document.getElementById('dateReminderPrev').value.trim();
    const annotazioni = document.getElementById('annotazioniPreventivoInput').value.trim();

    if (!opPrevValue || !annotazioni) {
        alert("❌ INCARICATO E ANNOTAZIONE PREVENTIVO OBBLIGATORI!");
        return;
    }

    let dataScadenzaCalcolataString = null;
    if(inputGiorni !== "") {
        const giorniInteri = parseInt(inputGiorni, 10);
        if(!isNaN(giorniInteri)) {
            const dataScadenzaOggetto = new Date();
            dataScadenzaOggetto.setDate(dataScadenzaOggetto.getDate() + giorniInteri);
            dataScadenzaCalcolataString = dataScadenzaOggetto.toISOString().split('T')[0];
        }
    }

    const t = new Date().toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute:'2-digit' });
    
    let nuovaAttivitaPrev = `Stato: ${testoStato} | Incaricato: ${opPrevText} | Note: ${annotazioni}`;
    if (dataInizio) nuovaAttivitaPrev += ` | Inizio: ${dataInizio}`;
    if (inputGiorni) nuovaAttivitaPrev += ` | Scadenza: ${inputGiorni} gg`;

    try {
        btn.disabled = true;
        
        // Salviamo sulla colonna reale creata su Supabase
        let storicoAggiornato = currentCommessa.preventivo_attivita_storico ? currentCommessa.preventivo_attivita_storico + '\n' + nuovaAttivitaPrev : nuovaAttivitaPrev;

        const { error } = await db.from('commesse').update({
            preventivo_stato: nuovoSubStato,
            preventivo_data_invio: dataInizio === "" ? null : dataInizio,
            preventivo_scadenza_promemoria: dataScadenzaCalcolataString,
            preventivo_attivita_storico: storicoAggiornato
        }).eq('id', currentCommessaId);

        if (error) throw error;

        currentCommessa.preventivo_stato = nuovoSubStato;
        currentCommessa.preventivo_data_invio = dataInizio;
        currentCommessa.preventivo_scadenza_promemoria = dataScadenzaCalcolataString;
        currentCommessa.preventivo_attivita_storico = storicoAggiornato;

        fetchPreventivoTimeline();
        document.getElementById('annotazioniPreventivoInput').value = "";
        if(opPrevSelect) opPrevSelect.value = "";
        
        alert("✅ Storico preventivazione aggiornato su colonna nativa!");
    } catch (err) {
        alert("Errore salvataggio dettagli preventivo: " + err.message);
    } finally {
        btn.disabled = false;
    }
}

function fetchPreventivoTimeline() {
    const container = document.getElementById('preventivoTimeline');
    if(!container) return;
    container.innerHTML = "";
    if (!currentCommessa || !currentCommessa.preventivo_attivita_storico) {
        container.innerHTML = `<p class="text-xs text-slate-400 text-center py-4">Nessuna attività registrata per questo preventivo.</p>`;
        return;
    }
    
    let righeLine = currentCommessa.preventivo_attivita_storico.split('\n').reverse();
    righeLine.forEach(l => {
        if(l.trim()) {
            const r = document.createElement('div');
            r.className = "bg-white p-2.5 rounded-xl border text-xs mt-1 shadow-sm font-medium border-slate-100 text-slate-700";
            r.innerText = l; 
            container.appendChild(r);
        }
    });
}
