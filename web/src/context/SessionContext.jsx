import React, { createContext, useContext } from 'react';

const SessionContext = createContext({ usuario: null, pode: () => false });
export function SessionProvider({ usuario, children }) {
  const pode = permissao => Boolean(usuario?.permissoes?.includes('*') || usuario?.permissoes?.includes(permissao));
  return <SessionContext.Provider value={{ usuario, pode }}>{children}</SessionContext.Provider>;
}
export const useSession = () => useContext(SessionContext);
