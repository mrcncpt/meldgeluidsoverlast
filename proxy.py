"""Lokale CORS-proxy voor OpenSky API — alleen voor development."""
from http.server import HTTPServer, SimpleHTTPRequestHandler
import urllib.request
import urllib.parse
import json


class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        # Proxy requests naar /api/opensky?...
        if self.path.startswith('/api/opensky?'):
            query = self.path.split('?', 1)[1]
            url = 'https://opensky-network.org/api/states/all?' + query
            try:
                req = urllib.request.Request(url)
                with urllib.request.urlopen(req, timeout=10) as resp:
                    data = resp.read()
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(data)
            except Exception as e:
                self.send_response(502)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({'error': str(e)}).encode())
            return

        # Alles anders: serveer static files
        return super().do_GET()

    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()


if __name__ == '__main__':
    port = 8080
    print(f'Dev server met OpenSky proxy op http://localhost:{port}')
    HTTPServer(('', port), Handler).serve_forever()
