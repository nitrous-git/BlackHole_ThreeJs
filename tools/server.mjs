// Optional zero-dependency server. WebStorm's built-in server also works.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const port=Number(process.env.PORT||8080);
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.md':'text/plain'};
http.createServer(async(req,res)=>{
    try {
        const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
        const path=resolve(root,'.'+(pathname.endsWith('/')?pathname+'index.html':pathname));
        if (path!==root && !path.startsWith(root+sep)) { res.writeHead(403);res.end('Forbidden');return; }
        const data=await readFile(path);
        res.writeHead(200,{'Content-Type':`${types[extname(path)]||'application/octet-stream'}; charset=utf-8`,'Cache-Control':'no-store'});
        res.end(data);
    } catch { res.writeHead(404);res.end('Not found'); }
}).listen(port,'127.0.0.1',()=>console.log(`BlackHole_ThreeJs: http://localhost:${port}`));
