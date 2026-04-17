import { createHocuspocus } from '../src/lib/notion/hocuspocus-server.ts';

const server = createHocuspocus();
server.listen(Number(process.env.HOCUSPOCUS_PORT ?? 1234));
console.log('Hocuspocus listening on', process.env.HOCUSPOCUS_PORT ?? 1234);
