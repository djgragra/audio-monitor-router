# Manuale di Audio Monitor Router

Audio Monitor Router è una matrice di instradamento per i dispositivi audio del computer: scegli quale **ingresso** senti e su quale **uscita** (cuffie, monitor, HDMI, un'altra scheda audio). Una sorgente per uscita, più uscite insieme, un volume e un livello per ciascuna. Funziona con qualsiasi dispositivo audio che il sistema espone, comprese le schede audio di rete come le coppie Receive di Dante Virtual Soundcard. È un'app desktop gratuita di OnAir Garage, per **Windows** (macOS è in programma, Linux no).

## Installazione e primo avvio

Scarica `Audio-Monitor-Router-Setup-<V>.exe` dalla pagina [Releases](https://github.com/djgragra/audio-monitor-router/releases) e controllalo con `SHA256SUMS.txt`. Windows 10 o successivo, 64 bit.

- Lancia l'installer. L'app non ha un certificato Microsoft, quindi se SmartScreen dice "Windows ha protetto il PC", premi *Ulteriori informazioni* → *Esegui comunque*.
- L'app si apre sempre in inglese; scegli Italiano o Español in *Impostazioni → Generale* e la scelta viene ricordata. Il tema è scuro di default, con chiaro e "segui il sistema" disponibili.
- Python **non** serve: il motore audio è dentro l'installer.

L'app legge e riproduce soltanto l'audio di questo computer. Non cambia mai le sottoscrizioni di rete (restano in Dante Controller) né le impostazioni delle schede audio, e non contatta nessun indirizzo da sola.

## La matrice

Le righe sono le **sorgenti** (gli ingressi del computer), le colonne le **uscite**, raggruppate per scheda come le segnala il sistema. Premi **ASCOLTO** dove una sorgente incontra un'uscita per sentirla lì; premilo ancora per fermare.

- **Una sorgente per uscita**: premere ASCOLTO su un'altra riga della stessa colonna sostituisce la sorgente. Più uscite possono suonare insieme, ognuna con la sua sorgente.
- **Coppie stereo**: un endpoint stereo è una riga o una colonna. Un endpoint mono si sente da entrambi i lati. Un dispositivo con più di due canali è diviso in coppie (1-2, 3-4…).
- **Predefinita del sistema**: l'ingresso e l'uscita che Windows usa se un programma non ne sceglie un'altra portano il badge **PREDEF.**
- **Nomi**: fai doppio clic su un nome per dargliene uno tuo; il nome originale resta sotto o nel suggerimento. I nomi sono una tua scelta, salvati su questo computer.

### Volume, canali e livello

Sotto ogni uscita: un cursore del **volume**, i pulsanti **L**, **R** e **MONO**, e un indicatore di **livello**.

- **L** e **R** sono accesi finché quel canale si sente (entrambi accesi = stereo). Premine uno per escludere quel canale.
- **MONO** somma sinistra e destra e riproduce il risultato da entrambi i lati.
- Il **livello** mostra il picco di ciò che l'app riproduce su quell'uscita, solo mentre una sorgente è in ascolto.

### Altoparlanti di segnale

Un piccolo **altoparlante** accanto a una sorgente si illumina quando quell'ingresso ha segnale (sopra −60 dBFS, mantenuto per circa un secondo), come in Dante Controller. Un altoparlante accanto a un'**uscita** si illumina quando *un qualunque programma* ci suona (un browser, un player…): legge il livello che Windows stesso misura per quel dispositivo.

Gli altoparlanti sulle sorgenti aprono un ingresso in più per ogni sorgente visibile. Se dà problemi, disattivali in *Impostazioni → Generale*.

### Avviso di loop

Se un ascolto potrebbe rimandare l'audio nella scheda da cui arriva (un'interfaccia che monitora i propri ingressi), l'app chiede un **secondo clic**. Confronta le schede, non il vero percorso del segnale, quindi può avvisare anche dove non c'è un loop: conferma se sai che va bene.

## Dispositivi e nomi

*Impostazioni → Dispositivi* elenca ogni scheda, sorgente e uscita.

- **Mostra o nascondi** una singola porta o un'intera scheda con le caselle. I dispositivi nascosti restano fuori dalla matrice.
- **Ordine**: le schede seguono l'ordine del sistema e le porte l'ordine numerico finché non le sposti con le frecce.
- Le **uscite di trasmissione in rete** (per esempio le coppie "Transmit" di Dante Virtual Soundcard) servono solo a mandare audio in rete: sono nascoste di default, e *Mostra le uscite di trasmissione in rete* le riporta.
- I **nomi personalizzati** sono elencati qui; *Rimuovi tutti i nomi personalizzati* li cancella.

Quando un dispositivo viene scollegato sparisce dalla matrice e l'ascolto che lo usava si ferma. Quando torna, tornano anche i suoi nomi e il suo ascolto. Un dispositivo collegato mentre qualcosa suona compare quando premi **Aggiorna i dispositivi** (riavvia per un attimo gli ascolti in corso), oppure da solo appena non suona più niente.

## Impostazioni

- **Lingua** e **Tema**.
- **Latenza**: *Minima* (buffer di 30 ms), *Normale* (60 ms, il default) o *Sicura* (120 ms). Due schede audio non vanno mai esattamente alla stessa velocità, quindi un piccolo buffer assorbe la differenza. Più piccolo significa meno ritardo ma più rischio di click; Windows aggiunge il suo ritardo. Se senti dei click, scegli un valore più grande. È pensata per il monitoraggio, non per registrare né per la messa in onda.
- **Mostra quali sorgenti hanno segnale**: gli altoparlanti descritti sopra.
- **Avvia quando accedo al computer**: spento di default; l'app parte nascosta, nell'area di notifica.
- **Chiudendo la finestra l'app resta attiva** nell'area di notifica (acceso di default; la prima volta compare un avviso). Il menu dell'icona ha *Apri* ed *Esci*.

## Risoluzione dei problemi

- **Non si sente nulla su un'uscita**: controlla che sia l'uscita giusta, che il volume non sia a zero e che L e R siano accesi. Windows può usare il dispositivo in modo esclusivo in un altro programma.
- **Click**: scegli una latenza più grande.
- **"Non è stato possibile avviare il motore audio"**: il messaggio dice perché. A volte un antivirus blocca un programma nuovo: consentilo e riavvia.
- **Manca qualcosa**: premi **Aggiorna i dispositivi**, oppure controlla in *Impostazioni → Dispositivi* se è nascosto.
- **Segnalare un problema**: in *Impostazioni → Guida e info*, *Copia info per il supporto* copia versione e sistema (mai le tue impostazioni) e *Apri la cartella dei log* apre il registro.

## Limiti

- Il ritardo non è zero (60 ms di default, non misurato su hardware reale) e Windows aggiunge il suo.
- Si usano solo endpoint in modalità condivisa (WASAPI), quindi l'app non toglie mai una scheda agli altri programmi. Gli endpoint sovrapposti di una scheda (per esempio "IN 1-2" e "IN 1-4") sono tutti elencati: nascondi quelli che non servono.
- Windows non dice se un endpoint è altoparlanti, cuffie o HDMI, quindi l'app non può mostrarlo.
- Due schede con lo stesso identico nome possono scambiarsi di posto se il sistema le riordina.
- È stata provata su **un solo** computer con Windows 11. Non provati: altre schede audio e altri driver, funzionamento continuo per lungo tempo, un dispositivo vero scollegato durante l'ascolto, molte coppie di rete insieme.

## Crediti e licenza

Audio Monitor Router è software libero con licenza MIT, © 2026 Graziano Melzi, parte di OnAir Garage (onairgarage.com). Usa Electron (MIT), NumPy (BSD-3-Clause), python-sounddevice (MIT) con PortAudio, pycaw e comtypes (MIT).
