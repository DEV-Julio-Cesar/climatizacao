import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../../services/api";
import { conectarEventos } from "../../services/realtime";
import { listarOrdens } from "../../services/ordens";
import { useEffect } from "react";

export function useDispatchData() {
  const queryClient = useQueryClient();
  const [erroLocal, setErro] = useState("");
  const consulta = useQuery({
    queryKey:["despacho"],
    queryFn:async() => {
      const [tecnicosResposta, ordens, clientesResposta] = await Promise.all([
        api.get("/tecnicos"), listarOrdens(), api.get("/clientes"),
      ]);
      return { tecnicos:tecnicosResposta.data, ordens, clientes:clientesResposta.data };
    },
  });
  useEffect(() => conectarEventos(tipo => {
    if (tipo === "os") queryClient.invalidateQueries({ queryKey:["despacho"] });
  }), [queryClient]);
  const setOrdens = atualizador => queryClient.setQueryData(["despacho"], atual => atual
    ? { ...atual, ordens:typeof atualizador === "function" ? atualizador(atual.ordens) : atualizador }
    : atual);
  return {
    ordens:consulta.data?.ordens || [], tecnicos:consulta.data?.tecnicos || [], clientes:consulta.data?.clientes || [],
    loading:consulta.isLoading, erro:erroLocal || consulta.error?.response?.data?.erro || (consulta.error ? "Não foi possível carregar a agenda." : ""),
    setErro, setOrdens, carregar:async() => { setErro(""); await queryClient.invalidateQueries({ queryKey:["despacho"] }); },
  };
}
