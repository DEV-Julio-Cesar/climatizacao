import React from "react";
import { Calendar, momentLocalizer } from "react-big-calendar";
import dragAndDropModule from "react-big-calendar/lib/addons/dragAndDrop";
import moment from "moment";
import "moment/locale/pt-br";
import "react-big-calendar/lib/css/react-big-calendar.css";
import "react-big-calendar/lib/addons/dragAndDrop/styles.css";
import { CORES_STATUS } from "./dispatchUtils";

moment.locale("pt-br");
const localizer = momentLocalizer(moment);
// O addon é publicado como CommonJS com `exports.default`. Dependendo da
// versão do Vite, o import pode chegar como função ou como { default }.
const withDragAndDrop = typeof dragAndDropModule === "function"
  ? dragAndDropModule
  : dragAndDropModule.default;
const CalendarWithDragAndDrop = withDragAndDrop(Calendar);

const mensagens = {
  today: "Hoje", previous: "Anterior", next: "Próximo",
  month: "Mês", week: "Semana", day: "Dia", agenda: "Lista",
  date: "Data", time: "Horário", event: "Atendimento",
  noEventsInRange: "Nenhum atendimento neste período.",
  showMore: quantidade => `+ ${quantidade} atendimento(s)`,
};

export default function DispatchCalendar({ eventos, tecnicos, abrirHorario, abrirDetalhe, reagendar }) {
  return (
    <section className="calendar-panel">
      <CalendarWithDragAndDrop
        localizer={localizer} culture="pt-BR" events={eventos} resources={tecnicos}
        resourceIdAccessor="id" resourceTitleAccessor="nome" startAccessor="start" endAccessor="end"
        defaultView="week" views={["day", "week", "month", "agenda"]}
        step={30} timeslots={2} selectable onSelectSlot={abrirHorario}
        onSelectEvent={abrirDetalhe} onEventDrop={reagendar}
        draggableAccessor={evento => !["FINALIZADA", "CANCELADA"].includes(evento.status)}
        resizable={false} min={new Date(1970, 0, 1, 7)} max={new Date(1970, 0, 1, 20)}
        eventPropGetter={evento => ({ style: { backgroundColor: CORES_STATUS[evento.status], border: 0, borderRadius: 7 } })}
        messages={mensagens}
      />
    </section>
  );
}
