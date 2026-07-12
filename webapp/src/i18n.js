// Multiidioma del workspace (es/pt/en).
// Patrón: t('texto en español') devuelve la traducción al idioma activo; si la
// clave no está en el diccionario (o el idioma es 'es') devuelve el texto tal
// cual — nunca rompe la UI. El idioma se comparte con las páginas públicas vía
// localStorage ('mvIdioma') y se autodetecta del navegador la primera vez.

export function idioma() {
  const g = localStorage.getItem('mvIdioma');
  if (g === 'pt' || g === 'es' || g === 'en') return g;
  const nav = (navigator.language || '').toLowerCase();
  if (nav.startsWith('pt')) return 'pt';
  if (nav.startsWith('en')) return 'en';
  return 'es';
}

export function setIdioma(idi) {
  localStorage.setItem('mvIdioma', ['es', 'pt', 'en'].includes(idi) ? idi : 'es');
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
  'Esta semana:': 'Esta semana:',
  'consultas con IA': 'consultas com IA',
  'Bonificado acumulado:': 'Bônus acumulado:',
  'gratis': 'grátis',
  'créditos IA': 'créditos IA',
  'Recargar →': 'Recarregar →',
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

const EN = {
  // Navegación
  'Panel del día': 'Today\'s panel', 'Agenda': 'Calendar', 'Clientes': 'Clients',
  'Dashboards': 'Dashboards', 'Ayuda': 'Help', 'Espacio de trabajo': 'Workspace',
  'Mi cuenta': 'My account', 'Cuenta online': 'Online account', 'Cuentas SaaS': 'SaaS accounts',
  'Inicio': 'Home', 'Configuración': 'Settings', 'Clave admin': 'Admin key',
  'Clave de administración:': 'Administration key:', 'Abrir menú': 'Open menu', 'Idioma': 'Language',
  // Estados de cita
  'pendiente': 'pending', 'confirmada': 'confirmed', 'en_curso': 'in progress',
  'completada': 'completed', 'cancelada': 'cancelled',
  // Panel
  'Citas de hoy': 'Today\'s appointments', 'En curso': 'In progress', 'Visitas a la demo': 'Demo visits',
  'Cotizaciones por aprobar': 'Quotes to approve',
  'El asistente nunca le dice un precio al cliente sin tu OK: acá aprobás cada cotización tal cual (o ajustás el monto) y recién ahí se le confirma. Si la charla fue por WhatsApp, el cliente recibe el precio al instante.':
    'The assistant never tells a client a price without your OK: here you approve each quote as-is (or adjust the amount) and only then is it confirmed. If the chat was on WhatsApp, the client gets the price instantly.',
  'No hay cotizaciones esperando tu aprobación.': 'No quotes waiting for your approval.',
  'Trabajo': 'Job', 'Cliente': 'Client', 'Canal': 'Channel', 'Sugerido': 'Suggested',
  'Precio a confirmar': 'Price to confirm', 'Aprobar': 'Approve', 'Rechazar': 'Reject',
  'No se pudo resolver.': 'Could not resolve.', 'Precio confirmado': 'Price confirmed',
  ' — el cliente ya recibió el aviso por WhatsApp.': ' — the client already got the notice on WhatsApp.',
  ' — el asistente se lo informa al cliente en cuanto retome la charla.': ' — the assistant tells the client as soon as the chat resumes.',
  'Cotización rechazada: el asistente le dirá al cliente que lo contactás directamente.': 'Quote rejected: the assistant will tell the client you\'ll contact them directly.',
  'Aviso automático de retrasos': 'Automatic delay notices',
  'Si marcás un trabajo "en curso" y se estima que vas a llegar 30+ min tarde a la siguiente cita, se le avisa solo por WhatsApp al próximo cliente. En el servidor local esto corre cada 5 min; podés forzarlo ahora:':
    'If you mark a job "in progress" and you\'re estimated to arrive 30+ min late to the next appointment, the next client is notified automatically on WhatsApp. On the local server this runs every 5 min; you can force it now:',
  'Revisar retrasos ahora': 'Check delays now', 'Revisando…': 'Checking…',
  'aviso(s) de retraso enviados.': 'delay notice(s) sent.', 'Sin retrasos detectados por ahora.': 'No delays detected for now.',
  'Agenda de hoy': 'Today\'s calendar', 'Sin citas para hoy.': 'No appointments for today.',
  'Hora': 'Time', 'Dirección': 'Address', 'Estado': 'Status', 'Presupuesto': 'Quote', 'Profesional': 'Professional',
  // Agenda
  'Tabla': 'Table', 'Tablero': 'Board', 'Oficio': 'Trade', 'Fecha': 'Date', 'Precio': 'Price',
  '+ Nueva cita': '+ New appointment', 'Nueva cita': 'New appointment',
  'Sin citas con ese filtro.': 'No appointments with that filter.', 'Cambiar estado…': 'Change status…',
  'Vacío': 'Empty', 'Teléfono': 'Phone', '(el primero)': '(the first one)',
  'Hora inicio': 'Start time', 'Hora fin': 'End time', 'Distancia estimada (km)': 'Estimated distance (km)',
  'Quién atiende (si no es el titular)': 'Who receives you (if not the account holder)',
  'Guardar cita': 'Save appointment', 'Cancelar': 'Cancel',
  'Completá al menos cliente, fecha y hora.': 'Fill in at least client, date and time.',
  'Presupuesto estimado:': 'Estimated quote:', '· atiende': '· received by', 'Error': 'Error',
  // Clientes
  '+ Nuevo cliente': '+ New client', 'Sin fichas aún.': 'No records yet.', 'Nombre': 'Name',
  'Contacto': 'Contact', 'Receptor habitual': 'Usual receiver', 'sin dirección cargada': 'no address saved',
  'Notas': 'Notes', 'Atendido por': 'Handled by', 'Sin asignar': 'Unassigned', 'Confirmar': 'Confirm',
  'Dirección confirmada.': 'Address confirmed.', 'Dirección actualizada (no coincidía con la base).': 'Address updated (didn\'t match the record).',
  'Trabajos': 'Jobs', 'Sin trabajos registrados todavía.': 'No jobs recorded yet.', 'Ver ficha': 'View record',
  '➕ Nueva ficha de cliente': '➕ New client record', 'Quién suele atender (si no es el titular)': 'Who usually receives you (if not the holder)',
  'Dirección de la base': 'Base address', 'Guardar ficha': 'Save record', 'Poné al menos el nombre.': 'Enter at least the name.',
  // Dashboards
  'Año': 'Year', 'Mes': 'Month', 'Todos': 'All', 'Agenda CSV': 'Calendar CSV', 'Agenda Excel': 'Calendar Excel',
  'Clientes Excel': 'Clients Excel', 'Trabajos totales': 'Total jobs', 'Completados': 'Completed',
  'Cancelados': 'Cancelled', 'Sueldo total (completados)': 'Total earnings (completed)', 'Ticket promedio': 'Average ticket',
  'Trabajos (12m)': 'Jobs (12m)', 'Facturado (12m)': 'Revenue (12m)', 'vs mes ant.': 'vs prev. month',
  '📈 Evolución mensual — trabajos y facturación (12 meses)': '📈 Monthly trend — jobs and revenue (12 months)',
  'Facturación (escala propia)': 'Revenue (own scale)', 'Trabajos por oficio': 'Jobs by trade',
  'Trabajos por estado': 'Jobs by status', 'Trabajos por día de la semana': 'Jobs by weekday',
  'Comparativa año contra año': 'Year-over-year comparison', 'Sin datos': 'No data', 'Cargando…': 'Loading…',
  '🧾 Neto estimado según los impuestos de tu país': '🧾 Estimated net after your country\'s taxes',
  'La IA estima tu carga impositiva (régimen simplificado, aportes) según la ley de tu país configurado y calcula cuánto te queda neto. Orientativo — no reemplaza a tu contador.':
    'AI estimates your tax burden (simplified regime, contributions) per your configured country\'s law and calculates your net. Indicative — it doesn\'t replace your accountant.',
  'Facturación mensual': 'Monthly revenue', 'sugerido:': 'suggested:', 'Estimar impuestos': 'Estimate taxes',
  'Estimando…': 'Estimating…', 'Régimen sugerido:': 'Suggested regime:', '· calculado con IA': '· calculated with AI',
  '· guía local aproximada': '· approximate local guide', 'Facturación bruta': 'Gross revenue',
  'Neto estimado': 'Estimated net', 'Error de red.': 'Network error.',
  // Cuenta
  'Créditos de IA': 'AI credits', 'Saldo:': 'Balance:',
  'Con esto funciona el chatbot y el ChatVoice con IA. Cuando se agota, el asistente sigue respondiendo con lógica básica hasta que recargues.':
    'This powers the chatbot and ChatVoice with AI. When it runs out, the assistant keeps replying with basic logic until you top up.',
  ' Te queda poco saldo.': ' You\'re low on balance.', 'Recargar US$': 'Top up US$',
  'Esta semana:': 'This week:', 'consultas con IA': 'AI conversations', 'Bonificado acumulado:': 'Bonus accumulated:',
  'gratis': 'free', 'créditos IA': 'AI credits', 'Recargar →': 'Top up →',
  'Conectando con MercadoPago…': 'Connecting to MercadoPago…', 'No se pudo iniciar la recarga.': 'Could not start the top-up.',
  'Prueba gratis': 'Free trial', 'días restantes': 'days left', 'Suscripción activa': 'Active subscription',
  'Activar suscripción (USD 15/mes)': 'Activate subscription (USD 15/mo)', 'Cerrar sesión': 'Sign out', 'Estado:': 'Status:',
  'Usá MV desde el navegador, sin instalar nada': 'Use MV from your browser, nothing to install',
  '14 días de prueba gratis, después USD 15/mes por MercadoPago. Tus datos y tu configuración (profesión, país, precios, horarios, equipo, canales) quedan privados y aislados, disponibles desde cualquier dispositivo.':
    '14-day free trial, then USD 15/mo via MercadoPago. Your data and settings (trade, country, prices, hours, team, channels) stay private and isolated, available from any device.',
  'Iniciar sesión': 'Sign in', 'Crear cuenta': 'Create account', 'Nombre o empresa': 'Name or business',
  'Ej: Estudio Jurídico Pérez': 'e.g. Pérez Law Firm', 'Contraseña': 'Password', '(mínimo 8 caracteres)': '(min. 8 characters)',
  'Un momento…': 'One moment…', 'Crear cuenta (14 días gratis)': 'Create account (14 days free)', 'Entrar': 'Sign in',
  'No se pudo iniciar sesión.': 'Could not sign in.', 'Error de conexión. Probá de nuevo.': 'Connection error. Try again.',
  '¿Preferís tenerlo instalado en tu PC o Android con pago único? Esta pantalla es solo para el modo online — la versión descargable no necesita cuenta.':
    'Prefer it installed on your PC or Android with a one-time payment? This screen is only for online mode — the downloadable version needs no account.',
  // Candado de prueba
  'Activando…': 'Activating…', '✅ ¡Licencia activada! Gracias por tu compra.': '✅ License activated! Thanks for your purchase.',
  'No se pudo activar el código. Revisá que sea el que te llegó al comprar.': 'Could not activate the code. Check it\'s the one you got at purchase.',
  'te queda 1 día': '1 day left', 'te quedan': 'you have', 'días': 'days left',
  'Comprá tu licencia →': 'Buy your license →', 'Tu prueba gratis terminó': 'Your free trial ended',
  'Gracias por probar MV Agendate IA. Para seguir usándolo, comprá tu licencia (pago único) y activala acá con el código que te llega al pagar.':
    'Thanks for trying MV Agendate IA. To keep using it, buy your license (one-time) and activate it here with the code you get on payment.',
  'Comprar licencia →': 'Buy license →', 'Código de licencia (te llegó al comprar)': 'License code (you got it at purchase)',
  'Ya compré — activar licencia': 'Already bought — activate license',
  // Ayuda
  '🚀 Tutorial — primeros pasos': '🚀 Tutorial — getting started', '📖 Guía por tema': '📖 Guide by topic',
  '🤖 Preguntale a la IA sobre el programa': '🤖 Ask the AI about the program',
  'Respuestas al instante sobre configuración, canales, agenda, planes y todo lo demás. Sin API key cargada responde desde la guía local.':
    'Instant answers about setup, channels, calendar, plans and everything else. Without an API key it answers from the local guide.',
  'Enviar': 'Send', 'Ej: ¿cómo conecto WhatsApp?': 'e.g. how do I connect WhatsApp?', 'Pensando…': 'Thinking…',
  'No pude responder, probá de nuevo.': 'Couldn\'t answer, try again.',
  'Error de conexión — revisá que el servidor esté corriendo y probá de nuevo.': 'Connection error — check the server is running and try again.',
  'Hola 👋 Soy el asistente de ayuda de MV Agendate IA. Preguntame lo que quieras sobre el programa: cómo configurarlo, conectar WhatsApp, los planes, la agenda…':
    'Hi 👋 I\'m the MV Agendate IA help assistant. Ask me anything about the program: how to set it up, connect WhatsApp, plans, the calendar…',
  '¿Cómo conecto WhatsApp?': 'How do I connect WhatsApp?', '¿Qué incluye cada plan?': 'What\'s in each plan?',
  '¿Cómo cargo mis precios?': 'How do I load my prices?', '¿Funciona sin internet la voz?': 'Does voice work offline?',
  '¿Cómo agrego otro profesional?': 'How do I add another professional?',
  // Cuentas SaaS
  'Cuentas SaaS registradas': 'Registered SaaS accounts',
  // Onboarding
  '¡Bienvenido a MV Agendate IA!': 'Welcome to MV Agendate IA!',
  'En 4 pasos cortos dejamos tu asistente listo para cotizar y agendar.': 'In 4 short steps we get your assistant ready to quote and book.',
  'Vos y tu país': 'You and your country', 'Tu nombre (así te presenta el asistente)': 'Your name (how the assistant introduces you)',
  'Ej: Marcelo Techera': 'e.g. Marcus Taylor', 'País (define moneda, idioma y precios de mercado)': 'Country (sets currency, language and market prices)',
  'Siguiente →': 'Next →', 'Configurar después': 'Set up later', 'Tu profesión u oficio': 'Your profession or trade',
  'Elegí la tuya — el catálogo de trabajos y precios se arma solo': 'Pick yours — the jobs and prices catalog builds itself',
  '¿No está la tuya? Elegí la más parecida y después creá la propia en Configuración → Profesiones (1 minuto).': 'Not there? Pick the closest one and later create your own in Settings → Professions (1 minute).',
  '← Atrás': '← Back', 'Tu jornada': 'Your workday', 'Empezás': 'Start', 'Terminás': 'End',
  'Almuerzo desde': 'Lunch from', 'Almuerzo hasta': 'Lunch until', 'Días libres (la agenda nunca ofrece turnos ahí):': 'Days off (the calendar never offers slots there):',
  'Lun': 'Mon', 'Mar': 'Tue', 'Mié': 'Wed', 'Jue': 'Thu', 'Vie': 'Fri', 'Sáb': 'Sat', 'Dom': 'Sun',
  'Guardando…': 'Saving…', 'Guardar y seguir →': 'Save and continue →', 'Precios de tu mercado (opcional)': 'Your market prices (optional)',
  'La IA investiga qué se cobra hoy en tu país por cada trabajo de tu profesión y deja tu catálogo con esos valores de referencia. Podés saltearlo y cargar los tuyos a mano.':
    'AI researches what your country charges today for each job in your trade and sets your catalog with those reference values. You can skip it and load yours manually.',
  '🔎 Sugerir precios con IA': '🔎 Suggest prices with AI', 'Investigando…': 'Researching…',
  '🔎 Investigando precios de tu mercado con IA… (unos segundos)': '🔎 Researching your market prices with AI… (a few seconds)',
  'No se pudo investigar.': 'Could not research.', 'No se pudo aplicar.': 'Could not apply.',
  'Listo: tu catálogo quedó con precios de mercado de': 'Done: your catalog now has market prices for',
  'Los afinás cuando quieras en Configuración → Precios.': 'Fine-tune them anytime in Settings → Prices.',
  '¡Listo, a trabajar! →': 'Done, let\'s work! →', 'Saltear y terminar': 'Skip and finish',
  'Después conectá tu WhatsApp y tu teléfono desde Configuración — el webchat de la demo ya funciona.': 'Later connect your WhatsApp and phone from Settings — the demo webchat already works.',
};

/** Traduce un texto de UI al idioma activo (fallback: el texto tal cual). */
export function t(texto) {
  const idi = idioma();
  if (idi === 'pt') return PT[texto] ?? texto;
  if (idi === 'en') return EN[texto] ?? texto;
  return texto;
}
