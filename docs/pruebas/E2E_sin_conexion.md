# Pruebas de punta a punta · Funcionamiento sin conexión (Offline-First)

Guion para validar, antes de cada versión importante, que SierraFlow sigue funcionando sin red y que
sincroniza bien al volver. Toma unos 20 minutos. Hágalo en **Chrome de escritorio** y repita los pasos
1–4 en un **teléfono** con la app instalada.

**Preparación**
- Dos usuarios: **A** (solicitante) y **B** (líder técnico), en navegadores distintos (o uno en incógnito).
- Chrome → F12 → pestaña **Network** → selector *No throttling* / **Offline** para simular sin conexión.
- En la barra superior, el indicador muestra *Sincronizado*, *Sin conexión* o *N cambios pendientes*.

| # | Paso | Resultado esperado | ✔ |
|---|------|--------------------|---|
| 1 | A inicia sesión, abre *Mis solicitudes* y una solicitud. Luego **Offline** y recarga (F5). | La app abre igual (Service Worker). Se ven las solicitudes y el detalle ya visitado. Indicador: *Sin conexión*. | |
| 2 | Sin conexión, A crea una solicitud completa con el asistente (3 pasos) y la envía. | Aparece en la lista con su código provisional y el aviso de pendiente. Indicador: *1 cambio pendiente*. | |
| 3 | Sin conexión, A comenta en otra solicitud y marca un criterio de aceptación. | Se ven al instante. El contador de pendientes sube. | |
| 4 | Cierra la pestaña y vuelve a abrir la app (aún sin conexión). | Los cambios siguen ahí (IndexedDB). Nada se perdió. | |
| 5 | Vuelve la conexión (*No throttling*). | En segundos el indicador pasa a *Sincronizado*. La solicitud nueva recibe su código definitivo (SOL-…). | |
| 6 | B (en línea) abre la bandeja. | Ve la solicitud de A y la campana muestra el aviso de *nueva solicitud* sin recargar (tiempo real). | |
| 7 | **Conflicto:** A y B abren la misma solicitud. A pasa a Offline y comenta; B (en línea) la rechaza con comentario. A vuelve en línea. | El comentario de A se guarda; si su cambio de estado ya no es válido, A ve el aviso de conflicto en el detalle con la opción de descartarlo. Nada queda “pegado” en pendientes. | |
| 8 | B asigna equipo y crea tareas (*Evaluación*). Un ingeniero actualiza su avance. | El avance general de la solicitud cambia y A lo ve en su detalle tras sincronizar. | |
| 9 | Teléfono con la app instalada: modo avión, abrir la app, crear un borrador, quitar el modo avión. | Igual que 1–5. Llega la notificación push de cambio de estado (si se activaron en Configuración). | |
| 10 | Cerrar sesión con un cambio pendiente sin conexión. | La app pide confirmación (*Salir igual*). Al salir se borran los datos locales del navegador. | |

**Si algo falla**, anote: paso, navegador, hora y, en F12 → *Application* → *IndexedDB* → `sierraflow`,
el contenido de la tabla `bandejaSalida`. En el servidor: `sudo -u <usuario> pm2 logs sierraflow-api --lines 100`.
