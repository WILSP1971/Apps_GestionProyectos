import { Injectable, Logger } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';
import type { EventoNotificacion } from '@sierraflow/contratos';

const COLOR: Record<EventoNotificacion['severidad'], string> = {
  INFO: '#38bdf8', EXITO: '#22c55e', ALERTA: '#f59e0b', CRITICA: '#ef4444',
};

const escapar = (t: string) =>
  t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Correo por SMTP (Gmail con contraseña de aplicación, Microsoft 365, el correo del hosting, etc.).
 * Variables: SMTP_HOST, SMTP_PUERTO, SMTP_USUARIO, SMTP_CLAVE, SMTP_REMITENTE.
 */
@Injectable()
export class ServicioCorreo {
  private readonly log = new Logger('Correo');
  private readonly transporte?: Transporter;

  constructor() {
    const host = process.env.SMTP_HOST;
    if (!host) {
      this.log.warn('SMTP_HOST no configurado: las notificaciones por correo están desactivadas');
      return;
    }
    const puerto = Number(process.env.SMTP_PUERTO || 587);
    this.transporte = nodemailer.createTransport({
      host,
      port: puerto,
      secure: puerto === 465,
      auth: process.env.SMTP_USUARIO ? { user: process.env.SMTP_USUARIO, pass: process.env.SMTP_CLAVE } : undefined,
    });
  }

  get disponible(): boolean {
    return Boolean(this.transporte);
  }

  async enviarNotificacion(para: { email: string; nombre: string }, n: EventoNotificacion): Promise<boolean> {
    if (!this.transporte) return false;
    const base = process.env.WEB_URL ?? 'https://proyectos.sierrainnova.tech';
    const enlace = n.enlace.startsWith('http') ? n.enlace : `${base}${n.enlace}`;
    await this.transporte.sendMail({
      from: process.env.SMTP_REMITENTE || `"SierraFlow" <${process.env.SMTP_USUARIO}>`,
      to: `"${para.nombre.replace(/"/g, '')}" <${para.email}>`,
      subject: `SierraFlow · ${n.titulo}`,
      text: `Hola ${para.nombre},\n\n${n.titulo}\n${n.mensaje}\n\nVer en SierraFlow: ${enlace}\n\n—\nPuedes cambiar qué correos recibes en Configuración.`,
      html: this.html(para.nombre, n, enlace, `${base}/configuracion`),
    });
    return true;
  }

  private html(nombre: string, n: EventoNotificacion, enlace: string, preferencias: string): string {
    return `<!doctype html><html lang="es"><body style="margin:0;background:#08161d;font-family:Segoe UI,Arial,sans-serif;color:#e2ecf0">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 12px"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#0d2029;border:1px solid #1d3a47;border-radius:14px">
<tr><td style="padding:22px 28px;border-bottom:1px solid #1d3a47;font-size:18px;font-weight:600">Sierra<span style="color:#14b8a6">Flow</span></td></tr>
<tr><td style="padding:28px">
<p style="margin:0 0 14px;color:#8ba5b1;font-size:14px">Hola ${escapar(nombre)},</p>
<p style="margin:0 0 10px;font-size:18px;font-weight:600;border-left:4px solid ${COLOR[n.severidad]};padding-left:12px">${escapar(n.titulo)}</p>
<p style="margin:0 0 24px;font-size:15px;line-height:1.5">${escapar(n.mensaje)}</p>
<a href="${escapar(enlace)}" style="display:inline-block;background:#14b8a6;color:#04131a;text-decoration:none;font-weight:600;padding:11px 20px;border-radius:8px">Ver en SierraFlow</a>
</td></tr>
<tr><td style="padding:16px 28px;border-top:1px solid #1d3a47;font-size:12px;color:#8ba5b1">
Recibes este correo por tus preferencias de notificación. <a href="${escapar(preferencias)}" style="color:#14b8a6">Cambiar preferencias</a>
</td></tr></table></td></tr></table></body></html>`;
  }
}
