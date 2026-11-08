#!/usr/bin/env python3
"""Servidor estático com fallback de SPA e páginas /r/<id> estáticas."""
import http.server
import os
import socketserver
import sys
import urllib.parse

RAIZ = sys.argv[1]
PORTA = int(sys.argv[2]) if len(sys.argv) > 2 else 8080


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=RAIZ, **kw)

    def do_GET(self):
        caminho = urllib.parse.urlparse(self.path).path
        disco = os.path.join(RAIZ, caminho.lstrip('/'))
        if caminho != '/' and not os.path.isfile(disco):
            if os.path.isfile(os.path.join(disco, 'index.html')):
                self.path = os.path.join(caminho, 'index.html')
            else:
                self.path = '/index.html'
        return super().do_GET()

    def log_message(self, *a):
        pass


socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(('127.0.0.1', PORTA), Handler) as srv:
    print(f'servindo {RAIZ} em http://127.0.0.1:{PORTA}')
    srv.serve_forever()
