// Emails transaccionales — MV Agendate IA.
// Sin dependencias: usa la API REST de Resend (resend.com, tier gratis) con
// fetch. Si no hay API key configurada, todo es un no-op silencioso (se
// registra en el log) — el programa funciona igual que siempre.
//
// Config del vendedor (env o /config.html):
//   RESEND_API_KEY  → habilita el envío
//   EMAIL_FROM      → remitente verificado (default onboarding@resend.dev,
//                     que Resend permite para pruebas sin verificar dominio)
import { get as cfg } from './config.js';
import { obtenerCuenta } from './cuentas.js';
import { obtenerOverrides } from './configCuentas.js';
import { idiomaDePais } from '../data/paises.js';
import { kvGet, kvSet } from './redis.js';

const API = 'https://api.resend.com/emails';

export function emailsActivos() { return !!cfg('resendApiKey'); }
const remitente = () => cfg('emailFrom') || 'MV Agendate IA <onboarding@resend.dev>';

/**
 * Envía un email. Devuelve { ok } — nunca lanza: un fallo de email jamás
 * debe romper el flujo que lo disparó (registro, pago, chat).
 */
export async function enviarEmail({ para, asunto, html }) {
  const key = cfg('resendApiKey');
  if (!key) return { ok: false, motivo: 'sin_config' };
  if (!para) return { ok: false, motivo: 'sin_destinatario' };
  try {
    const r = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ from: remitente(), to: [para], subject: asunto, html }),
    });
    if (!r.ok) {
      console.error('[emails] Resend respondió', r.status, (await r.text()).slice(0, 200));
      return { ok: false, motivo: 'api' };
    }
    return { ok: true };
  } catch (e) {
    console.error('[emails]', e.message);
    return { ok: false, motivo: 'red' };
  }
}

/** Variante que no espera ni propaga errores — para hooks en flujos vivos. */
export function enviarEmailAsync(datos) {
  enviarEmail(datos).catch(() => {});
}

// ---------- Plantillas (es/pt) ----------

const marco = (cuerpo) => `<!doctype html><html><body style="margin:0;background:#eef2f7;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;">
<div style="max-width:520px;margin:24px auto;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #e6ebf1;">
  <div style="background:#0f2a43;color:#fff;padding:16px 22px;font-weight:800;">MV <span style="color:#e3a72f;">Agendate IA</span></div>
  <div style="padding:22px;color:#22303e;font-size:15px;line-height:1.6;">${cuerpo}</div>
  <div style="padding:12px 22px;color:#8a99a8;font-size:12px;border-top:1px solid #e6ebf1;">MV Agendate IA — turnos y presupuestos con IA para profesionales de LATAM.</div>
</div></body></html>`;

const btn = (url, texto) => `<a href="${url}" style="display:inline-block;background:#1f7ae0;color:#fff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:10px;margin:10px 0;">${texto}</a>`;

export const PLANTILLAS = {
  bienvenida: (idioma, { nombre, url, bonoCreditos }) => idioma === 'pt' ? {
    asunto: 'Bem-vindo ao MV Agendate IA — seus 14 dias grátis começaram',
    html: marco(`<h2 style="margin:0 0 8px;color:#0f2a43;">Olá${nombre ? ` ${nombre}` : ''}! 👋</h2>
      <p>Sua conta está pronta e você tem <strong>14 dias grátis</strong> com tudo habilitado: orçamentos com IA, agenda otimizada, CRM e dashboards.</p>
      ${bonoCreditos ? `<p>🎁 De presente, sua conta já vem com <strong>US$ ${bonoCreditos} em créditos de IA</strong>: é o que faz o chatbot e o ChatVoice funcionarem. Cada conversa desconta centavos do saldo; quando acabar, você recarrega em um toque (os packs maiores dão bônus).</p>` : ''}
      <p>Primeiro passo: entre e complete o assistente de configuração (2 minutos).</p>
      ${btn(url, 'Entrar na minha conta →')}
      <p style="font-size:13px;color:#5a6b7c;">Depois, se quiser continuar, a assinatura custa USD 15/mês pelo MercadoPago. Cancele quando quiser.</p>`),
  } : {
    asunto: 'Bienvenido a MV Agendate IA — arrancaron tus 14 días gratis',
    html: marco(`<h2 style="margin:0 0 8px;color:#0f2a43;">¡Hola${nombre ? ` ${nombre}` : ''}! 👋</h2>
      <p>Tu cuenta ya está lista y tenés <strong>14 días gratis</strong> con todo habilitado: cotizaciones con IA, agenda optimizada, CRM y dashboards.</p>
      ${bonoCreditos ? `<p>🎁 De regalo, tu cuenta ya viene con <strong>US$ ${bonoCreditos} en créditos de IA</strong>: es lo que hace funcionar el chatbot y el ChatVoice. Cada conversación descuenta centavos del saldo; cuando se acaba, recargás en un toque (los packs grandes traen bonificación).</p>` : ''}
      <p>Primer paso: entrá y completá el asistente de configuración (2 minutos).</p>
      ${btn(url, 'Entrar a mi cuenta →')}
      <p style="font-size:13px;color:#5a6b7c;">Después, si querés seguir, la suscripción sale USD 15/mes por MercadoPago. Cancelás cuando quieras.</p>`),
  },

  trialPorVencer: (idioma, { nombre, dias, url }) => idioma === 'pt' ? {
    asunto: dias === 1 ? 'Seu teste grátis termina amanhã' : `Seu teste grátis termina em ${dias} dias`,
    html: marco(`<h2 style="margin:0 0 8px;color:#0f2a43;">Olá${nombre ? ` ${nombre}` : ''},</h2>
      <p>${dias === 1 ? 'Amanhã' : `Em ${dias} dias`} termina o seu teste grátis do MV Agendate IA. Para não perder seu assistente, sua agenda e seus clientes, ative a assinatura (USD 15/mês pelo MercadoPago).</p>
      ${btn(url, 'Ativar assinatura →')}
      <p style="font-size:13px;color:#5a6b7c;">Seus dados ficam guardados: se ativar depois, tudo continua onde estava.</p>`),
  } : {
    asunto: dias === 1 ? 'Tu prueba gratis termina mañana' : `Tu prueba gratis termina en ${dias} días`,
    html: marco(`<h2 style="margin:0 0 8px;color:#0f2a43;">Hola${nombre ? ` ${nombre}` : ''},</h2>
      <p>${dias === 1 ? 'Mañana' : `En ${dias} días`} termina tu prueba gratis de MV Agendate IA. Para no perder tu asistente, tu agenda y tus clientes, activá la suscripción (USD 15/mes por MercadoPago).</p>
      ${btn(url, 'Activar suscripción →')}
      <p style="font-size:13px;color:#5a6b7c;">Tus datos quedan guardados: si activás más adelante, todo sigue donde estaba.</p>`),
  },

  compraConfirmada: (idioma, { nombre, plan, licencia, urlDescarga }) => idioma === 'pt' ? {
    asunto: `Sua licença do MV Agendate IA (${plan})`,
    html: marco(`<h2 style="margin:0 0 8px;color:#0f2a43;">Obrigado pela sua compra${nombre ? `, ${nombre}` : ''}! 🎉</h2>
      <p>Pagamento confirmado. Esta é a sua licença — guarde este email:</p>
      <p style="background:#f6f9fc;border:1px solid #e6ebf1;border-radius:10px;padding:12px;text-align:center;font-family:monospace;font-size:18px;"><strong>${licencia}</strong></p>
      ${urlDescarga ? btn(urlDescarga, '⬇ Baixar o programa') : ''}
      <p style="font-size:13px;color:#5a6b7c;">Na primeira vez que abrir o programa, insira este código para ativá-lo.</p>`),
  } : {
    asunto: `Tu licencia de MV Agendate IA (${plan})`,
    html: marco(`<h2 style="margin:0 0 8px;color:#0f2a43;">¡Gracias por tu compra${nombre ? `, ${nombre}` : ''}! 🎉</h2>
      <p>El pago está confirmado. Esta es tu licencia — guardá este email:</p>
      <p style="background:#f6f9fc;border:1px solid #e6ebf1;border-radius:10px;padding:12px;text-align:center;font-family:monospace;font-size:18px;"><strong>${licencia}</strong></p>
      ${urlDescarga ? btn(urlDescarga, '⬇ Descargar el programa') : ''}
      <p style="font-size:13px;color:#5a6b7c;">La primera vez que abras el programa, ingresá este código para activarlo.</p>`),
  },

  recargaAcreditada: (idioma, { monto, saldo, url }) => idioma === 'pt' ? {
    asunto: `Recarga de US$ ${monto} confirmada — saldo US$ ${saldo}`,
    html: marco(`<h2 style="margin:0 0 8px;color:#0f2a43;">Recarga confirmada ✅</h2>
      <p>Creditamos <strong>US$ ${monto}</strong> de créditos de IA na sua conta. Saldo atual: <strong>US$ ${saldo}</strong>.</p>
      ${btn(url, 'Ver minha conta →')}`),
  } : {
    asunto: `Recarga de US$ ${monto} acreditada — saldo US$ ${saldo}`,
    html: marco(`<h2 style="margin:0 0 8px;color:#0f2a43;">Recarga acreditada ✅</h2>
      <p>Te acreditamos <strong>US$ ${monto}</strong> de créditos de IA. Saldo actual: <strong>US$ ${saldo}</strong>.</p>
      ${btn(url, 'Ver mi cuenta →')}`),
  },

  creditosBajos: (idioma, { saldo, url }) => idioma === 'pt' ? {
    asunto: 'Seus créditos de IA estão acabando',
    html: marco(`<h2 style="margin:0 0 8px;color:#0f2a43;">Créditos de IA quase no fim ⚠️</h2>
      <p>Seu saldo é <strong>US$ ${saldo}</strong>. Quando chegar a 0, o assistente continua atendendo com a lógica básica (sem IA) até você recarregar.</p>
      ${btn(url, 'Recarregar agora →')}`),
  } : {
    asunto: 'Tus créditos de IA se están agotando',
    html: marco(`<h2 style="margin:0 0 8px;color:#0f2a43;">Créditos de IA por agotarse ⚠️</h2>
      <p>Tu saldo es <strong>US$ ${saldo}</strong>. Al llegar a 0, el asistente sigue atendiendo con la lógica básica (sin IA) hasta que recargues.</p>
      ${btn(url, 'Recargar ahora →')}`),
  },
};

/** Renderiza y envía una plantilla (fire-and-forget). */
export function enviarPlantilla(nombre, idioma, para, datos) {
  const tpl = PLANTILLAS[nombre];
  if (!tpl || !para) return;
  const { asunto, html } = tpl(idioma === 'pt' ? 'pt' : 'es', datos);
  enviarEmailAsync({ para, asunto, html });
}

// ---------- Ayudas de alto nivel (buscan email/idioma de la cuenta) ----------

const urlBase = () => cfg('sitioUrl') || 'https://mv-agendate-ia.vercel.app';

async function idiomaDeCuenta(cuentaId) {
  try {
    const ov = await obtenerOverrides(cuentaId);
    return idiomaDePais(ov?.pais || 'uy');
  } catch { return 'es'; }
}

/** Aviso de créditos de IA por agotarse (llamar solo al cruzar el umbral). */
export async function avisarCreditosBajos(cuentaId, saldo) {
  if (!emailsActivos()) return;
  const c = await obtenerCuenta(cuentaId);
  if (!c?.email) return;
  enviarPlantilla('creditosBajos', await idiomaDeCuenta(cuentaId), c.email,
    { saldo: Math.max(0, Math.round(saldo * 100) / 100), url: `${urlBase()}/app/#/cuenta` });
}

/** Recarga de créditos acreditada por el webhook de MercadoPago. */
export async function avisarRecarga(cuentaId, monto, saldo) {
  if (!emailsActivos()) return;
  const c = await obtenerCuenta(cuentaId);
  if (!c?.email) return;
  enviarPlantilla('recargaAcreditada', await idiomaDeCuenta(cuentaId), c.email,
    { monto, saldo, url: `${urlBase()}/app/#/cuenta` });
}

/**
 * Barrido diario: avisa a las cuentas cuyo trial vence en 2 días o mañana.
 * Idempotente: cada aviso se marca en Redis y no se repite. Pensado para un
 * cron externo o el Cron diario de Vercel → GET /api/cron/diario.
 */
export async function avisarTrialsPorVencer() {
  if (!emailsActivos()) return { ok: true, enviados: 0, motivo: 'sin_config' };
  const { listarCuentas } = await import('./cuentas.js');
  const cuentas = await listarCuentas();
  let enviados = 0;
  for (const c of cuentas) {
    if (c.estado !== 'trial' || !c.trialHasta || !c.email) continue;
    const dias = Math.ceil((new Date(c.trialHasta) - Date.now()) / 86400000);
    if (dias !== 2 && dias !== 1) continue;
    const marca = `avisotrial:${c.id}:${dias}`;
    if (await kvGet(marca)) continue; // ya avisado
    enviarPlantilla('trialPorVencer', await idiomaDeCuenta(c.id), c.email,
      { nombre: c.nombre, dias, url: `${urlBase()}/app/#/cuenta` });
    await kvSet(marca, new Date().toISOString());
    enviados++;
  }
  return { ok: true, enviados };
}
