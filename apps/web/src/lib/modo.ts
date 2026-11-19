/**
 * Modo de ejecución del cliente. En modo demo no hay servidor: los casos de uso trabajan solo con
 * IndexedDB y simulan lo que en producción hace la API (notificaciones, avance, etc.).
 */
let modoDemo = true;

export const establecerModoDemo = (valor: boolean) => {
  modoDemo = valor;
};

export const esModoDemo = () => modoDemo;
