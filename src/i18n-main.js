// Texts the main process shows by itself (tray menu, notice). The interface texts are in renderer/js/i18n.js.
export const MAIN_TEXT = {
  en: { 'tray.open': 'Open Audio Monitor Router', 'tray.quit': 'Quit', 'tray.tooltip': 'Audio Monitor Router',
    'tray.noticeTitle': 'Still running', 'tray.noticeBody': 'Audio Monitor Router keeps running in the notification area. Use its icon to open it again or to quit.' },
  it: { 'tray.open': 'Apri Audio Monitor Router', 'tray.quit': 'Esci', 'tray.tooltip': 'Audio Monitor Router',
    'tray.noticeTitle': 'Ancora in esecuzione', 'tray.noticeBody': 'Audio Monitor Router continua a funzionare nell\'area di notifica. Usa la sua icona per riaprirlo o per uscire.' },
  es: { 'tray.open': 'Abrir Audio Monitor Router', 'tray.quit': 'Salir', 'tray.tooltip': 'Audio Monitor Router',
    'tray.noticeTitle': 'Sigue en ejecución', 'tray.noticeBody': 'Audio Monitor Router sigue funcionando en el área de notificación. Usa su icono para abrirlo de nuevo o para salir.' },
};

export const tMain = (lang, key) => (MAIN_TEXT[lang] && MAIN_TEXT[lang][key]) || MAIN_TEXT.en[key] || key;
