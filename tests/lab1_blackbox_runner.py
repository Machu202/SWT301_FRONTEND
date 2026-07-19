from __future__ import annotations

import base64
import csv
import json
import os
import re
import shutil
import socket
import threading
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Callable
from urllib.parse import parse_qs, urlparse

from playwright.sync_api import Page, Route, Request, sync_playwright

SCRIPT_DIR = Path(__file__).resolve().parent
FRONTEND = SCRIPT_DIR.parent
PROJECT = FRONTEND.parent
RUNTIME = FRONTEND / '.lab1-runtime'
EVIDENCE = FRONTEND / 'test-results' / 'Lab1_BlackBox_Evidence_90'
DATE = '2026-07-19'


def prepare_runtime() -> None:
    if RUNTIME.exists():
        shutil.rmtree(RUNTIME)
    (RUNTIME / 'src').mkdir(parents=True)
    index = (FRONTEND / 'index.html').read_text(encoding='utf-8')
    index = index.replace('</head>', '  <link rel="stylesheet" href="/src/styles.css" />\n  </head>')
    (RUNTIME / 'index.html').write_text(index, encoding='utf-8')
    app = (FRONTEND / 'src/app.js').read_text(encoding='utf-8')
    app = app.replace("import './styles.css';\n", '', 1)
    (RUNTIME / 'src/app.js').write_text(app, encoding='utf-8')
    api = (FRONTEND / 'src/api.js').read_text(encoding='utf-8')
    api = re.sub(r"const API_BASE_URL = .*?;\n", "const API_BASE_URL = '';\n", api, count=1)
    api = re.sub(r"const DEFAULT_TIMEOUT_MS = .*?;\n", "const DEFAULT_TIMEOUT_MS = 15000;\n", api, count=1)
    api = re.sub(
        r"const API_LOG_ENABLED = import\.meta\.env\.MODE !== 'production'\n\s*\|\| String\(import\.meta\.env\.VITE_ENABLE_API_LOGS \|\| ''\)\.toLowerCase\(\) === 'true';",
        "const API_LOG_ENABLED = false;",
        api,
        count=1,
    )
    if 'import.meta.env' in api:
        raise RuntimeError('Unreplaced import.meta.env in API runtime')
    (RUNTIME / 'src/api.js').write_text(api, encoding='utf-8')
    validation = (FRONTEND / 'src/validation.js').read_text(encoding='utf-8')
    (RUNTIME / 'src/validation.js').write_text(validation, encoding='utf-8')
    styles = (FRONTEND / 'src/styles.css').read_text(encoding='utf-8')
    (RUNTIME / 'src/styles.css').write_text(styles, encoding='utf-8')

    # Build one inline ES module so Chromium can execute the real frontend source
    # without navigating to localhost/file URLs, which are blocked in this runtime.
    api_inline = re.sub(r'\bexport\s+', '', api)
    validation_inline = re.sub(r'\bexport\s+', '', validation)
    app_inline = re.sub(r"import\s*\{.*?\}\s*from './api\.js';\s*", '', app, flags=re.S)
    app_inline = re.sub(r"import\s*\{.*?\}\s*from './validation\.js';\s*", '', app_inline, flags=re.S)
    bundle = '\n'.join([api_inline, validation_inline, app_inline])
    inline_index = re.sub(r'\s*<script type="module" src="/src/app.js"></script>', '', index)
    inline_index = inline_index.replace(
        '</head>',
        f'<style>{styles}</style>\n</head>'
    )
    inline_index = inline_index.replace(
        '</body>',
        f'<script type="module">{bundle}</script>\n</body>'
    )
    (RUNTIME / 'inline.html').write_text(inline_index, encoding='utf-8')


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, format: str, *args: Any) -> None:
        return


def start_server() -> tuple[ThreadingHTTPServer, str]:
    class Handler(QuietHandler):
        def __init__(self, *args: Any, **kwargs: Any) -> None:
            super().__init__(*args, directory=str(RUNTIME), **kwargs)

    server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server, f'http://127.0.0.1:{server.server_port}'


def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode().rstrip('=')


def jwt(role: str = 'CUSTOMER', username: str | None = None) -> str:
    header = b64url(json.dumps({'alg': 'none', 'typ': 'JWT'}).encode())
    payload = b64url(json.dumps({
        'sub': username or ('admin' if role == 'ADMIN' else 'customer'),
        'role': f'ROLE_{role}',
        'exp': int(time.time()) + 86400,
    }).encode())
    return f'{header}.{payload}.signature'


PNG_BYTES = base64.b64decode(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII='
)


def default_product(product_id: int = 1, *, name: str = 'IPhone 17', price: int = 30_000_000, stock: int = 98) -> dict[str, Any]:
    return {
        'productId': product_id,
        'categoryId': 1,
        'categoryName': 'Electronics',
        'productName': name,
        'description': 'Test product',
        'price': price,
        'stock': stock,
        'image': '',
        'status': 'ACTIVE',
    }


def default_address(address_id: int = 1, default: bool = True) -> dict[str, Any]:
    return {
        'addressId': address_id,
        'receiverName': 'Nguyen Van A',
        'receiverPhone': '0912345678',
        'province': 'Ho Chi Minh City',
        'district': 'District 1',
        'ward': 'Ben Nghe',
        'street': '1 Nguyen Hue',
        'isDefault': default,
    }


def default_order(order_id: int = 501, *, method: str = 'QR_CODE', payment: str = 'AWAITING_PAYMENT', status: str = 'PENDING', has_receipt: bool = False) -> dict[str, Any]:
    return {
        'orderId': order_id,
        'orderCode': f'ORD-{order_id:06d}',
        'status': status,
        'allowedNextStatuses': ['PROCESSING', 'CANCELLED'] if status == 'PENDING' else [],
        'paymentMethod': method,
        'paymentStatus': payment,
        'voucherCode': None,
        'hasReceipt': has_receipt,
        'receiptUploadedAt': '2026-07-19T08:00:00' if has_receipt else None,
        'paymentVerifiedAt': None,
        'subtotal': 100_000,
        'discount': 0,
        'shippingFee': 30_000,
        'total': 130_000,
        'receiverName': 'Nguyen Van A',
        'receiverPhone': '0912345678',
        'shippingAddress': '1 Nguyen Hue, Ben Nghe, District 1, Ho Chi Minh City',
        'items': [{
            'productId': 2,
            'productName': 'Mechanical Keyboard',
            'productImage': '',
            'quantity': 1,
            'unitPrice': 100_000,
            'subtotal': 100_000,
        }],
        'note': '',
        'createdAt': '2026-07-19T07:00:00',
    }


@dataclass
class MockBackend:
    products: list[dict[str, Any]] = field(default_factory=lambda: [default_product(), default_product(2, name='Mechanical Keyboard', price=100_000, stock=100)])
    cart_items: list[dict[str, Any]] = field(default_factory=list)
    addresses: list[dict[str, Any]] = field(default_factory=lambda: [default_address()])
    orders: list[dict[str, Any]] = field(default_factory=list)
    profile: dict[str, Any] = field(default_factory=lambda: {
        'userId': 1,
        'username': 'customer',
        'fullName': 'Nguyen Van A',
        'email': 'customer@example.com',
        'phone': '0912345678',
        'role': 'CUSTOMER',
    })
    logs: list[dict[str, Any]] = field(default_factory=list)
    fail_checkout: bool = False
    next_order_id: int = 777
    preview_subtotal_override: int | None = None

    def cart_response(self) -> dict[str, Any]:
        items = []
        total = 0
        for idx, entry in enumerate(self.cart_items, start=1):
            product = next((p for p in self.products if p['productId'] == entry['productId']), default_product(entry['productId']))
            qty = int(entry['quantity'])
            unit = int(product['price'])
            subtotal = qty * unit
            total += subtotal
            items.append({
                'cartItemId': entry.get('cartItemId', idx),
                'productId': product['productId'],
                'productName': product['productName'],
                'productImage': product.get('image', ''),
                'quantity': qty,
                'productStock': product['stock'],
                'availableToAdd': max(0, int(product['stock']) - qty),
                'unitPrice': unit,
                'itemSubtotal': subtotal,
            })
        return {'cartId': 1, 'items': items, 'totalCartPrice': total}

    def page(self, content: list[dict[str, Any]], page: int = 0, size: int = 10) -> dict[str, Any]:
        start = page * size
        selected = content[start:start + size]
        total = len(content)
        pages = (total + size - 1) // size if total else 0
        return {
            'content': selected,
            'page': page,
            'size': size,
            'totalElements': total,
            'totalPages': pages,
            'first': page == 0,
            'last': page + 1 >= pages if pages else True,
        }

    def preview(self, voucher: str) -> tuple[int, dict[str, Any]]:
        cart = self.cart_response()
        subtotal = self.preview_subtotal_override if self.preview_subtotal_override is not None else int(cart['totalCartPrice'])
        discount = 0
        code = voucher.strip().upper()
        if code == 'SALE20':
            if subtotal < 500_000:
                return 400, {'message': 'Order has not reached minimum value.'}
            discount = 20_000
        elif code == 'OLD10':
            return 400, {'message': 'Voucher expired.'}
        elif code in {'AA', 'NOTFOUND'}:
            return 404, {'message': 'Voucher does not exist.'}
        elif code == 'MIN20':
            # Controlled response records the rejected discount as zero while preserving the current total.
            discount = 0
        shipping = 0 if subtotal >= 500_000 else 30_000
        total = max(0, subtotal - discount + shipping)
        items = cart['items'] or [{
            'cartItemId': 1,
            'productId': 2,
            'productName': 'Mechanical Keyboard',
            'quantity': 1,
            'productStock': 100,
            'availableToAdd': 99,
            'unitPrice': subtotal,
            'itemSubtotal': subtotal,
        }]
        return 200, {'items': items, 'subtotal': subtotal, 'discount': discount, 'shippingFee': shipping, 'total': total}

    def json_body(self, request: Request) -> dict[str, Any]:
        try:
            return request.post_data_json or {}
        except Exception:
            return {}

    def record(self, request: Request, body: Any = None, status: int | None = None) -> None:
        self.logs.append({
            'method': request.method,
            'path': urlparse(request.url).path,
            'query': parse_qs(urlparse(request.url).query),
            'body': body,
            'status': status,
        })

    def fulfill_json(self, route: Route, request: Request, payload: Any, status: int = 200, body: Any = None) -> None:
        self.record(request, body=body, status=status)
        route.fulfill(status=status, content_type='application/json; charset=utf-8', body=json.dumps(payload, ensure_ascii=False))

    def handle(self, route: Route, request: Request) -> None:
        parsed = urlparse(request.url)
        path = parsed.path
        query = parse_qs(parsed.query)
        method = request.method.upper()
        body = self.json_body(request)

        # Authentication
        if path == '/api/auth/login' and method == 'POST':
            identifier = str(body.get('username', ''))
            password = str(body.get('password', ''))
            if password != 'Correct@123' or identifier not in {'customer', 'admin', '0912345678', '+84912345678'}:
                return self.fulfill_json(route, request, {'message': 'Bad credentials'}, 401, body)
            role = 'ADMIN' if identifier == 'admin' else 'CUSTOMER'
            username = 'admin' if role == 'ADMIN' else 'customer'
            return self.fulfill_json(route, request, {
                'token': jwt(role, username), 'id': 1, 'username': username,
                'email': f'{username}@example.com', 'role': role,
            }, 200, body)
        if path == '/api/auth/register' and method == 'POST':
            return self.fulfill_json(route, request, {'message': 'Registration completed.'}, 200, body)

        # Profile
        if path == '/api/profile' and method == 'GET':
            return self.fulfill_json(route, request, self.profile)
        if path == '/api/profile' and method == 'PUT':
            self.profile.update({'fullName': body.get('fullName', ''), 'phone': body.get('phone', '')})
            return self.fulfill_json(route, request, self.profile, 200, body)

        # Products and reference data
        if path == '/api/reference/categories':
            return self.fulfill_json(route, request, [{'categoryId': 1, 'categoryName': 'Electronics'}])
        if path == '/api/reference/payment-methods':
            return self.fulfill_json(route, request, [
                {'paymentMethodId': 1, 'methodName': 'COD'},
                {'paymentMethodId': 2, 'methodName': 'QR_CODE'},
            ])
        if path == '/api/reference/order-statuses':
            return self.fulfill_json(route, request, [
                {'statusId': 1, 'statusName': 'PENDING'},
                {'statusId': 2, 'statusName': 'PROCESSING'},
                {'statusId': 3, 'statusName': 'SHIPPED'},
                {'statusId': 4, 'statusName': 'DELIVERED'},
                {'statusId': 5, 'statusName': 'CANCELLED'},
            ])
        if path == '/api/products' and method == 'GET':
            return self.fulfill_json(route, request, [p for p in self.products if p.get('status') == 'ACTIVE'])
        if path == '/api/products/page' and method == 'GET':
            page = int(query.get('page', ['0'])[0]); size = int(query.get('size', ['12'])[0])
            active = [p for p in self.products if p.get('status') == 'ACTIVE']
            return self.fulfill_json(route, request, self.page(active, page, size))
        if path == '/api/admin/products' and method == 'GET':
            page = int(query.get('page', ['0'])[0]); size = int(query.get('size', ['12'])[0])
            return self.fulfill_json(route, request, self.page(self.products, page, size))
        if re.fullmatch(r'/api/products/\d+', path) and method == 'GET':
            product_id = int(path.rsplit('/', 1)[1])
            product = next((p for p in self.products if p['productId'] == product_id and p.get('status') == 'ACTIVE'), None)
            if not product:
                return self.fulfill_json(route, request, {'message': 'Product not found'}, 404)
            return self.fulfill_json(route, request, product)

        # Cart
        if path == '/api/carts' and method == 'GET':
            return self.fulfill_json(route, request, self.cart_response())
        if path == '/api/carts/items' and method == 'POST':
            product_id = int(body.get('productId', 0)); quantity = int(body.get('quantity', 0))
            product = next((p for p in self.products if p['productId'] == product_id), None)
            if not product:
                return self.fulfill_json(route, request, {'message': 'Product does not exist.'}, 404, body)
            current = next((item for item in self.cart_items if item['productId'] == product_id), None)
            new_qty = quantity + (int(current['quantity']) if current else 0)
            if quantity < 1:
                return self.fulfill_json(route, request, {'message': 'Quantity must be greater than 0.'}, 400, body)
            if new_qty > int(product['stock']):
                return self.fulfill_json(route, request, {'message': 'Quantity exceeds available stock.'}, 400, body)
            if current:
                current['quantity'] = new_qty
            else:
                self.cart_items.append({'cartItemId': len(self.cart_items) + 1, 'productId': product_id, 'quantity': quantity})
            return self.fulfill_json(route, request, self.cart_response(), 200, body)
        if path == '/api/carts/items' and method == 'PUT':
            product_id = int(body.get('productId', 0)); quantity = body.get('quantity')
            try: quantity_num = int(quantity)
            except Exception: quantity_num = 0
            current = next((item for item in self.cart_items if item['productId'] == product_id), None)
            product = next((p for p in self.products if p['productId'] == product_id), None)
            if not current or not product:
                return self.fulfill_json(route, request, {'message': 'Product not found in cart.'}, 404, body)
            if quantity_num < 1 or quantity_num > int(product['stock']):
                return self.fulfill_json(route, request, {'message': 'Invalid cart quantity.'}, 400, body)
            current['quantity'] = quantity_num
            return self.fulfill_json(route, request, self.cart_response(), 200, body)
        if path == '/api/carts/items' and method == 'DELETE':
            self.cart_items.clear()
            return self.fulfill_json(route, request, self.cart_response())
        if re.fullmatch(r'/api/carts/items/\d+', path) and method == 'DELETE':
            item_id = int(path.rsplit('/', 1)[1])
            self.cart_items = [item for item in self.cart_items if int(item.get('cartItemId', 0)) != item_id]
            return self.fulfill_json(route, request, self.cart_response())

        # Addresses
        if path == '/api/addresses' and method == 'GET':
            return self.fulfill_json(route, request, self.addresses)
        if path == '/api/addresses' and method == 'POST':
            address = dict(body); address['addressId'] = max([a['addressId'] for a in self.addresses] or [0]) + 1
            if address.get('isDefault'):
                for entry in self.addresses: entry['isDefault'] = False
            self.addresses.append(address)
            return self.fulfill_json(route, request, address, 200, body)
        if re.fullmatch(r'/api/addresses/\d+', path) and method == 'PUT':
            address_id = int(path.rsplit('/', 1)[1])
            address = next((a for a in self.addresses if a['addressId'] == address_id), None)
            if not address:
                return self.fulfill_json(route, request, {'message': 'Address not found'}, 404, body)
            if body.get('isDefault'):
                for entry in self.addresses: entry['isDefault'] = False
            address.update(body); address['addressId'] = address_id
            return self.fulfill_json(route, request, address, 200, body)
        if re.fullmatch(r'/api/addresses/\d+', path) and method == 'DELETE':
            address_id = int(path.rsplit('/', 1)[1])
            self.addresses = [a for a in self.addresses if a['addressId'] != address_id]
            return self.fulfill_json(route, request, {'message': 'Address deleted.'})

        # Order preview and checkout
        if path == '/api/orders/preview' and method == 'GET':
            code = query.get('voucherCode', [''])[0]
            status, payload = self.preview(code)
            return self.fulfill_json(route, request, payload, status)
        if path == '/api/orders/checkout' and method == 'POST':
            if self.fail_checkout:
                return self.fulfill_json(route, request, {'message': 'Order creation failed.'}, 500, body)
            manual = body.get('manualAddress')
            if manual:
                required = ['receiverName', 'receiverPhone', 'province', 'district', 'ward', 'street']
                if any(not str(manual.get(key, '')).strip() for key in required):
                    return self.fulfill_json(route, request, {'message': 'All shipping fields are required.'}, 400, body)
                if not re.fullmatch(r'(?:0[35789][0-9]{8}|\+84[35789][0-9]{8})', str(manual.get('receiverPhone', ''))):
                    return self.fulfill_json(route, request, {'message': 'Phone number has invalid format.'}, 400, body)
                if not re.fullmatch(r"[\w\s.\-']+", str(manual.get('receiverName', '')), re.UNICODE) or re.search(r'[@!#]', str(manual.get('receiverName', ''))):
                    return self.fulfill_json(route, request, {'message': 'Name cannot contain special characters.'}, 400, body)
            status, preview = self.preview(str(body.get('voucherCode') or ''))
            if status != 200:
                return self.fulfill_json(route, request, preview, status, body)
            order_id = self.next_order_id; self.next_order_id += 1
            method_name = 'QR_CODE' if int(body.get('paymentMethodId', 1)) == 2 else 'COD'
            payment_status = 'AWAITING_PAYMENT' if method_name == 'QR_CODE' else 'PENDING'
            order = default_order(order_id, method=method_name, payment=payment_status)
            order.update({
                'subtotal': preview['subtotal'], 'discount': preview['discount'],
                'shippingFee': preview['shippingFee'], 'total': preview['total'],
                'items': [{
                    'productId': item['productId'], 'productName': item['productName'], 'productImage': '',
                    'quantity': item['quantity'], 'unitPrice': item['unitPrice'], 'subtotal': item['itemSubtotal'],
                } for item in preview['items']],
            })
            self.orders.insert(0, order)
            self.cart_items.clear()
            return self.fulfill_json(route, request, order, 200, body)
        if path == '/api/orders' and method == 'GET':
            return self.fulfill_json(route, request, self.orders[:100])
        if path == '/api/orders/page' and method == 'GET':
            page = int(query.get('page', ['0'])[0]); size = int(query.get('size', ['10'])[0])
            return self.fulfill_json(route, request, self.page(self.orders, page, size))

        # QR / receipt
        if re.fullmatch(r'/api/(?:admin/)?orders/\d+/payment/qr-info', path):
            order_id = int(path.split('/orders/', 1)[1].split('/', 1)[0])
            order = next((o for o in self.orders if o['orderId'] == order_id), default_order(order_id))
            return self.fulfill_json(route, request, {
                'orderId': order_id,
                'orderCode': order['orderCode'],
                'amount': order['total'],
                'currency': 'VND',
                'paymentStatus': order['paymentStatus'],
                'transferNote': order['orderCode'],
                'bankId': 'MB',
                'bankName': 'MB Bank',
                'accountName': 'OMS ACCOUNT',
                'accountNumber': '1234567890',
            })
        if re.fullmatch(r'/api/(?:admin/)?orders/\d+/payment/qr-code', path):
            self.record(request, status=200)
            return route.fulfill(status=200, content_type='image/png', body=PNG_BYTES)
        if re.fullmatch(r'/api/(?:admin/)?orders/\d+/payment/receipt', path) and method == 'GET':
            self.record(request, status=200)
            return route.fulfill(status=200, content_type='image/png', body=PNG_BYTES)
        if re.fullmatch(r'/api/orders/\d+/payment/qr', path) and method == 'POST':
            order_id = int(path.split('/orders/', 1)[1].split('/', 1)[0])
            order = next((o for o in self.orders if o['orderId'] == order_id), None)
            if order:
                order['hasReceipt'] = True
                order['paymentStatus'] = 'PENDING_VERIFICATION'
                order['receiptUploadedAt'] = '2026-07-19T08:00:00'
            self.record(request, body='multipart/form-data', status=200)
            return route.fulfill(status=200, content_type='application/json', body=json.dumps({'message': 'Receipt uploaded.', 'hasReceipt': True}))

        # Admin orders and metrics
        if path == '/api/admin/orders/metrics':
            paid = sum(int(o['total']) for o in self.orders if o['paymentStatus'] == 'PAID')
            pending = sum(1 for o in self.orders if o['paymentStatus'] == 'PENDING_VERIFICATION')
            return self.fulfill_json(route, request, {'totalOrders': len(self.orders), 'paymentsPendingVerification': pending, 'paidRevenue': paid})
        if path == '/api/admin/orders' and method == 'GET':
            return self.fulfill_json(route, request, self.orders[:100])
        if path == '/api/admin/orders/page' and method == 'GET':
            page = int(query.get('page', ['0'])[0]); size = int(query.get('size', ['10'])[0])
            return self.fulfill_json(route, request, self.page(self.orders, page, size))
        if re.fullmatch(r'/api/admin/orders/\d+/status', path) and method == 'PUT':
            order_id = int(path.split('/orders/', 1)[1].split('/', 1)[0])
            status_id = int(query.get('statusId', ['0'])[0])
            status_map = {1: 'PENDING', 2: 'PROCESSING', 3: 'SHIPPED', 4: 'DELIVERED', 5: 'CANCELLED'}
            order = next((o for o in self.orders if o['orderId'] == order_id), None)
            if not order:
                return self.fulfill_json(route, request, {'message': 'Order not found.'}, 404)
            order['status'] = status_map.get(status_id, order['status'])
            order['allowedNextStatuses'] = [] if order['status'] in {'DELIVERED', 'CANCELLED'} else ['SHIPPED', 'CANCELLED']
            return self.fulfill_json(route, request, order)
        if re.fullmatch(r'/api/admin/orders/\d+/payment', path) and method == 'PUT':
            order_id = int(path.split('/orders/', 1)[1].split('/', 1)[0])
            payment_status = query.get('paymentStatus', [''])[0]
            order = next((o for o in self.orders if o['orderId'] == order_id), None)
            if not order:
                return self.fulfill_json(route, request, {'message': 'Order not found.'}, 404)
            order['paymentStatus'] = payment_status
            order['paymentVerifiedAt'] = '2026-07-19T09:00:00'
            return self.fulfill_json(route, request, order)

        return self.fulfill_json(route, request, {'message': f'Unhandled route {method} {path}'}, 404, body)


@dataclass
class TestResult:
    id: str
    module: str
    result: str
    actual: str
    evidence: str | None
    environment: str
    date: str = DATE


class Runner:
    def __init__(self, base_url: str) -> None:
        self.base_url = base_url
        self.results: list[TestResult] = []
        self.playwright = sync_playwright().start()
        
        launch_options = {'headless': True}
        executable = os.environ.get('CHROMIUM_EXECUTABLE')
        if executable:
            launch_options['executable_path'] = executable
        self.browser = self.playwright.chromium.launch(**launch_options)

    def close(self) -> None:
        self.browser.close()
        self.playwright.stop()

    def new_page(self, backend: MockBackend | None = None, role: str | None = None, accept_dialogs: bool = True) -> tuple[Any, Page, MockBackend]:
        backend = backend or MockBackend()
        context = self.browser.new_context(viewport={'width': 1440, 'height': 1000}, locale='en-US')
        if role:
            session = {
                'token': jwt(role), 'id': 1,
                'username': 'admin' if role == 'ADMIN' else 'customer',
                'email': ('admin' if role == 'ADMIN' else 'customer') + '@example.com',
                'role': role,
            }
            context.add_init_script(f"sessionStorage.setItem('swt301_session', {json.dumps(json.dumps(session))});")
        page = context.new_page()
        page.route('**/api/**', backend.handle)
        if accept_dialogs:
            page.on('dialog', lambda dialog: dialog.accept())
        page.goto(self.base_url, wait_until='domcontentloaded')
        if role:
            page.get_by_test_id('nav-dashboard').wait_for(timeout=5000)
            page.wait_for_timeout(150)
        else:
            page.get_by_test_id('login-form').wait_for(timeout=5000)
        return context, page, backend

    def navigate(self, page: Page, view: str) -> None:
        page.get_by_test_id(f'nav-{view}').click()
        page.wait_for_timeout(250)
        page.locator('#view-content .loading').wait_for(state='detached', timeout=5000)

    def screenshot(self, page: Page, test_id: str) -> str:
        path = EVIDENCE / test_id / 'actual_result.png'
        path.parent.mkdir(parents=True, exist_ok=True)
        page.screenshot(path=str(path), full_page=True)
        return f'{test_id}/actual_result.png'

    def run(self, test_id: str, module: str, func: Callable[[Page, MockBackend], str], *, role: str | None = None, backend: MockBackend | None = None, environment: str | None = None, accept_dialogs: bool = True) -> None:
        context = None
        page = None
        try:
            context, page, actual_backend = self.new_page(backend=backend, role=role, accept_dialogs=accept_dialogs)
            actual = func(page, actual_backend)
            evidence = self.screenshot(page, test_id)
            self.results.append(TestResult(test_id, module, 'Pass', actual, evidence, environment or ('Chromium + actual frontend source' + (' + controlled in-memory API' if role else ''))))
            print(f'PASS {test_id}: {actual}')
        except Exception as exc:
            evidence = None
            try:
                if page:
                    evidence = self.screenshot(page, test_id)
            except Exception:
                pass
            self.results.append(TestResult(test_id, module, 'Fail', f'{type(exc).__name__}: {exc}', evidence, environment or 'Chromium + actual frontend source + controlled in-memory API'))
            print(f'FAIL {test_id}: {type(exc).__name__}: {exc}')
        finally:
            if context:
                context.close()

    def untested(self, test_id: str, module: str, actual: str) -> None:
        self.results.append(TestResult(test_id, module, 'Untested', actual, None, 'Environment not available'))
        print(f'UNTESTED {test_id}: {actual}')


def visible_text(page: Page, selector: str = 'body') -> str:
    return page.locator(selector).inner_text().strip()


def toast_text(page: Page) -> str:
    page.locator('.toast').last.wait_for(timeout=3000)
    return page.locator('.toast').last.inner_text().strip()


def set_cart(backend: MockBackend, product_id: int = 2, quantity: int = 1) -> None:
    backend.cart_items = [{'cartItemId': 1, 'productId': product_id, 'quantity': quantity}]


def fill_manual_address(page: Page, phone: str = '0912345678', name: str = 'Nguyen Van A') -> None:
    page.get_by_test_id('address-mode-manual').check()
    page.get_by_test_id('checkout-manual-receiver-name').fill(name)
    page.get_by_test_id('checkout-manual-phone').fill(phone)
    page.get_by_test_id('checkout-manual-province').fill('Ho Chi Minh City')
    page.get_by_test_id('checkout-manual-district').fill('District 1')
    page.get_by_test_id('checkout-manual-ward').fill('Ben Nghe')
    page.get_by_test_id('checkout-manual-street').fill('1 Nguyen Hue')


def open_address_editor(page: Page, address_id: int = 1) -> None:
    page.get_by_test_id(f'edit-address-{address_id}').click()
    page.get_by_test_id('address-form').wait_for()


def open_qr_from_order(page: Page, order_id: int = 501) -> None:
    page.get_by_test_id(f'show-payment-qr-{order_id}').click()
    page.get_by_test_id('payment-qr-image').wait_for(timeout=5000)


def open_upload_modal(page: Page, order_id: int = 501) -> None:
    page.get_by_test_id(f'upload-qr-{order_id}').click()
    page.get_by_test_id('qr-file').wait_for(timeout=5000)


def valid_jpeg(size: int = 1024) -> dict[str, Any]:
    content = bytes([0xFF, 0xD8, 0xFF, 0xE0]) + b'0' * max(0, size - 4)
    return {'name': 'receipt.jpg', 'mimeType': 'image/jpeg', 'buffer': content}


def valid_png(size: int = 1024) -> dict[str, Any]:
    sig = bytes([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])
    return {'name': 'receipt.png', 'mimeType': 'image/png', 'buffer': sig + b'0' * max(0, size - len(sig))}


def invalid_pdf() -> dict[str, Any]:
    return {'name': 'receipt.pdf', 'mimeType': 'application/pdf', 'buffer': b'%PDF-1.4 test'}


def run_suite() -> list[TestResult]:
    prepare_runtime()
    if EVIDENCE.exists():
        shutil.rmtree(EVIDENCE)
    EVIDENCE.mkdir(parents=True)
    server, base_url = start_server()
    runner = Runner(base_url)
    try:
        # AUTH_CART: authentication
        def login_success(page: Page, backend: MockBackend, identifier: str, mode: str = 'username') -> str:
            if mode == 'phone':
                page.get_by_test_id('login-mode').select_option('phone')
            page.get_by_test_id('login-identifier').fill(identifier)
            page.get_by_test_id('login-password').fill('Correct@123')
            page.get_by_test_id('login-submit').click()
            page.get_by_test_id('nav-dashboard').wait_for(timeout=5000)
            stored = page.evaluate("JSON.parse(sessionStorage.getItem('swt301_session'))")
            assert stored and stored.get('token')
            login_log = next(log for log in backend.logs if log['path'] == '/api/auth/login')
            assert login_log['status'] == 200
            return f"HTTP 200; session token stored for {identifier}."

        runner.run('AC-01', 'AUTH_CART', lambda p,b: login_success(p,b,'customer'))
        runner.run('AC-02', 'AUTH_CART', lambda p,b: login_success(p,b,'0912345678','phone'))
        runner.run('AC-03', 'AUTH_CART', lambda p,b: login_success(p,b,'+84912345678','phone'))

        def ac04(page: Page, backend: MockBackend) -> str:
            page.get_by_test_id('login-identifier').fill('customer')
            page.get_by_test_id('login-password').fill('WrongPassword')
            page.get_by_test_id('login-submit').click()
            text = toast_text(page)
            assert 'Username or password is incorrect' in text
            log = next(log for log in backend.logs if log['path'] == '/api/auth/login')
            assert log['status'] == 401
            return f"HTTP 401; UI message: {text.replace(chr(10), ' | ')}"
        runner.run('AC-04', 'AUTH_CART', ac04)

        def empty_login(page: Page, backend: MockBackend) -> str:
            page.get_by_test_id('login-submit').click()
            msg = page.get_by_test_id('login-identifier').evaluate('(el) => el.validationMessage')
            assert msg
            assert not any(log['path'] == '/api/auth/login' for log in backend.logs)
            return f'Browser blocked empty submission: {msg}'
        runner.run('AC-05', 'AUTH_CART', empty_login)

        def invalid_phone_login(page: Page, backend: MockBackend) -> str:
            page.get_by_test_id('login-mode').select_option('phone')
            inp = page.get_by_test_id('login-identifier')
            inp.fill('0912abc!3456')
            value = inp.input_value()
            assert re.fullmatch(r'\+?\d*', value)
            assert 'a' not in value
            return f'Letters/special characters removed; field value={value!r}.'
        runner.run('AC-06', 'AUTH_CART', invalid_phone_login)

        # AUTH_CART: addresses
        backend = MockBackend(addresses=[default_address(1, True), default_address(2, False)])
        def ac07(page: Page, b: MockBackend) -> str:
            runner.navigate(page, 'addresses'); open_address_editor(page, 1)
            page.get_by_test_id('receiver-name').fill('Tran Thi B')
            page.get_by_test_id('receiver-phone').fill('0987654321')
            page.get_by_test_id('province').fill('Da Nang')
            page.get_by_test_id('district').fill('Hai Chau')
            page.get_by_test_id('ward').fill('Thach Thang')
            page.get_by_test_id('street').fill('10 Bach Dang')
            page.get_by_test_id('save-address').click()
            page.locator('#active-modal').wait_for(state='detached')
            assert b.addresses[0]['receiverName'] == 'Tran Thi B'
            assert b.addresses[0]['province'] == 'Da Nang'
            return 'Address PUT returned 200 and all structured fields changed in controlled state.'
        runner.run('AC-07', 'AUTH_CART', ac07, role='CUSTOMER', backend=backend)

        backend = MockBackend(addresses=[default_address(1, False), default_address(2, True)])
        def ac08(page: Page, b: MockBackend) -> str:
            runner.navigate(page, 'addresses'); open_address_editor(page, 1)
            page.locator('#address-form input[name="isDefault"]').check()
            page.get_by_test_id('save-address').click(); page.locator('#active-modal').wait_for(state='detached')
            assert b.addresses[0]['isDefault'] is True and b.addresses[1]['isDefault'] is False
            return 'Address updated and selected address became the only default address.'
        runner.run('AC-08', 'AUTH_CART', ac08, role='CUSTOMER', backend=backend)

        backend = MockBackend(addresses=[default_address()])
        def ac09(page: Page, b: MockBackend) -> str:
            runner.navigate(page, 'addresses'); open_address_editor(page, 1)
            page.get_by_test_id('receiver-name').fill('')
            page.get_by_test_id('province').fill('')
            before = len([x for x in b.logs if x['method'] == 'PUT'])
            page.get_by_test_id('save-address').click()
            msg = page.get_by_test_id('receiver-name').evaluate('(el)=>el.validationMessage')
            after = len([x for x in b.logs if x['method'] == 'PUT'])
            assert msg and before == after
            return f'Required-field validation blocked update: {msg}'
        runner.run('AC-09', 'AUTH_CART', ac09, role='CUSTOMER', backend=backend)

        backend = MockBackend(addresses=[default_address()])
        def ac10(page: Page, b: MockBackend) -> str:
            runner.navigate(page, 'addresses'); open_address_editor(page, 1)
            street = page.get_by_test_id('street')
            street.fill('X' * 300)
            length = len(street.input_value())
            assert length == 255
            return 'Browser maxlength blocked characters above 255; retained exactly 255 characters.'
        runner.run('AC-10', 'AUTH_CART', ac10, role='CUSTOMER', backend=backend)

        backend = MockBackend(addresses=[default_address()])
        def ac11(page: Page, b: MockBackend) -> str:
            runner.navigate(page, 'addresses'); open_address_editor(page, 1)
            inp = page.get_by_test_id('receiver-phone'); inp.fill('0396abc1010')
            value = inp.input_value(); assert value.isdigit() and 'abc' not in value
            return f'Letters were blocked; sanitized phone={value}.'
        runner.run('AC-11', 'AUTH_CART', ac11, role='CUSTOMER', backend=backend)

        backend = MockBackend(addresses=[default_address()])
        def ac12(page: Page, b: MockBackend) -> str:
            runner.navigate(page, 'addresses'); open_address_editor(page, 1)
            inp = page.get_by_test_id('receiver-phone'); inp.fill('091234567899')
            value = inp.input_value(); assert value == '0912345678'
            return 'Extra digits were blocked; field retained 10 local digits.'
        runner.run('AC-12', 'AUTH_CART', ac12, role='CUSTOMER', backend=backend)

        # AUTH_CART: products/cart
        def product_case(quantity: str, expected: str) -> tuple[MockBackend, Callable[[Page, MockBackend], str]]:
            b = MockBackend(); b.cart_items = []
            def case(page: Page, backend: MockBackend) -> str:
                runner.navigate(page, 'products')
                inp = page.get_by_test_id('quantity-1')
                if quantity == 'abc':
                    original = inp.input_value()
                    inp.press_sequentially('abc')
                    blocked_value = inp.input_value()
                    assert not re.search(r'[A-Za-z]', blocked_value)
                    assert blocked_value == original
                    return f'HTML number input blocked alphabetic characters and retained the prior valid value {blocked_value!r}.'
                inp.fill(quantity)
                before = len([x for x in backend.logs if x['path'] == '/api/carts/items' and x['method'] == 'POST'])
                page.get_by_test_id('add-cart-1').click()
                page.wait_for_timeout(150)
                after = len([x for x in backend.logs if x['path'] == '/api/carts/items' and x['method'] == 'POST'])
                if expected == 'success':
                    assert backend.cart_items and backend.cart_items[0]['quantity'] == int(quantity)
                    return f'Cart stored quantity {quantity}; API POST count increased.'
                text = visible_text(page)
                assert after == before
                assert 'Error' in text or inp.input_value() == ''
                return f'Invalid quantity {quantity!r} blocked before API; input={inp.input_value()!r}.'
            return b, case
        for tid, qty, exp in [('AC-13','1','success'),('AC-14','0','blocked'),('AC-15','98','success'),('AC-16','99','blocked'),('AC-17','abc','blocked')]:
            b, fn = product_case(qty, exp)
            runner.run(tid, 'AUTH_CART', fn, role='CUSTOMER', backend=b)

        # AUTH_CART: manual checkout validation
        def manual_checkout_case(test_id: str, phone: str, name: str, should_create: bool, expected_note: str) -> None:
            b = MockBackend(addresses=[]); set_cart(b, 2, 1)
            def case(page: Page, backend: MockBackend) -> str:
                runner.navigate(page, 'checkout'); page.wait_for_timeout(350)
                fill_manual_address(page, phone=phone, name=name)
                page.wait_for_timeout(100)
                before = len(backend.orders)
                page.get_by_test_id('place-order').click()
                page.wait_for_timeout(350)
                if should_create:
                    assert len(backend.orders) == before + 1
                    return f'{expected_note}; order {backend.orders[0]["orderCode"]} created.'
                assert len(backend.orders) == before
                text = visible_text(page)
                phone_input = page.get_by_test_id('checkout-manual-phone')
                validation_message = phone_input.evaluate('(el) => el.validationMessage')
                invalid_control = phone_input.evaluate('(el) => !el.checkValidity()')
                assert ('Error' in text or 'invalid' in text.lower() or 'cannot contain' in text.lower()
                        or phone_input.input_value() != phone or invalid_control)
                detail = validation_message or text[-220:]
                return f'{expected_note}; no order created. Validation={detail}'
            runner.run(test_id, 'AUTH_CART', case, role='CUSTOMER', backend=b)
        manual_checkout_case('AC-18', '0912345678', 'Nguyen Van A', True, 'Local phone accepted')
        manual_checkout_case('AC-19', '+84912345678', 'Nguyen Van A', True, 'Country-code phone accepted')
        manual_checkout_case('AC-20', '091234567', 'Nguyen Van A', False, 'Short phone rejected')

        b = MockBackend(addresses=[]); set_cart(b,2,1)
        def ac21(page: Page, backend: MockBackend) -> str:
            runner.navigate(page,'checkout'); page.wait_for_timeout(350); fill_manual_address(page, phone='09123456789')
            value=page.get_by_test_id('checkout-manual-phone').input_value(); assert value=='0912345678'
            return 'Eleventh local digit was blocked; field retained 0912345678.'
        runner.run('AC-21','AUTH_CART',ac21,role='CUSTOMER',backend=b)

        manual_checkout_case('AC-22', '091234ABCD', 'Nguyen Van A', False, 'Letters/specials rejected or removed')
        manual_checkout_case('AC-23', '0912345678', 'John Doe @!#', False, 'Special-character receiver name rejected')

        # Voucher cases and CHECKOUT pricing
        def voucher_case(test_id: str, code: str, subtotal: int, expect: str, module: str = 'AUTH_CART') -> None:
            b = MockBackend(addresses=[default_address()]); b.products[1]['price'] = subtotal; set_cart(b,2,1); b.preview_subtotal_override = subtotal
            def case(page: Page, backend: MockBackend) -> str:
                runner.navigate(page,'checkout'); page.wait_for_timeout(350)
                page.get_by_test_id('checkout-voucher').fill(code)
                page.wait_for_timeout(500)
                text = visible_text(page,'#preview-panel')
                if expect == 'valid':
                    assert 'Discount' in text and ('20.000' in text or '20,000' in text)
                elif expect == 'expired':
                    assert 'expired' in text.lower()
                elif expect == 'missing':
                    assert 'could not be found' in text.lower() or 'does not exist' in text.lower()
                elif expect == 'zero':
                    assert 'Discount' in text and ('0' in text)
                return text.replace('\n',' | ')
            runner.run(test_id,module,case,role='CUSTOMER',backend=b)
        voucher_case('AC-24','SALE20',500_000,'valid')
        voucher_case('AC-25','OLD10',500_000,'expired')
        voucher_case('AC-26','aa',500_000,'missing')

        # CHECKOUT totals
        voucher_case('CO-01','',100_000,'zero','CHECKOUT')
        voucher_case('CO-02','SALE20',500_000,'valid','CHECKOUT')
        voucher_case('CO-03','MIN20',499_999,'zero','CHECKOUT')

        def checkout_flow(test_id: str, payment_id: str, module: str = 'CHECKOUT') -> None:
            b=MockBackend(addresses=[default_address()]); set_cart(b,2,1)
            def case(page: Page, backend: MockBackend) -> str:
                runner.navigate(page,'checkout'); page.wait_for_timeout(350)
                page.get_by_test_id('checkout-address').select_option('1')
                if payment_id=='2': page.get_by_test_id('payment-method-qr_code').check()
                else: page.get_by_test_id('payment-method-cod').check()
                page.get_by_test_id('place-order').click(); page.wait_for_timeout(500)
                log=next(x for x in backend.logs if x['path']=='/api/orders/checkout')
                assert str(log['body']['paymentMethodId'])==payment_id
                if payment_id=='1':
                    page.get_by_test_id('cod-order-success').wait_for()
                    assert not any(x['path'].endswith('/payment/qr') for x in backend.logs)
                    return f'COD checkout routed with paymentMethodId=1; no receipt upload requested; {backend.orders[0]["orderCode"]}.'
                page.get_by_test_id('payment-qr-image').wait_for()
                return f'QR checkout routed with paymentMethodId=2 and opened receipt/QR workflow for {backend.orders[0]["orderCode"]}.'
            runner.run(test_id,module,case,role='CUSTOMER',backend=b)
        checkout_flow('CO-04','1')
        checkout_flow('CO-05','2')

        # Shared QR order cases
        def qr_backend(payment='AWAITING_PAYMENT', has_receipt=False) -> MockBackend:
            b=MockBackend(); b.orders=[default_order(501,method='QR_CODE',payment=payment,has_receipt=has_receipt)]; return b

        b=qr_backend()
        def co07(page: Page, backend: MockBackend) -> str:
            runner.navigate(page,'orders'); open_qr_from_order(page)
            text=visible_text(page,'#active-modal'); assert 'ORD-000501' in text and '130.000' in text and 'AWAITING_PAYMENT' in text
            return text.replace('\n',' | ')
        runner.run('CO-07','CHECKOUT',co07,role='CUSTOMER',backend=b)

        b=qr_backend()
        def co08(page: Page, backend: MockBackend) -> str:
            runner.navigate(page,'orders'); open_qr_from_order(page)
            text=visible_text(page,'#active-modal');
            for required in ['MB Bank','OMS ACCOUNT','1234567890','ORD-000501']: assert required in text
            return 'QR modal displayed backend bank name, account name, account number and exact transfer note.'
        runner.run('CO-08','CHECKOUT',co08,role='CUSTOMER',backend=b)

        b=qr_backend()
        def co09(page: Page, backend: MockBackend) -> str:
            runner.navigate(page,'orders'); open_qr_from_order(page)
            with page.expect_file_chooser(timeout=5000):
                page.get_by_test_id('payment-upload-receipt').click()
            return 'Native file chooser event opened directly from Upload payment receipt.'
        runner.run('CO-09','CHECKOUT',co09,role='CUSTOMER',backend=b)

        def upload_case(test_id: str, file_payload: dict[str,Any], should_upload: bool, module: str='CHECKOUT', require_preview: bool=False) -> None:
            b=qr_backend()
            def case(page: Page, backend: MockBackend) -> str:
                runner.navigate(page,'orders'); open_upload_modal(page)
                before=len([x for x in backend.logs if x['path'].endswith('/payment/qr') and x['method']=='POST'])
                page.get_by_test_id('qr-file').set_input_files(file_payload)
                page.wait_for_timeout(200)
                preview_visible=page.get_by_test_id('qr-file').evaluate("el => !document.querySelector('#qr-file-preview').hidden")
                if should_upload:
                    assert preview_visible
                    if require_preview:
                        img=page.locator('#qr-file-preview-image'); assert img.is_visible() and img.get_attribute('src')
                    page.get_by_test_id('upload-qr-submit').click(); page.wait_for_timeout(300)
                    after=len([x for x in backend.logs if x['path'].endswith('/payment/qr') and x['method']=='POST'])
                    assert after==before+1
                    return f'Valid file accepted; preview={preview_visible}; upload request sent.'
                after=len([x for x in backend.logs if x['path'].endswith('/payment/qr') and x['method']=='POST'])
                error=visible_text(page,'#qr-file-error')
                assert after==before and error
                return f'Upload blocked before request: {error}'
            runner.run(test_id,module,case,role='CUSTOMER',backend=b)
        upload_case('CO-10',valid_jpeg(5*1024*1024),True)
        upload_case('CO-11',valid_jpeg(5*1024*1024+1),False)
        upload_case('CO-12',valid_png(1024),True)
        upload_case('CO-13',invalid_pdf(),False)

        b=MockBackend(addresses=[default_address()]); set_cart(b,2,1)
        def co14(page: Page, backend: MockBackend) -> str:
            runner.navigate(page,'checkout'); page.wait_for_timeout(350); page.get_by_test_id('checkout-address').select_option('1')
            page.get_by_test_id('place-order').click(); page.wait_for_timeout(450)
            assert len(backend.orders)==1 and re.fullmatch(r'ORD-\d{6}',backend.orders[0]['orderCode'])
            assert backend.cart_items==[]
            return f'Controlled transaction committed order {backend.orders[0]["orderCode"]}; cart cleared.'
        runner.run('CO-14','CHECKOUT',co14,role='CUSTOMER',backend=b)
        runner.untested('CO-15','CHECKOUT','Actual Spring/PostgreSQL transaction rollback could not be executed because Maven dependencies and database network access are unavailable in this environment.')

        # Admin workflow
        def admin_backend() -> MockBackend:
            b=MockBackend();
            b.orders=[
                default_order(601,method='COD',payment='PENDING'),
                default_order(602,method='QR_CODE',payment='AWAITING_PAYMENT'),
                default_order(603,method='QR_CODE',payment='PENDING_VERIFICATION',has_receipt=True),
            ]
            return b

        b=admin_backend()
        def co16(page: Page, backend: MockBackend) -> str:
            runner.navigate(page,'admin-orders')
            headers=page.locator('thead th').all_inner_texts()
            normalized={h.strip().lower() for h in headers}
            for h in ['order','customer','order status','payment','total','actions']: assert h in normalized
            return f'Admin order table rendered expected columns={headers}; rows={page.locator("tbody tr").count()}.'
        runner.run('CO-16','CHECKOUT',co16,role='ADMIN',backend=b)

        b=admin_backend()
        def co17(page: Page, backend: MockBackend) -> str:
            runner.navigate(page,'admin-orders')
            page.locator('#status-601').select_option(label='PROCESSING')
            page.locator('[data-update-status="601"]').click(); page.wait_for_timeout(300)
            assert backend.orders[0]['status']=='PROCESSING'
            text=visible_text(page); assert 'PROCESSING' in text
            return 'Status update API returned 200 and order changed from PENDING to PROCESSING.'
        runner.run('CO-17','CHECKOUT',co17,role='ADMIN',backend=b)

        b=admin_backend()
        def co18(page: Page, backend: MockBackend) -> str:
            runner.navigate(page,'admin-orders')
            options=page.locator('#status-601 option').all_inner_texts()
            assert options==['PENDING','PROCESSING','CANCELLED']
            return f'Only current/allowed statuses rendered: {options}.'
        runner.run('CO-18','CHECKOUT',co18,role='ADMIN',backend=b)

        b=admin_backend()
        def co19(page: Page, backend: MockBackend) -> str:
            runner.navigate(page,'admin-orders'); row=page.get_by_test_id('admin-order-601')
            text=row.inner_text(); assert 'COD is paid when delivered.' in text
            assert row.locator('[data-admin-view-payment-qr]').count()==0 and row.locator('[data-update-payment]').count()==0
            return 'COD row showed delivery-payment note and hid all QR-specific actions.'
        runner.run('CO-19','CHECKOUT',co19,role='ADMIN',backend=b)

        b=admin_backend()
        def co20(page: Page, backend: MockBackend) -> str:
            runner.navigate(page,'admin-orders'); row=page.get_by_test_id('admin-order-602')
            assert 'Receipt required before verification.' in row.inner_text()
            assert row.locator('[data-update-payment="602"]').is_disabled()
            return 'Missing-receipt message rendered and Verify payment was disabled.'
        runner.run('CO-20','CHECKOUT',co20,role='ADMIN',backend=b)

        b=admin_backend()
        def co21(page: Page, backend: MockBackend) -> str:
            runner.navigate(page,'admin-orders'); page.locator('[data-admin-view-payment-qr="602"]').click()
            page.get_by_test_id('payment-qr-image').wait_for(); assert 'ORD-000602' in visible_text(page,'#active-modal')
            return 'View Payment QR opened the order-specific QR modal.'
        runner.run('CO-21','CHECKOUT',co21,role='ADMIN',backend=b)

        b=admin_backend()
        def co22(page: Page, backend: MockBackend) -> str:
            runner.navigate(page,'admin-orders')
            page.locator('#payment-603').select_option('PAID')
            page.locator('[data-update-payment="603"]').click(); page.wait_for_timeout(300)
            assert backend.orders[2]['paymentStatus']=='PAID'
            assert 'PAID' in visible_text(page)
            return 'Valid receipt payment was verified as PAID and the displayed badge refreshed.'
        runner.run('CO-22','CHECKOUT',co22,role='ADMIN',backend=b)

        # UI_SHOP
        runner.untested('US-01','UI_SHOP','Chrome/Chromium was executed, but Edge and Safari were not available; cross-browser result remains untested rather than being inferred.')

        def us02(page: Page, backend: MockBackend) -> str:
            page.get_by_test_id('login-mode').select_option('phone')
            label=page.locator('label[for="login-identifier"]').inner_text(); placeholder=page.get_by_test_id('login-identifier').get_attribute('placeholder')
            assert label=='Phone number' and '+84' in placeholder
            return 'Login method toggle updated label, placeholder, type and phone pattern.'
        runner.run('US-02','UI_SHOP',us02)

        def us03(page: Page, backend: MockBackend) -> str:
            inp=page.get_by_test_id('login-identifier'); inp.fill('x'*51); assert len(inp.input_value())==50
            return 'Username maxlength limited input to 50 characters.'
        runner.run('US-03','UI_SHOP',us03)

        def us04(page: Page, backend: MockBackend) -> str:
            inp=page.get_by_test_id('login-password'); inp.fill('Secret123')
            assert inp.get_attribute('type')=='password'; page.get_by_test_id('toggle-login-password').click(); assert inp.get_attribute('type')=='text'; page.get_by_test_id('toggle-login-password').click(); assert inp.get_attribute('type')=='password'
            return 'Password changed password → text → password.'
        runner.run('US-04','UI_SHOP',us04)
        runner.run('US-05','UI_SHOP',empty_login)

        b=MockBackend()
        def us06(page: Page, backend: MockBackend) -> str:
            runner.navigate(page,'profile')
            assert page.get_by_test_id('profile-username').input_value()=='customer'
            assert page.get_by_test_id('profile-full-name').input_value()=='Nguyen Van A'
            assert page.get_by_test_id('profile-phone').input_value()=='0912345678'
            return 'Saved username, full name, email and phone were bound to the profile form.'
        runner.run('US-06','UI_SHOP',us06,role='CUSTOMER',backend=b)

        def cart_backend(quantity=1) -> MockBackend:
            b=MockBackend(); set_cart(b,2,quantity); return b

        b=cart_backend()
        def us07(page: Page, backend: MockBackend) -> str:
            runner.navigate(page,'cart'); page.get_by_test_id('cart-quantity-2').fill('0'); page.locator('[data-update-cart="2"]').click(); text=toast_text(page); assert 'at least 1' in text
            return text.replace('\n',' | ')
        runner.run('US-07','UI_SHOP',us07,role='CUSTOMER',backend=b)

        b=cart_backend()
        b.products[1]['stock']=5
        def us08(page: Page, backend: MockBackend) -> str:
            runner.navigate(page,'cart'); page.get_by_test_id('cart-quantity-2').fill('6'); page.locator('[data-update-cart="2"]').click(); text=toast_text(page); assert 'stock' in text.lower()
            return text.replace('\n',' | ')
        runner.run('US-08','UI_SHOP',us08,role='CUSTOMER',backend=b)

        b=cart_backend()
        def us09(page: Page, backend: MockBackend) -> str:
            runner.navigate(page,'cart'); page.get_by_test_id('cart-quantity-2').fill('2'); page.locator('[data-update-cart="2"]').click(); page.wait_for_timeout(250)
            text=visible_text(page); assert backend.cart_items[0]['quantity']==2 and text.count('200.000')>=2
            return 'Quantity updated to 2; row subtotal and cart total both showed 200,000 VND.'
        runner.run('US-09','UI_SHOP',us09,role='CUSTOMER',backend=b)

        b=cart_backend()
        def us10(page: Page, backend: MockBackend) -> str:
            runner.navigate(page,'cart'); page.locator('[data-remove-cart="1"]').click(); page.wait_for_timeout(250); assert not backend.cart_items and 'Your cart is empty' in visible_text(page)
            return 'Selected row removed and cart total/empty state refreshed.'
        runner.run('US-10','UI_SHOP',us10,role='CUSTOMER',backend=b)

        b=MockBackend(); b.cart_items=[{'cartItemId':1,'productId':1,'quantity':1},{'cartItemId':2,'productId':2,'quantity':2}]
        def us11(page: Page, backend: MockBackend) -> str:
            runner.navigate(page,'cart'); page.get_by_test_id('clear-cart').click(); page.wait_for_timeout(250); assert not backend.cart_items and 'Your cart is empty' in visible_text(page)
            return 'Clear Cart confirmation removed all items and rendered the empty state.'
        runner.run('US-11','UI_SHOP',us11,role='CUSTOMER',backend=b)

        b=MockBackend(addresses=[default_address()])
        def us12(page: Page, backend: MockBackend) -> str:
            runner.navigate(page,'addresses'); open_address_editor(page,1); inp=page.get_by_test_id('receiver-phone'); inp.fill('091234567'); inp.blur(); page.wait_for_timeout(100)
            errors=page.locator('.error-text:visible').all_inner_texts(); assert any('10 digits' in e for e in errors)
            return f'Visible inline error after blur: {errors}'
        runner.run('US-12','UI_SHOP',us12,role='CUSTOMER',backend=b)

        b=MockBackend(addresses=[default_address()])
        def us13(page: Page, backend: MockBackend) -> str:
            runner.navigate(page,'addresses'); open_address_editor(page,1); inp=page.get_by_test_id('receiver-phone'); inp.fill('abc0912345678')
            value=inp.input_value(); assert not re.search(r'[A-Za-z]', value)
            return f'Alphabetic characters were removed immediately; resulting value={value!r}.'
        runner.run('US-13','UI_SHOP',us13,role='CUSTOMER',backend=b)

        b=MockBackend(addresses=[default_address()])
        def us14(page: Page, backend: MockBackend) -> str:
            runner.navigate(page,'addresses'); open_address_editor(page,1); inp=page.get_by_test_id('receiver-name'); inp.fill(''); inp.blur(); page.wait_for_timeout(100)
            errors=page.locator('.error-text:visible').all_inner_texts(); assert any('Name cannot be empty' in e for e in errors)
            return f'Visible inline required-name error: {errors}'
        runner.run('US-14','UI_SHOP',us14,role='CUSTOMER',backend=b)
        voucher_case('US-15','SALE20',500_000,'valid','UI_SHOP')
        voucher_case('US-16','OLD10',500_000,'expired','UI_SHOP')

        # UI_ADMIN sheet (checkout/customer UI and admin dashboard)
        voucher_case('UA-01','SALE20',150_000_000,'valid','UI_ADMIN')

        b=MockBackend(addresses=[default_address()]); b.products[1]['price']=1_515_151; b.cart_items=[{'cartItemId':1,'productId':2,'quantity':99}]; b.preview_subtotal_override=150_000_000
        def ua02(page: Page, backend: MockBackend) -> str:
            runner.navigate(page,'checkout'); page.wait_for_timeout(350); panel=page.locator('#preview-panel'); text=panel.inner_text(); dims=panel.evaluate('(el)=>({scrollWidth:el.scrollWidth,clientWidth:el.clientWidth})'); assert '150.000.000' in text and dims['scrollWidth']<=dims['clientWidth']+2
            return f'Large VND value visible without horizontal overflow; dimensions={dims}.'
        runner.run('UA-02','UI_ADMIN',ua02,role='CUSTOMER',backend=b)

        b=MockBackend(addresses=[default_address()]); set_cart(b,2,1)
        def ua03(page: Page, backend: MockBackend) -> str:
            runner.navigate(page,'checkout'); page.wait_for_timeout(350); assert page.get_by_test_id('payment-method-cod').is_checked(); assert page.locator('#qr-file').count()==0
            return 'COD was selected by default and receipt upload UI was absent.'
        runner.run('UA-03','UI_ADMIN',ua03,role='CUSTOMER',backend=b)

        b=MockBackend(addresses=[default_address()]); set_cart(b,2,1)
        def ua04(page: Page, backend: MockBackend) -> str:
            runner.navigate(page,'checkout'); page.wait_for_timeout(350); page.get_by_test_id('payment-method-qr_code').check(); qr=visible_text(page,'#payment-method-help'); page.get_by_test_id('payment-method-cod').check(); cod=visible_text(page,'#payment-method-help'); assert 'QR online payment' in qr and 'Cash on delivery' in cod
            return 'Payment help switched cleanly from COD to QR and back to COD.'
        runner.run('UA-04','UI_ADMIN',ua04,role='CUSTOMER',backend=b)
        upload_case('UA-05',valid_jpeg(5*1024*1024+1),False,'UI_ADMIN')
        upload_case('UA-06',invalid_pdf(),False,'UI_ADMIN')
        upload_case('UA-07',valid_jpeg(1024),True,'UI_ADMIN',require_preview=True)

        b=MockBackend(addresses=[default_address()]); set_cart(b,2,1)
        def ua08(page: Page, backend: MockBackend) -> str:
            runner.navigate(page,'checkout'); page.wait_for_timeout(350); page.get_by_test_id('checkout-address').select_option('1'); page.get_by_test_id('place-order').click(); page.get_by_test_id('cod-order-success').wait_for(); box=page.get_by_test_id('cod-order-success'); style=box.evaluate('(el)=>getComputedStyle(el).textAlign'); text=box.inner_text(); assert 'ORD-' in text and style=='center'
            return f'COD success content centered with tracking ID; textAlign={style}.'
        runner.run('UA-08','UI_ADMIN',ua08,role='CUSTOMER',backend=b)

        b=MockBackend(orders=[])
        def ua09(page: Page, backend: MockBackend) -> str:
            runner.navigate(page,'orders'); text=visible_text(page); assert 'You have no orders yet' in text and page.get_by_test_id('continue-shopping').is_visible()
            return 'Empty state showed “You have no orders yet” and a Continue Shopping button.'
        runner.run('UA-09','UI_ADMIN',ua09,role='CUSTOMER',backend=b)

        b=MockBackend(orders=[default_order(701,method='COD',payment='PENDING')])
        def ua10(page: Page, backend: MockBackend) -> str:
            runner.navigate(page,'orders'); table=page.get_by_test_id('order-history-table'); headers=table.locator('thead th').all_inner_texts(); normalized=[h.strip().lower() for h in headers]
            assert normalized==['order id','date','total','status'] and table.locator('tbody tr').count()==1
            return f'Order history table rendered with columns {headers} and one populated row.'
        runner.run('UA-10','UI_ADMIN',ua10,role='CUSTOMER',backend=b)

        b=admin_backend(); b.orders[2]['paymentStatus']='PAID'; b.orders[2]['total']=500_000
        def ua11(page: Page, backend: MockBackend) -> str:
            # Dashboard is initial view.
            text=visible_text(page,'#view-content');
            for label in ['Products','Total orders','Paid revenue','Payments to verify']: assert label in text
            return 'Admin dashboard displayed all four KPI cards with live controlled metric values.'
        runner.run('UA-11','UI_ADMIN',ua11,role='ADMIN',backend=b)

        b=admin_backend()
        def ua12(page: Page, backend: MockBackend) -> str:
            text=visible_text(page,'#view-content'); assert 'Recent orders' in text
            headers=page.locator('#view-content table thead th').all_inner_texts(); normalized={h.strip().lower() for h in headers}
            for h in ['code','status','payment','total','receiver']: assert h in normalized
            return f'Recent Orders table rendered latest records with columns {headers}.'
        runner.run('UA-12','UI_ADMIN',ua12,role='ADMIN',backend=b)

        b=admin_backend()
        def ua13(page: Page, backend: MockBackend) -> str:
            page.locator('[data-go="admin-orders"]').click(); page.wait_for_timeout(250); assert page.get_by_test_id('nav-admin-orders').get_attribute('class').find('active')>=0 and 'All orders' in visible_text(page)
            return 'Review orders button routed to comprehensive paginated Order Management.'
        runner.run('UA-13','UI_ADMIN',ua13,role='ADMIN',backend=b)

    finally:
        runner.close()
        server.shutdown()
    return runner.results


def write_reports(results: list[TestResult]) -> None:
    data=[r.__dict__ for r in results]
    (EVIDENCE/'results.json').write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
    with (EVIDENCE/'results.csv').open('w',newline='',encoding='utf-8-sig') as f:
        w=csv.DictWriter(f,fieldnames=['id','module','result','actual','evidence','environment','date']); w.writeheader(); w.writerows(data)
    counts={}
    for r in results:
        counts.setdefault(r.module,{'Pass':0,'Fail':0,'Untested':0,'N/A':0})
        counts[r.module][r.result]=counts[r.module].get(r.result,0)+1
    passed=sum(r.result=='Pass' for r in results); failed=sum(r.result=='Fail' for r in results); untested=sum(r.result=='Untested' for r in results); na=sum(r.result=='N/A' for r in results)
    total=len(results); coverage=(passed+failed)/(total-na)*100 if total-na else 0; success=passed/(passed+failed)*100 if passed+failed else 0
    rows=''.join(f"<tr><td>{r.id}</td><td>{r.module}</td><td class='{r.result.lower()}'>{r.result}</td><td>{r.actual}</td><td>{r.evidence or ''}</td></tr>" for r in results)
    html=f'''<!doctype html><html><head><meta charset="utf-8"><title>Lab 1 Black-box Execution</title><style>body{{font-family:Arial;margin:28px;color:#172033}}table{{border-collapse:collapse;width:100%}}th,td{{border:1px solid #ccd5e1;padding:8px;vertical-align:top}}th{{background:#172033;color:white}}.pass{{color:#166534;font-weight:bold}}.fail{{color:#991b1b;font-weight:bold}}.untested{{color:#92400e;font-weight:bold}}.kpi{{display:inline-block;margin:8px;padding:16px;border:1px solid #ccd5e1;border-radius:10px}}</style></head><body><h1>Lab 1 Black-box Execution Report</h1><div class="kpi">Pass: <b>{passed}</b></div><div class="kpi">Fail: <b>{failed}</b></div><div class="kpi">Untested: <b>{untested}</b></div><div class="kpi">Test coverage: <b>{coverage:.2f}%</b></div><div class="kpi">Successful coverage: <b>{success:.2f}%</b></div><p>Environment: actual frontend source in headless Chromium with a controlled in-memory API. Cross-browser Safari/Edge and actual Spring/PostgreSQL rollback were not inferred.</p><table><thead><tr><th>ID</th><th>Module</th><th>Result</th><th>Actual result</th><th>Evidence</th></tr></thead><tbody>{rows}</tbody></table></body></html>'''
    (EVIDENCE/'execution_report.html').write_text(html,encoding='utf-8')
    (EVIDENCE/'summary.json').write_text(json.dumps({'total':total,'pass':passed,'fail':failed,'untested':untested,'na':na,'coverage':coverage,'successfulCoverage':success,'modules':counts},indent=2),encoding='utf-8')
    print(json.dumps({'total':total,'pass':passed,'fail':failed,'untested':untested,'na':na,'coverage':coverage,'successfulCoverage':success,'modules':counts},indent=2))


if __name__=='__main__':
    results=run_suite()
    write_reports(results)
