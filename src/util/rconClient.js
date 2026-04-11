const net = require('net');

/**
 * Minecraft RCON プロトコル実装
 * サーバーにコマンドを送信してレスポンスを受け取る
 */
class RconClient {
    constructor() {
        this.socket = null;
        this.requestId = 0;
        this.connected = false;
        this._pendingCallbacks = new Map();
    }

    /**
     * RCON サーバーに接続・認証
     * @param {string} host
     * @param {number} port
     * @param {string} password
     * @returns {Promise<void>}
     */
    connect(host, port, password) {
        return new Promise((resolve, reject) => {
            if (this.connected) {
                resolve();
                return;
            }

            const timeout = setTimeout(() => {
                reject(new Error(`RCON connection timeout (${host}:${port})`));
                if (this.socket) this.socket.destroy();
            }, 5000);

            this.socket = net.createConnection({ host, port }, () => {
                // 認証パケットを送信
                const id = this._nextId();
                this._send(id, 3, password); // type 3 = login

                this._pendingCallbacks.set(id, (response) => {
                    clearTimeout(timeout);
                    if (response.id === -1) {
                        this.disconnect();
                        reject(new Error('RCON authentication failed'));
                    } else {
                        this.connected = true;
                        resolve();
                    }
                });
            });

            this.socket.on('data', (data) => this._onData(data));

            this.socket.on('error', (err) => {
                clearTimeout(timeout);
                this.connected = false;
                reject(new Error(`RCON error: ${err.message}`));
            });

            this.socket.on('close', () => {
                this.connected = false;
            });
        });
    }

    /**
     * コマンドを送信
     * @param {string} command
     * @returns {Promise<string>} レスポンステキスト
     */
    sendCommand(command) {
        return new Promise((resolve, reject) => {
            if (!this.connected || !this.socket) {
                reject(new Error('RCON not connected'));
                return;
            }

            const id = this._nextId();
            const timeout = setTimeout(() => {
                this._pendingCallbacks.delete(id);
                reject(new Error('RCON command timeout'));
            }, 5000);

            this._pendingCallbacks.set(id, (response) => {
                clearTimeout(timeout);
                resolve(response.body);
            });

            this._send(id, 2, command); // type 2 = command
        });
    }

    disconnect() {
        if (this.socket) {
            this.socket.destroy();
            this.socket = null;
        }
        this.connected = false;
        this._pendingCallbacks.clear();
    }

    // --- 内部メソッド ---

    _nextId() {
        return ++this.requestId;
    }

    _send(id, type, body) {
        const bodyBuf = Buffer.from(body, 'utf8');
        const length = 4 + 4 + bodyBuf.length + 2; // id + type + body + 2 null bytes
        const packet = Buffer.alloc(4 + length);

        packet.writeInt32LE(length, 0);
        packet.writeInt32LE(id, 4);
        packet.writeInt32LE(type, 8);
        bodyBuf.copy(packet, 12);
        packet.writeInt8(0, 12 + bodyBuf.length);
        packet.writeInt8(0, 13 + bodyBuf.length);

        this.socket.write(packet);
    }

    _onData(data) {
        // パケット解析（簡易: 1パケット = 1レスポンスと仮定）
        let offset = 0;
        while (offset < data.length) {
            if (offset + 4 > data.length) break;
            const length = data.readInt32LE(offset);
            if (offset + 4 + length > data.length) break;

            const id = data.readInt32LE(offset + 4);
            // const type = data.readInt32LE(offset + 8);
            const body = data.toString('utf8', offset + 12, offset + 4 + length - 2);

            const callback = this._pendingCallbacks.get(id);
            if (callback) {
                this._pendingCallbacks.delete(id);
                callback({ id, body });
            }

            offset += 4 + length;
        }
    }
}

module.exports = { RconClient };
