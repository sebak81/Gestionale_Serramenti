import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

// Intestazioni CORS per consentire alla PWA di chiamare la funzione
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Gestione della richiesta OPTIONS (Preflight CORS)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Inizializziamo il client interno Supabase con i permessi di sistema (Service Role)
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 1. Recuperiamo i dati in formato Multipart Form (File + Campi di testo)
    const formData = await req.formData()
    const file = formData.get('file') as File
    const commessaId = formData.get('commessa_id') as string
    const categoria = formData.get('categoria') as string

    if (!file || !commessaId || !categoria) {
      return new Response(JSON.stringify({ error: 'Parametri mancanti' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 2. Recuperiamo le credenziali del Service Account salvate nelle variabili d'ambiente
    const googleCredsJson = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON')
    if (!googleCredsJson) {
      throw new Error('Credenziali Google non configurate su Supabase')
    }
    const creds = JSON.parse(googleCredsJson)

    // 3. Generazione del Token di Accesso Google OAuth2 tramite JWT (senza librerie esterne)
    const googleToken = await getGoogleAccessToken(creds)

    // 4. Recuperiamo la commessa da Supabase per verificare se ha già le cartelle create
    const { data: commessa, error: errComm } = await supabaseAdmin
      .from('commesse')
      .select('titolo_lavoro, gd_folder_id, gd_folder_preventivi_id, gd_folder_ordini_id')
      .eq('id', commessaId)
      .single()

    if (errComm || !commessa) throw new Error('Commessa non trovata su DB')

    // Cartella Radice dell'Ufficio su Google Drive (Sostituisci con l'ID reale della tua cartella "PWA-Commesse_ARCHIVIO")
    const ROOT_FOLDER_ID = "IL_TUO_ID_CARTELLA_MADRE_DRIVE" 

    let currentMainFolder = commessa.gd_folder_id
    let targetFolderId = ""

    // 5. Se la commessa non ha ancora le cartelle, creiamo l'albero strutturato (Opzione 2)
    if (!currentMainFolder) {
      const folderName = `Commessa_${commessa.titolo_lavoro.replace(/\s+/g, '_')}`
      currentMainFolder = await createDriveFolder(googleToken, folderName, ROOT_FOLDER_ID)
      
      // Creiamo le sotto-cartelle specifiche
      const subFolderPrev = await createDriveFolder(googleToken, "Preventivi", currentMainFolder)
      const subFolderOrd = await createDriveFolder(googleToken, "Ordini", currentMainFolder)
      const subFolderFoto = await createDriveFolder(googleToken, "Foto_Cantiere", currentMainFolder)
      const subFolderAltro = await createDriveFolder(googleToken, "Documenti_Generali", currentMainFolder)

      // Aggiorniamo la commessa su Supabase con gli ID creati
      await supabaseAdmin
        .from('commesse')
        .update({
          gd_folder_id: currentMainFolder,
          gd_folder_preventivi_id: subFolderPrev,
          gd_folder_ordini_id: subFolderOrd
        })
        .eq('id', commessaId)
      
      // Assegniamo la destinazione corretta in base alla categoria corrente
      targetFolderId = categoria === 'PREVENTIVO' ? subFolderPrev :
                       categoria === 'ORDINE' ? subFolderOrd :
                       categoria === 'FOTO' ? subFolderFoto : subFolderAltro
    } else {
      // Se le cartelle esistono già, recuperiamo l'ID della sotto-cartella specifica
      // Per semplicità o per cartelle non mappate su colonne strutturali (es. foto, fatture), interroghiamo o creiamo al volo
      targetFolderId = await getOrCreateSubFolder(googleToken, categoria, currentMainFolder)
    }

    // 6. Caricamento del file fisico su Google Drive via REST API
    const googleFileId = await uploadBinaryToDrive(googleToken, file, targetFolderId)

    // 7. Registriamo il file all'interno della tabella 'allegati_drive' di Supabase
    const { error: errInsert } = await supabaseAdmin
      .from('allegati_drive')
      .insert([{
        commessa_id: commessaId,
        nome_file: file.name,
        google_drive_file_id: googleFileId,
        tipo_file: file.type,
        dimensione_byte: file.size,
        categoria: categoria
      }])

    if (errInsert) throw errInsert

    return new Response(JSON.stringify({ success: true, fileId: googleFileId }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

// --- FUNZIONI UTILITY INTERNE PER LE API DI GOOGLE DRIVE ---

async function createDriveFolder(token: string, name: string, parentId: string): Promise<string> {
  const resp = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId]
    })
  })
  const res = await resp.json()
  if (res.id) return res.id
  throw new Error(`Errore creazione cartella ${name}: ` + JSON.stringify(res))
}

async function getOrCreateSubFolder(token: string, categoria: string, mainFolderId: string): Promise<string> {
  const folderNames: Record<string, string> = {
    'PREVENTIVO': 'Preventivi',
    'ORDINE': 'Ordini',
    'FOTO': 'Foto_Cantiere',
    'FATTURA': 'Fatture',
    'CONTRATTO': 'Contratti',
    'ALTRO': 'Documenti_Generali'
  }
  const targetName = folderNames[categoria] || 'Documenti_Generali'
  
  // Cerchiamo se esiste già
  const q = `name='${targetName}' and '${mainFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`
  const resp = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  })
  const res = await resp.json()
  if (res.files && res.files.length > 0) return res.files[0].id
  
  // Se non esiste (es. nuove categorie inserite successivamente), la creiamo
  return await createDriveFolder(token, targetName, mainFolderId)
}

async function uploadBinaryToDrive(token: string, file: File, parentId: string): Promise<string> {
  const metadata = { name: file.name, parents: [parentId] }
  const boundary = 'foo_bar_boundary'
  
  const delimiter = `\r\n--${boundary}\r\n`
  const closeDelimiter = `\r\n--${boundary}--`
  
  const arrayBuffer = await file.arrayBuffer()
  const binaryData = new Uint8Array(arrayBuffer)
  
  const encoder = new TextEncoder()
  const multipartRequestBody = new Uint8Array([
    ...encoder.encode(`${delimiter}Content-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}`),
    ...encoder.encode(`${delimiter}Content-Type: ${file.type}\r\n\r\n`),
    ...binaryData,
    ...encoder.encode(closeDelimiter)
  ])

  const resp = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
      'Content-Length': String(multipartRequestBody.length)
    },
    body: multipartRequestBody
  })
  const res = await resp.json()
  if (res.id) return res.id
  throw new Error("Errore upload file su Drive: " + JSON.stringify(res))
}

// Funzione crittografica per firmare e richiedere l'Access Token OAuth2 (JWT)
async function getGoogleAccessToken(creds: any): Promise<string> {
  const header = { alg: "RS256", typ: "JWT" }
  const claimSet = {
    iss: creds.client_email,
    scope: "https://www.googleapis.com/auth/drive",
    aud: "https://oauth2.googleapis.com/token",
    exp: Math.floor(Date.now() / 1000) + 3600,
    iat: Math.floor(Date.now() / 1000)
  }
  
  const encodedHeader = btoa(JSON.stringify(header)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_")
  const encodedClaimSet = btoa(JSON.stringify(claimSet)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_")
  const signatureInput = `${encodedHeader}.${encodedClaimSet}`
  
  // Utilizziamo le Web Crypto API native di Deno per firmare con la chiave privata RSA del file JSON
  const pemHeader = "-----BEGIN PRIVATE KEY-----"
  const pemFooter = "-----END PRIVATE KEY-----"
  const pemContents = creds.private_key.substring(pemHeader.length, creds.private_key.length - pemFooter.length).replace(/\s/g, "")
  const binaryKey = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0))
  
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8", binaryKey,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false, ["sign"]
  )
  
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5", cryptoKey,
    new TextEncoder().encode(signatureInput)
  )
  const encodedSignature = btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_")
  const jwt = `${signatureInput}.${encodedSignature}`
  
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`
  })
  const data = await resp.json()
  if (data.access_token) return data.access_token
  throw new Error("Impossibile ottenere l'access token da Google: " + JSON.stringify(data))
}
