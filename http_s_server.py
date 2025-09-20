import http.server, ssl

server_address = ("0.0.0.0", 8006)  # 监听所有网卡
httpd = http.server.HTTPServer(server_address, http.server.SimpleHTTPRequestHandler)

# 创建 SSL 上下文
context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
context.load_cert_chain(certfile="192.168.1.92.pem", keyfile="192.168.1.92-key.pem")

# 把 socket 包装成支持 TLS 的
httpd.socket = context.wrap_socket(httpd.socket, server_side=True)
print("Serving on https://0.0.0.0:8006")
httpd.serve_forever()
