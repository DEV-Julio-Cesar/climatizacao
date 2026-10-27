/**
 * agendaLembretes.js
 *
 * Agenda notificações locais de lembrete para cada O.S. da agenda do técnico.
 * Usa expo-notifications (já presente no projeto) com canal "atendimentos".
 *
 * Regras:
 *  - Dispara 30 minutos antes do horário agendado da O.S.
 *  - Não cria notificação se a O.S. já começou ou já está a < 5 min.
 *  - Cancela lembretes de O.S. que não aparecem mais na agenda (foram
 *    reagendadas, canceladas ou finalizadas).
 *  - Não agenda nada se o usuário desativou notificações nas preferências.
 *  - Persistente entre sessões: os IDs das notificações agendadas ficam em
 *    AsyncStorage com a chave @climasaas/lembretes.
 */

import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@climasaas/lembretes';
const ANTECEDENCIA_MS = 30 * 60 * 1000;    // 30 min antes
const MARGEM_MINIMA_MS = 5 * 60 * 1000;    // descarta se < 5 min

// ─── helpers ──────────────────────────────────────────────────────────────

/** Lê o mapa osId → notificationId do AsyncStorage. */
async function lerMapa() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/** Persiste o mapa osId → notificationId no AsyncStorage. */
async function salvarMapa(mapa) {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(mapa));
  } catch {
    // não crítico — o pior caso é um lembrete duplicado
  }
}

/**
 * Garante que o canal Android "atendimentos" exista.
 * É idempotente — pode ser chamado múltiplas vezes sem efeito colateral.
 */
async function garantirCanal() {
  const { Platform } = await import('react-native');
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('atendimentos', {
    name: 'Atendimentos',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 200, 150, 200],
    sound: 'default',
  });
}

// ─── API pública ──────────────────────────────────────────────────────────

/**
 * Sincroniza os lembretes locais com a lista de O.S. da agenda.
 *
 * @param {Array}   ordens            - Lista de OS retornadas por /os/agenda
 * @param {boolean} notificacoesAtivas - Preferência do usuário em AppContext
 */
export async function sincronizarLembretes(ordens, notificacoesAtivas) {
  // Se o usuário desativou notificações, cancela tudo e sai
  if (!notificacoesAtivas) {
    await cancelarTodosLembretes();
    return;
  }

  // Verifica permissão sem pedir ao usuário novamente
  const { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') return;

  await garantirCanal();

  const mapa = await lerMapa();            // { [osId]: notificationId }
  const agora = Date.now();
  const novoMapa = {};

  // IDs de OS que ainda estão na agenda (para cancelar as que saíram)
  const idsNaAgenda = new Set(ordens.map((o) => String(o.id)));

  // Cancela lembretes de OS que já não estão na agenda
  for (const [osId, notifId] of Object.entries(mapa)) {
    if (!idsNaAgenda.has(osId)) {
      await Notifications.cancelScheduledNotificationAsync(notifId).catch(() => {});
    }
  }

  // Agenda (ou mantém) lembrete para cada OS com horário definido
  for (const os of ordens) {
    if (!os.agendado_para) continue;

    const momento = new Date(os.agendado_para).getTime();
    const disparo = momento - ANTECEDENCIA_MS;

    // Descarta se já passou ou está muito próximo
    if (disparo - agora < MARGEM_MINIMA_MS) {
      // Cancela o eventual lembrete antigo
      if (mapa[os.id]) {
        await Notifications.cancelScheduledNotificationAsync(mapa[os.id]).catch(() => {});
      }
      continue;
    }

    // Se já existe um lembrete para essa OS, verifica se o horário mudou
    if (mapa[os.id]) {
      const agendadas = await Notifications.getAllScheduledNotificationsAsync();
      const existente = agendadas.find((n) => n.identifier === mapa[os.id]);

      if (existente) {
        // Calcula o trigger atual (segundos UNIX)
        const triggerAtual = existente.trigger?.value ?? existente.trigger?.seconds;
        const disparoAtualMs = triggerAtual
          ? Number(triggerAtual) * 1000        // date trigger retorna ms
          : 0;

        // Se o horário não mudou, reutiliza o lembrete existente
        if (Math.abs(disparoAtualMs - disparo) < 60_000) {
          novoMapa[os.id] = mapa[os.id];
          continue;
        }

        // Horário mudou — cancela o antigo e reagenda
        await Notifications.cancelScheduledNotificationAsync(mapa[os.id]).catch(() => {});
      }
    }

    // Agenda novo lembrete
    try {
      const horaFormatada = new Date(os.agendado_para).toLocaleTimeString('pt-BR', {
        hour: '2-digit', minute: '2-digit',
      });
      const notifId = await Notifications.scheduleNotificationAsync({
        content: {
          title: `Visita em 30 min — ${os.tipo_servico.replaceAll('_', ' ')}`,
          body: `${os.cliente_nome} · ${horaFormatada}${os.endereco ? `\n${os.endereco}` : ''}`,
          sound: true,
          data: { os_id: os.id },
          // Android: usa o canal configurado acima
          channelId: 'atendimentos',
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: new Date(disparo),
        },
      });
      novoMapa[os.id] = notifId;
    } catch {
      // Falha silenciosa — não deve impedir o carregamento da agenda
    }
  }

  await salvarMapa(novoMapa);
}

/**
 * Cancela todos os lembretes de O.S. e limpa o mapa persistido.
 * Chamado ao fazer logout ou quando o usuário desativa notificações.
 */
export async function cancelarTodosLembretes() {
  const mapa = await lerMapa();
  await Promise.all(
    Object.values(mapa).map((id) =>
      Notifications.cancelScheduledNotificationAsync(id).catch(() => {}),
    ),
  );
  await AsyncStorage.removeItem(STORAGE_KEY);
}
