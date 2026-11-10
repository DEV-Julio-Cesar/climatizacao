import { defineConfig, normalizePath } from 'vite';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const root = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(root, '..');
const mobileRequire = createRequire(path.join(repo, 'mobile/package.json'));
const babel = mobileRequire('@babel/core');
const harness = path.join(root, 'e2e-mobile');

export default defineConfig({
  root: harness, base: '/homologacao-mobile/',
  build: { outDir: path.join(root, 'e2e-mobile-dist'), emptyOutDir: true },
  resolve: { alias: {
    react: path.join(root,'node_modules/react'), 'react-dom': path.join(root,'node_modules/react-dom'),
    'react-native': path.join(harness,'react-native.js'),
    'react-native-web': path.join(repo,'mobile/node_modules/react-native-web/dist/index.js'),
  } },
  plugins: [{ name: 'componentes-mobile-homologacao', enforce: 'pre',
    resolveId(source, importer) {
      const arquivo = importer?.replaceAll('\\','/') || '';
      if(source==='@react-navigation/native'||source==='expo-crypto')return normalizePath(path.join(harness,'platform.js'));
      if(arquivo.endsWith('/mobile/src/screens/Perfil/Privacidade.js') && source==='../../styles/useScreenStyles')return normalizePath(path.join(harness,'platform.js'));
      if((arquivo.endsWith('/mobile/src/screens/Perfil/Privacidade.js')&&source==='../../services/api') || (arquivo.endsWith('/mobile/src/services/privacidade.js')&&source==='./api'))return normalizePath(path.join(harness,'api.js'));
    },
    transform(code,id) {
      // O harness é uma SPA cliente; não há React Server Components aqui.
      if(id.replaceAll('\\','/').includes('/react-native-web/dist/'))return {code:code.replace(/^['"]use client['"];?\s*$/gm,''),map:null};
      if(id.replaceAll('\\','/').endsWith('/mobile/src/screens/Perfil/Privacidade.js'))return {code:babel.transformSync(code,{filename:id,babelrc:false,configFile:false,plugins:[mobileRequire.resolve('@babel/plugin-transform-react-jsx')]}).code,map:null};
    },
  }],
});
