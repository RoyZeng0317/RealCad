import { defineConfig } from 'vite';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function formatValue(v, vtype) {
  if (vtype === 'boolean') return v === 'true' ? 'true' : 'false';
  if (vtype === 'string') return `'${v}'`;
  const n = parseFloat(v);
  return !isNaN(n) ? String(n) : (v || '0');
}

function buildLibraryEntry({ type, name, category, description, ports = [], defaultProperties = [], size, spiceModel }) {
  let portsStr;
  if (ports.length === 0) {
    portsStr = '    ports: [],';
  } else {
    const lines = ports
      .map(p => `      { id: '${p.id}', name: '${p.name}', position: { x: ${p.x}, y: ${p.y}, z: ${p.z} }, type: '${p.type}' },`)
      .join('\n');
    portsStr = `    ports: [\n${lines}\n    ],`;
  }

  const validProps = defaultProperties.filter(p => p.key);
  const propsStr = validProps.length === 0
    ? '    defaultProperties: {},'
    : `    defaultProperties: { ${validProps.map(p => `${p.key}: ${formatValue(p.value, p.vtype)}`).join(', ')} },`;

  const spiceLine = spiceModel ? `\n    spiceModel: '${spiceModel.replace(/'/g, "\\'")}',` : '';

  return (
    `  ${type}: {\n` +
    `    type: '${type}',\n` +
    `    name: '${name}',\n` +
    `    category: '${category}',\n` +
    `    description: '${(description || '').replace(/'/g, "\\'")}',\n` +
    `${portsStr}\n` +
    `${propsStr}\n` +
    `    size: { width: ${size.width}, height: ${size.height}, depth: ${size.depth} },${spiceLine}\n` +
    `  },`
  );
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf-8');
}

function jsonResponse(res, statusCode, data) {
  if (res.headersSent) return;
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(data));
}

export default defineConfig({
  plugins: [
    {
      name: 'circuit-lab-admin-api',
      configureServer(server) {
        // Global middleware — intercept only our API route
        server.middlewares.use(async (req, res, next) => {
          if (req.url !== '/api/add-component') return next();

          if (req.method !== 'POST') {
            return jsonResponse(res, 405, { error: 'Method Not Allowed' });
          }

          try {
            const raw = await readBody(req);
            if (!raw) return jsonResponse(res, 400, { error: '請求 body 為空' });

            const data = JSON.parse(raw);
            const { type } = data;

            if (!type || !data.name || !data.category) {
              return jsonResponse(res, 400, { error: 'type、name、category 為必填欄位' });
            }
            if (!/^[a-z][a-z0-9_]*$/.test(type)) {
              return jsonResponse(res, 400, { error: 'Type ID 只能包含小寫英文、數字、底線，且不能以數字開頭' });
            }

            // ── 1. packages/shared/src/types/index.ts ──────────────
            const typesPath = path.join(ROOT, 'shared/src/types/index.ts');
            let typesContent = fs.readFileSync(typesPath, 'utf-8');

            if (typesContent.includes(`'${type}'`)) {
              return jsonResponse(res, 409, { error: `型別 '${type}' 已存在於 ComponentType` });
            }

            typesContent = typesContent.replace(
              /(export type ComponentType\s*=[\s\S]*?)(\s*;)/,
              (_, union, semi) => `${union}\n  | '${type}'${semi}`
            );
            fs.writeFileSync(typesPath, typesContent, 'utf-8');

            // ── 2. simulator-core/src/components/library.ts ─────────
            const libPath = path.join(ROOT, 'simulator/src/components/library.ts');
            let libContent = fs.readFileSync(libPath, 'utf-8');

            const entry = buildLibraryEntry(data);
            libContent = libContent.replace(/^};$/m, `${entry}\n};`);
            fs.writeFileSync(libPath, libContent, 'utf-8');

            return jsonResponse(res, 200, {
              success: true,
              message: `零件 '${type}' 已成功新增！執行 npx tsc -b 重新編譯即可使用。`,
            });
          } catch (err) {
            return jsonResponse(res, 500, { error: err.message });
          }
        });
      },
    },
  ],
});
