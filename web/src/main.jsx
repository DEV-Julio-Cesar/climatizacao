import React from 'react';import{createRoot}from'react-dom/client';import{QueryClient,QueryClientProvider}from'@tanstack/react-query';import'leaflet/dist/leaflet.css';import'./styles.css';import App from'./App';import ErrorBoundary from'./components/ErrorBoundary';
const queryClient=new QueryClient({defaultOptions:{queries:{staleTime:30000,retry:1,refetchOnWindowFocus:false}}});
createRoot(document.getElementById('root')).render(<React.StrictMode><ErrorBoundary><QueryClientProvider client={queryClient}><App/></QueryClientProvider></ErrorBoundary></React.StrictMode>);
