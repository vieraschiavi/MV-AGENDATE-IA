// Multiidioma del workspace (es/pt).
// Patrón: t('texto en español') devuelve la traducción al portugués si el
// idioma activo es 'pt'; si la clave no está en el diccionario (o el idioma
// es 'es') devuelve el texto tal cual — nunca rompe la UI.
// El idioma se comparte con las páginas públicas vía localStorage ('mvIdioma').

export function idioma() {
  const guardado = localStorage.getItem('mvIdioma');
  if (guardado === 'pt' || guardado === 'es') return guardado;
  return (navigator.language || '').toLowerCase().startsWith('pt') ? 'pt' : 'es';
}

export function setIdioma(idi) {
  localStorage.setItem('mvIdioma', idi === 'pt' ? 'pt' : 'es');
  window.location.reload(); // recarga simple: toda la UI re-lee t()
}

const PT = {
  // ---- Navegación (App.jsx) ----
  'Panel del día': 'Painel do dia',
  'Agenda': 'Agenda',
  'Clientes': 'Clientes',
  'Dashboards': 'Dashboards',
  'Ayuda': 'Ajuda',
  'Espacio de trabajo': 'Espaço de trabalho',
  'Mi cuenta': 'Minha conta',
  'Cuenta online': 'Conta online',
  'Cuentas SaaS': 'Contas SaaS',
  'Inicio': 'Início',
  'Configuración': 'Configuração',
  'Clave admin': 'Chave admin',
  'Clave de administración:': 'Chave de administração:',
  'Abrir menú': 'Abrir menu',
  'Idioma': 'Idioma',

  // ---- Estados de cita (se muestran traducidos, el valor no cambia) ----
  'pendiente': 'pendente',
  'confirmada': 'confirmada',
  'en_curso': 'em andamento',
  'completada': 'concluída',
  'cancelada': 'cancelada',

  // ---- Panel del día ----
  'Citas de hoy': 'Atendimentos de hoje',
  'En curso': 'Em andamento',
  'Visitas a la demo': 'Visitas à demo',
  'Cotizaciones por aprobar': 'Orçamentos para aprovar',
  'El asistente nunca le dice un precio al cliente sin tu OK: acá aprobás cada cotización tal cual (o ajustás el monto) y recién ahí se le confirma. Si la charla fue por WhatsApp, el cliente recibe el precio al instante.':
    'O assistente nunca diz um preço ao cliente sem o seu OK: aqui você aprova cada orçamento como está (ou ajusta o valor) e só então ele é confirmado. Se a conversa foi pelo WhatsApp, o cliente recebe o preço na hora.',
  'No hay cotizaciones esperando tu aprobación.': 'Não há orçamentos esperando a sua aprovação.',
  'Trabajo': 'Serviço',
  'Cliente': 'Cliente',
  'Canal': 'Canal',
  'Sugerido': 'Sugerido',
  'Precio a confirmar': 'Preço a confirmar',
  'Aprobar': 'Aprovar',
  'Rechazar': 'Recusar',
  'No se pudo resolver.': 'Não foi possível resolver.',
  'Precio confirmado': 'Preço confirmado',
  ' — el cliente ya recibió el aviso por WhatsApp.': ' — o cliente já recebeu o aviso pelo WhatsApp.',
  ' — el asistente se lo informa al cliente en cuanto retome la charla.': ' — o assistente informa o cliente assim que retomar a conversa.',
  'Cotización rechazada: el asistente le dirá al cliente que lo contactás directamente.': 'Orçamento recusado: o assistente dirá ao cliente que você entrará em contato diretamente.',
  'Aviso automático de retrasos': 'Aviso automático de atrasos',
  'Si marcás un trabajo "en curso" y se estima que vas a llegar 30+ min tarde a la siguiente cita, se le avisa solo por WhatsApp al próximo cliente. En el servidor local esto corre cada 5 min; podés forzarlo ahora:':
    'Se você marca um serviço "em andamento" e a estimativa é chegar 30+ min atrasado ao próximo atendimento, o próximo cliente é avisado sozinho pelo WhatsApp. No servidor local isso roda a cada 5 min; você pode forçar agora:',
  'Revisar retrasos ahora': 'Verificar atrasos agora',
  'Revisando…': 'Verificando…',
  'aviso(s) de retraso enviados.': 'aviso(s) de atraso enviados.',
  'Sin retrasos detectados por ahora.': 'Sem atrasos detectados por enquanto.',
  'Agenda de hoy': 'Agenda de hoje',
  'Sin citas para hoy.': 'Sem atendimentos para hoje.',
  'Hora': 'Hora',
  'Dirección': 'Endereço',
  'Estado': 'Status',
  'Presupuesto': 'Orçamento',
  'Profesional': 'Profissional',

  // ---- Agenda ----
  'Tabla': 'Tabela',
  'Tablero': 'Quadro',
  'Oficio': 'Profissão',
  'Fecha': 'Data',
  'Precio': 'Preço',
  '+ Nueva cita': '+ Novo atendimento',
  'Nueva cita': 'Novo atendimento',
  'Sin citas con ese filtro.': 'Sem atendimentos com esse filtro.',
  'Cambiar estado…': 'Mudar status…',
  'Vacío': 'Vazio',
  'Teléfono': 'Telefone',
  '(el primero)': '(o primeiro)',
  'Hora inicio': 'Hora de início',
  'Hora fin': 'Hora de fim',
  'Distancia estimada (km)': 'Distância estimada (km)',
  'Quién atiende (si no es el titular)': 'Quem recebe (se não for o titular)',
  'Guardar cita': 'Salvar atendimento',
  'Cancelar': 'Cancelar',
  'Completá al menos cliente, fecha y hora.': 'Preencha pelo menos cliente, data e hora.',
  'Presupuesto estimado:': 'Orçamento estimado:',
  '· atiende': '· recebe',
  'Error': 'Erro',

  // ---- Clientes ----
  '+ Nuevo cliente': '+ Novo cliente',
  'Sin fichas aún.': 'Sem fichas ainda.',
  'Nombre': 'Nome',
  'Contacto': 'Contato',
  'Receptor habitual': 'Quem costuma receber',
  'sin dirección cargada': 'sem endereço cadastrado',
  'Notas': 'Notas',
  'Atendido por': 'Atendido por',
  'Sin asignar': 'Sem atribuir',
  'Confirmar': 'Confirmar',
  'Dirección confirmada.': 'Endereço confirmado.',
  'Dirección actualizada (no coincidía con la base).': 'Endereço atualizado (não coincidia com a base).',
  'Trabajos': 'Serviços',
  'Sin trabajos registrados todavía.': 'Sem serviços registrados ainda.',
  'Ver ficha': 'Ver ficha',
  '➕ Nueva ficha de cliente': '➕ Nova ficha de cliente',
  'Quién suele atender (si no es el titular)': 'Quem costuma receber (se não for o titular)',
  'Dirección de la base': 'Endereço da base',
  'Guardar ficha': 'Salvar ficha',
  'Poné al menos el nombre.': 'Coloque pelo menos o nome.',

  // ---- Dashboards ----
  'Año': 'Ano',
  'Mes': 'Mês',
  'Todos': 'Todos',
  'Agenda CSV': 'Agenda CSV',
  'Agenda Excel': 'Agenda Excel',
  'Clientes Excel': 'Clientes Excel',
  'Trabajos totales': 'Serviços totais',
  'Completados': 'Concluídos',
  'Cancelados': 'Cancelados',
  'Sueldo total (completados)': 'Renda total (concluídos)',
  'Ticket promedio': 'Ticket médio',
  'Trabajos (12m)': 'Serviços (12m)',
  'Facturado (12m)': 'Faturado (12m)',
  'vs mes ant.': 'vs mês ant.',
  '📈 Evolución mensual — trabajos y facturación (12 meses)': '📈 Evolução mensal — serviços e faturamento (12 meses)',
  'Facturación (escala propia)': 'Faturamento (escala própria)',
  'Trabajos por oficio': 'Serviços por profissão',
  'Trabajos por estado': 'Serviços por status',
  'Trabajos por día de la semana': 'Serviços por dia da semana',
  'Comparativa año contra año': 'Comparativo ano contra ano',
  'Sin datos': 'Sem dados',
  'Cargando…': 'Carregando…',
  '🧾 Neto estimado según los impuestos de tu país': '🧾 Líquido estimado conforme os impostos do seu país',
  'La IA estima tu carga impositiva (régimen simplificado, aportes) según la ley de tu país configurado y calcula cuánto te queda neto. Orientativo — no reemplaza a tu contador.':
    'A IA estima sua carga tributária (regime simplificado, contribuições) conforme a lei do seu país configurado e calcula quanto sobra líquido. Orientativo — não substitui o seu contador.',
  'Facturación mensual': 'Faturamento mensal',
  'sugerido:': 'sugerido:',
  'Estimar impuestos': 'Estimar impostos',
  'Estimando…': 'Estimando…',
  'Régimen sugerido:': 'Regime sugerido:',
  '· calculado con IA': '· calculado com IA',
  '· guía local aproximada': '· guia local aproximado',
  'Facturación bruta': 'Faturamento bruto',
  'Neto estimado': 'Líquido estimado',
  'Error de red.': 'Erro de rede.',

  // ---- Cuenta ----
  'Créditos de IA': 'Créditos de IA',
  'Saldo:': 'Saldo:',
  'Con esto funciona el chatbot y el ChatVoice con IA. Cuando se agota, el asistente sigue respondiendo con lógica básica hasta que recargues.':
    'Com isto funcionam o chatbot e o ChatVoice com IA. Quando acabar, o assistente continua respondendo com lógica básica até você recarregar.',
  ' Te queda poco saldo.': ' Está ficando com pouco saldo.',
  'Recargar US$': 'Recarregar US$',
  'Conectando con MercadoPago…': 'Conectando com o MercadoPago…',
  'No se pudo iniciar la recarga.': 'Não foi possível iniciar a recarga.',
  'Prueba gratis': 'Teste grátis',
  'días restantes': 'dias restantes',
  'Suscripción activa': 'Assinatura ativa',
  'Activar suscripción (USD 15/mes)': 'Ativar assinatura (USD 15/mês)',
  'Cerrar sesión': 'Sair',
  'Estado:': 'Status:',
  'Usá MV desde el navegador, sin instalar nada': 'Use o MV pelo navegador, sem instalar nada',
  '14 días de prueba gratis, después USD 15/mes por MercadoPago. Tus datos y tu configuración (profesión, país, precios, horarios, equipo, canales) quedan privados y aislados, disponibles desde cualquier dispositivo.':
    '14 dias de teste grátis, depois USD 15/mês pelo MercadoPago. Seus dados e sua configuração (profissão, país, preços, horários, equipe, canais) ficam privados e isolados, disponíveis de qualquer dispositivo.',
  'Iniciar sesión': 'Entrar',
  'Crear cuenta': 'Criar conta',
  'Nombre o empresa': 'Nome ou empresa',
  'Ej: Estudio Jurídico Pérez': 'Ex.: Escritório Jurídico Silva',
  'Contraseña': 'Senha',
  '(mínimo 8 caracteres)': '(mínimo 8 caracteres)',
  'Un momento…': 'Um momento…',
  'Crear cuenta (14 días gratis)': 'Criar conta (14 dias grátis)',
  'Entrar': 'Entrar',
  'No se pudo iniciar sesión.': 'Não foi possível entrar.',
  'Error de conexión. Probá de nuevo.': 'Erro de conexão. Tente de novo.',
  '¿Preferís tenerlo instalado en tu PC o Android con pago único? Esta pantalla es solo para el modo online — la versión descargable no necesita cuenta.':
    'Prefere tê-lo instalado no seu PC ou Android com pagamento único? Esta tela é só para o modo online — a versão para download não precisa de conta.',

  // ---- Candado de prueba ----
  'Activando…': 'Ativando…',
  '✅ ¡Licencia activada! Gracias por tu compra.': '✅ Licença ativada! Obrigado pela sua compra.',
  'No se pudo activar el código. Revisá que sea el que te llegó al comprar.': 'Não foi possível ativar o código. Verifique se é o que chegou na compra.',
  'te queda 1 día': 'falta 1 dia',
  'te quedan': 'faltam',
  'días': 'dias',
  'Comprá tu licencia →': 'Compre a sua licença →',
  'Tu prueba gratis terminó': 'Seu teste grátis terminou',
  'Gracias por probar MV Agendate IA. Para seguir usándolo, comprá tu licencia (pago único) y activala acá con el código que te llega al pagar.':
    'Obrigado por testar o MV Agendate IA. Para continuar usando, compre a sua licença (pagamento único) e ative aqui com o código que chega ao pagar.',
  'Comprar licencia →': 'Comprar licença →',
  'Código de licencia (te llegó al comprar)': 'Código de licença (chegou na compra)',
  'Ya compré — activar licencia': 'Já comprei — ativar licença',

  // ---- Ayuda (encabezados + chat; la guía detallada sigue en español) ----
  '🚀 Tutorial — primeros pasos': '🚀 Tutorial — primeiros passos',
  '📖 Guía por tema': '📖 Guia por tema',
  '🤖 Preguntale a la IA sobre el programa': '🤖 Pergunte à IA sobre o programa',
  'Respuestas al instante sobre configuración, canales, agenda, planes y todo lo demás. Sin API key cargada responde desde la guía local.':
    'Respostas na hora sobre configuração, canais, agenda, planos e tudo o mais. Sem API key cadastrada responde a partir do guia local.',
  'Enviar': 'Enviar',
  'Ej: ¿cómo conecto WhatsApp?': 'Ex.: como conecto o WhatsApp?',
  'Pensando…': 'Pensando…',
  'No pude responder, probá de nuevo.': 'Não consegui responder, tente de novo.',
  'Error de conexión — revisá que el servidor esté corriendo y probá de nuevo.': 'Erro de conexão — verifique se o servidor está rodando e tente de novo.',
  'Hola 👋 Soy el asistente de ayuda de MV Agendate IA. Preguntame lo que quieras sobre el programa: cómo configurarlo, conectar WhatsApp, los planes, la agenda…':
    'Olá 👋 Sou o assistente de ajuda do MV Agendate IA. Pergunte o que quiser sobre o programa: como configurá-lo, conectar o WhatsApp, os planos, a agenda…',
  '¿Cómo conecto WhatsApp?': 'Como conecto o WhatsApp?',
  '¿Qué incluye cada plan?': 'O que inclui cada plano?',
  '¿Cómo cargo mis precios?': 'Como cadastro meus preços?',
  '¿Funciona sin internet la voz?': 'A voz funciona sem internet?',
  '¿Cómo agrego otro profesional?': 'Como adiciono outro profissional?',

  // ---- Cuentas SaaS (panel del vendedor) ----
  'Cuentas SaaS registradas': 'Contas SaaS registradas',

  // ---- Onboarding (wizard de primer uso) ----
  '¡Bienvenido a MV Agendate IA!': 'Bem-vindo ao MV Agendate IA!',
  'En 4 pasos cortos dejamos tu asistente listo para cotizar y agendar.': 'Em 4 passos curtos deixamos seu assistente pronto para orçar e agendar.',
  'Vos y tu país': 'Você e o seu país',
  'Tu nombre (así te presenta el asistente)': 'Seu nome (é assim que o assistente apresenta você)',
  'Ej: Marcelo Techera': 'Ex.: Marcelo Silva',
  'País (define moneda, idioma y precios de mercado)': 'País (define moeda, idioma e preços de mercado)',
  'Siguiente →': 'Próximo →',
  'Configurar después': 'Configurar depois',
  'Tu profesión u oficio': 'Sua profissão ou ofício',
  'Elegí la tuya — el catálogo de trabajos y precios se arma solo': 'Escolha a sua — o catálogo de serviços e preços se monta sozinho',
  '¿No está la tuya? Elegí la más parecida y después creá la propia en Configuración → Profesiones (1 minuto).': 'A sua não está? Escolha a mais parecida e depois crie a própria em Configuração → Profissões (1 minuto).',
  '← Atrás': '← Voltar',
  'Tu jornada': 'Sua jornada',
  'Empezás': 'Começa',
  'Terminás': 'Termina',
  'Almuerzo desde': 'Almoço desde',
  'Almuerzo hasta': 'Almoço até',
  'Días libres (la agenda nunca ofrece turnos ahí):': 'Dias de folga (a agenda nunca oferece horários neles):',
  'Lun': 'Seg', 'Mar': 'Ter', 'Mié': 'Qua', 'Jue': 'Qui', 'Vie': 'Sex', 'Sáb': 'Sáb', 'Dom': 'Dom',
  'Guardando…': 'Salvando…',
  'Guardar y seguir →': 'Salvar e continuar →',
  'Precios de tu mercado (opcional)': 'Preços do seu mercado (opcional)',
  'La IA investiga qué se cobra hoy en tu país por cada trabajo de tu profesión y deja tu catálogo con esos valores de referencia. Podés saltearlo y cargar los tuyos a mano.':
    'A IA pesquisa o que se cobra hoje no seu país por cada serviço da sua profissão e deixa seu catálogo com esses valores de referência. Você pode pular e cadastrar os seus manualmente.',
  '🔎 Sugerir precios con IA': '🔎 Sugerir preços com IA',
  'Investigando…': 'Pesquisando…',
  '🔎 Investigando precios de tu mercado con IA… (unos segundos)': '🔎 Pesquisando preços do seu mercado com IA… (alguns segundos)',
  'No se pudo investigar.': 'Não foi possível pesquisar.',
  'No se pudo aplicar.': 'Não foi possível aplicar.',
  'Listo: tu catálogo quedó con precios de mercado de': 'Pronto: seu catálogo ficou com preços de mercado de',
  'Los afinás cuando quieras en Configuración → Precios.': 'Você os ajusta quando quiser em Configuração → Preços.',
  '¡Listo, a trabajar! →': 'Pronto, ao trabalho! →',
  'Saltear y terminar': 'Pular e terminar',
  'Después conectá tu WhatsApp y tu teléfono desde Configuración — el webchat de la demo ya funciona.': 'Depois conecte seu WhatsApp e seu telefone em Configuração — o webchat da demo já funciona.',
};

/** Traduce un texto de UI al idioma activo (fallback: el texto tal cual). */
export function t(texto) {
  if (idioma() !== 'pt') return texto;
  return PT[texto] ?? texto;
}
