import type { IncomingMessage, ServerResponse } from 'node:http';

export function handleHttpRequest(
  request: IncomingMessage,
  response: ServerResponse,
) {
  if (request.method === 'GET' && request.url === '/health') {
    response.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('ok');
    return;
  }

  response.writeHead(404);
  response.end();
}
