# Manual de Audio Monitor Router

Audio Monitor Router es una matriz de enrutado para los dispositivos de audio del ordenador: eliges qué **entrada** oyes y en qué **salida** (auriculares, monitores, HDMI, otra tarjeta de audio). Una fuente por salida, varias salidas a la vez, un volumen y un nivel para cada una. Funciona con cualquier dispositivo de audio que el sistema exponga, incluidas las tarjetas de audio de red como los pares Receive de Dante Virtual Soundcard. Es una app de escritorio gratuita de OnAir Garage, para **Windows** (macOS está previsto, Linux no).

## Instalación y primer arranque

Descarga `Audio-Monitor-Router-Setup-<V>.exe` desde la página de [Releases](https://github.com/djgragra/audio-monitor-router/releases) y compruébalo con `SHA256SUMS.txt`. Windows 10 o posterior, 64 bits.

- Ejecuta el instalador. La app no tiene certificado de Microsoft, así que si SmartScreen dice "Windows protegió su PC", pulsa *Más información* → *Ejecutar de todas formas*.
- La app siempre se abre en inglés; elige Italiano o Español en *Ajustes → General* y la elección se recuerda. El tema es oscuro por defecto, con claro y "seguir el sistema" disponibles.
- **No** hace falta Python: el motor de audio va dentro del instalador.

La app solo lee y reproduce el audio de este ordenador. Nunca cambia las suscripciones de red (siguen en Dante Controller) ni los ajustes de tus tarjetas de audio, y no contacta con ninguna dirección por sí sola.

## La matriz

Las filas son las **fuentes** (las entradas del ordenador), las columnas las **salidas**, agrupadas por tarjeta tal como las informa el sistema. Pulsa **ESCUCHA** donde una fuente se cruza con una salida para oírla allí; púlsalo otra vez para parar.

- **Una fuente por salida**: pulsar ESCUCHA en otra fila de la misma columna sustituye la fuente. Varias salidas pueden sonar a la vez, cada una con su fuente.
- **Pares estéreo**: un endpoint estéreo es una fila o una columna. Un endpoint mono se oye por los dos lados. Un dispositivo con más de dos canales se divide en pares (1-2, 3-4…).
- **Predeterminado del sistema**: la entrada y la salida que Windows usa si un programa no elige otra llevan la insignia **PREDET.**
- **Nombres**: haz doble clic en un nombre para ponerle el tuyo; el nombre original se muestra debajo o en la ayuda emergente. Los nombres son una elección tuya, guardada en este ordenador.

### Volumen, canales y nivel

Bajo cada salida: un control de **volumen**, los botones **L**, **R** y **MONO**, y un indicador de **nivel**.

- **L** y **R** están encendidos mientras ese canal se oye (los dos encendidos = estéreo). Pulsa uno para dejar fuera ese canal.
- **MONO** suma izquierda y derecha y reproduce el resultado por los dos lados.
- El **nivel** muestra el pico de lo que la app reproduce en esa salida, solo mientras una fuente está en escucha.

### Altavoces de señal

Un pequeño **altavoz** junto a una fuente se ilumina cuando esa entrada tiene señal (por encima de −60 dBFS, mantenida cerca de un segundo), como en Dante Controller. Un altavoz junto a una **salida** se ilumina cuando *cualquier programa* suena en ella (un navegador, un reproductor…): lee el nivel que el propio Windows mide para ese dispositivo.

Los altavoces de las fuentes abren una entrada extra por cada fuente visible. Si da problemas, desactívalos en *Ajustes → General*.

### Aviso de bucle

Si una escucha pudiera devolver el audio a la tarjeta de la que viene (una interfaz que monitoriza sus propias entradas), la app pide un **segundo clic**. Compara tarjetas, no el recorrido real de la señal, así que puede avisar aunque no haya bucle: confirma si sabes que está bien.

## Dispositivos y nombres

*Ajustes → Dispositivos* lista cada tarjeta, fuente y salida.

- **Mostrar u ocultar** un puerto o una tarjeta entera con las casillas. Los dispositivos ocultos quedan fuera de la matriz.
- **Orden**: las tarjetas siguen el orden del sistema y los puertos el orden numérico hasta que los muevas con las flechas.
- Las **salidas de transmisión por red** (por ejemplo los pares "Transmit" de Dante Virtual Soundcard) solo envían audio a la red: están ocultas por defecto, y *Mostrar las salidas de transmisión por red* las recupera.
- Los **nombres personalizados** se listan aquí; *Quitar todos los nombres personalizados* los borra.

Cuando un dispositivo se desconecta, desaparece de la matriz y la escucha que lo usaba se detiene. Cuando vuelve, vuelven también sus nombres y su escucha. Un dispositivo conectado mientras algo suena aparece al pulsar **Actualizar dispositivos** (reinicia un instante las escuchas en curso), o solo en cuanto no suena nada.

## Ajustes

- **Idioma** y **Tema**.
- **Latencia**: *Mínima* (búfer de 30 ms), *Normal* (60 ms, la predeterminada) o *Segura* (120 ms). Dos tarjetas de sonido nunca van exactamente a la misma velocidad, así que un búfer pequeño absorbe la diferencia. Más pequeño significa menos retardo pero más riesgo de chasquidos; Windows añade su propio retardo. Si oyes chasquidos, elige uno mayor. Está pensada para monitorizar, no para grabar ni para emitir en directo.
- **Mostrar qué fuentes tienen señal**: los altavoces descritos arriba.
- **Iniciar cuando inicio sesión en el equipo**: desactivado por defecto; la app arranca oculta, en el área de notificación.
- **Al cerrar la ventana la app sigue activa** en el área de notificación (activado por defecto; la primera vez aparece un aviso). El menú del icono tiene *Abrir* y *Salir*.

## Solución de problemas

- **No se oye nada en una salida**: comprueba que es la salida que quieres, que el volumen no está a cero y que L y R están encendidos. Windows puede estar usando el dispositivo en modo exclusivo en otro programa.
- **Chasquidos**: elige una latencia mayor.
- **"No se pudo iniciar el motor de audio"**: el mensaje dice por qué. A veces un antivirus bloquea un programa nuevo: permítelo y vuelve a empezar.
- **Falta algo**: pulsa **Actualizar dispositivos**, o mira en *Ajustes → Dispositivos* si está oculto.
- **Informar de un problema**: en *Ajustes → Ayuda e info*, *Copiar info para soporte* copia la versión y el sistema (nunca tus ajustes) y *Abrir la carpeta de registros* abre el registro.

## Límites

- El retardo no es cero (60 ms por defecto, no medido en hardware real) y Windows añade el suyo.
- Solo se usan endpoints en modo compartido (WASAPI), así que la app nunca quita una tarjeta a otros programas. Los endpoints solapados de una tarjeta (por ejemplo "IN 1-2" e "IN 1-4") se listan todos: oculta los que no necesites.
- Windows no dice si un endpoint son altavoces, auriculares o HDMI, así que la app no puede mostrarlo.
- Dos tarjetas con exactamente el mismo nombre pueden intercambiarse si el sistema las reordena.
- Se ha probado en **un solo** ordenador con Windows 11. No probado: otras tarjetas de sonido y otros controladores, funcionamiento continuo prolongado, un dispositivo real desconectado durante la escucha, muchos pares de red a la vez.

## Créditos y licencia

Audio Monitor Router es software libre con licencia MIT, © 2026 Graziano Melzi, parte de OnAir Garage (onairgarage.com). Usa Electron (MIT), NumPy (BSD-3-Clause), python-sounddevice (MIT) con PortAudio, pycaw y comtypes (MIT).
