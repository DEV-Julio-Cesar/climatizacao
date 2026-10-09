import React, { useState, useEffect } from 'react';
import { Calendar, momentLocalizer } from 'react-big-calendar';
import withDragAndDrop from 'react-big-calendar/lib/addons/dragAndDrop';
import moment from 'moment';
import 'moment/locale/pt-br';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import 'react-big-calendar/lib/addons/dragAndDrop/styles.css';

import { api } from '../../services/api'; // Sua configuração do Axios

moment.locale('pt-br');
const localizer = momentLocalizer(moment);
const DragAndDropCalendar = withDragAndDrop(Calendar);

export default function PainelDespacho() {
  const [eventos, setEventos] = useState([]);
  const [tecnicos, setTecnicos] = useState([]);

  useEffect(() => {
    carregarDados();
  }, []);

  const carregarDados = async () => {
    try {
      // 1. Busca a lista de técnicos ativos da empresa
      const resTecnicos = await api.get('/tecnicos');
      
      // 2. Busca todas as O.S. agendadas para formatar no padrão do Calendário
      const resOs = await api.get('/os/todas');
      
      const osFormatadas = resOs.data.filter(os => os.agendado_para).map(os => ({
        id: os.id,
        title: `O.S. #${os.id} - ${os.cliente_nome} (${os.tipo_servico})`,
        start: new Date(os.agendado_para),
        end: moment(os.agendado_para).add(2, 'hours').toDate(), // Estimativa de 2h por serviço
        resourceId: os.tecnico_id, // Vincula a O.S. à coluna do técnico
        status: os.status
      }));

      setTecnicos(resTecnicos.data);
      setEventos(osFormatadas);
    } catch (error) {
      console.error('Falha ao carregar painel', error);
    }
  };

  // 3. A Função Mágica: Ocorre quando o gestor solta o bloco em outro lugar
  const onEventDrop = async ({ event, start, end, resourceId }) => {
    const tecnicoDestino = resourceId;
    const novoHorario = start;

    try {
      // A. Atualiza o banco de dados via API (Node.js)
      await api.patch(`/os/${event.id}/reagendar`, {
        tecnico_id: tecnicoDestino,
        agendado_para: novoHorario
      });

      // B. Atualiza a interface instantaneamente (Optimistic UI Update)
      const eventosAtualizados = eventos.map(ev => 
        ev.id === event.id 
          ? { ...ev, start, end, resourceId: tecnicoDestino } 
          : ev
      );
      setEventos(eventosAtualizados);

      // (Futuro: Disparar notificação push para o app mobile do técnico avisando da nova O.S.)
    } catch (error) {
      alert('Erro ao reagendar O.S. Verifique a conexão.');
    }
  };

  // 4. Customização visual: Cores diferentes baseadas no status
  const eventStyleGetter = (event) => {
    let backgroundColor = '#3174ad'; // Azul Padrão (Agendada)
    if (event.status === 'EM_ANDAMENTO') backgroundColor = '#f0ad4e'; // Amarelo
    if (event.status === 'FINALIZADA') backgroundColor = '#5cb85c'; // Verde

    return { style: { backgroundColor, borderRadius: '5px', color: '#fff', border: 'none' } };
  };

  return (
    <div style={{ height: '90vh', padding: '20px' }}>
      <h2>Painel de Despacho (Controle de Frota)</h2>
      
      <DragAndDropCalendar
        localizer={localizer}
        events={eventos}
        onEventDrop={onEventDrop}
        resizable={false}
        defaultView="day"
        views={['day', 'week', 'month']}
        step={30}
        timeslots={2}
        min={new Date(2026, 0, 1, 7, 0)} // Começa o dia às 07:00
        max={new Date(2026, 0, 1, 19, 0)} // Termina às 19:00
        
        // A Mágica do "Multi-Técnico": Cria colunas, uma para cada técnico
        resources={tecnicos}
        resourceIdAccessor="id"
        resourceTitleAccessor="nome"
        
        eventPropGetter={eventStyleGetter}
        messages={{
          today: 'Hoje', previous: 'Voltar', next: 'Avançar',
          month: 'Mês', week: 'Semana', day: 'Dia',
        }}
      />
    </div>
  );
}
