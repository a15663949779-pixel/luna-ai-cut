import * as http from 'node:http'
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { networkInterfaces } from 'node:os'
import { isIPv4 } from 'node:net'

const PHONE_SERVICE_PORT = 47821
const SESSION_LIFETIME_MS = 5 * 60 * 1000
const MAX_BODY_BYTES = 4096
const PHONE_DEVICE_ID = /^luna-mobile-[A-Za-z0-9_-]{20,40}$/
const CLIENT_ID = /^[A-Za-z0-9._:-]{8,128}$/

export interface LunaKaQrPairingPayload {
  type: 'luna-ka-pc-pairing'
  version: 1
  endpoint: string
  endpoints: string[]
  session_id: string
  token: string
  pc_name: string
  expires_at: number
}

export interface LunaKaQrPairingResult {
  deviceId: string
  endpoint: string
}

interface PairingOffer {
  deviceId: string
  remoteAddress: string
  authorizationKey: string
  endpoint: string
}

interface PairingSession {
  id: string
  token: string
  pcClientId: string
  pcName: string
  expiresAt: number
  server: http.Server
  timer: NodeJS.Timeout
  offer: PairingOffer | null
  completion: Promise<LunaKaQrPairingResult>
  resolve: (result: LunaKaQrPairingResult) => void
  reject: (error: Error) => void
  settled: boolean
  saveCredential: (deviceId: string, key: string, endpoint: string) => Promise<void>
}

export class LunaKaQrPairingServer {
  private activeSession: PairingSession | null = null

  async create(
    pcClientId: string,
    pcName: string,
    saveCredential: PairingSession['saveCredential'],
  ): Promise<LunaKaQrPairingPayload> {
    if (!CLIENT_ID.test(pcClientId)) throw new Error('局域网客户端未初始化')
    await this.cancelActive(new Error('配对会话已被新的会话替换'))

    const sessionId = randomUUID()
    const token = randomBytes(32).toString('base64url')
    const server = http.createServer((request, response) => {
      void this.handleRequest(request, response).catch(() => {
        this.writeJson(response, 400, { error: 'invalid-request' })
      })
    })
    server.requestTimeout = 10_000
    server.headersTimeout = 5_000
    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error): void => {
        server.off('listening', onListening)
        reject(error)
      }
      const onListening = (): void => {
        server.off('error', onError)
        resolve()
      }
      server.once('error', onError)
      server.once('listening', onListening)
      server.listen(0, '0.0.0.0')
    })

    const address = server.address()
    if (!address || typeof address === 'string') {
      await this.closeServer(server)
      throw new Error('无法启动电脑配对服务')
    }
    server.unref()
    const expiresAt = Date.now() + SESSION_LIFETIME_MS
    let resolveCompletion!: (result: LunaKaQrPairingResult) => void
    let rejectCompletion!: (error: Error) => void
    const completion = new Promise<LunaKaQrPairingResult>((resolve, reject) => {
      resolveCompletion = resolve
      rejectCompletion = reject
    })
    void completion.catch(() => undefined)

    const session: PairingSession = {
      id: sessionId,
      token,
      pcClientId,
      pcName: pcName.trim().slice(0, 80),
      expiresAt,
      server,
      timer: setTimeout(() => {
        this.finishSession(session, new Error('配对二维码已过期'))
      }, SESSION_LIFETIME_MS),
      offer: null,
      completion,
      resolve: resolveCompletion,
      reject: rejectCompletion,
      settled: false,
      saveCredential,
    }
    session.timer.unref()
    this.activeSession = session

    const port = address.port
    const endpoints = this.getLanAddresses().map((ip) => `http://${ip}:${port}`)
    if (endpoints.length === 0) {
      await this.finishSession(session, new Error('没有可用的局域网 IPv4 地址'))
      throw new Error('没有可用的局域网 IPv4 地址')
    }
    return {
      type: 'luna-ka-pc-pairing',
      version: 1,
      endpoint: endpoints[0],
      endpoints,
      session_id: sessionId,
      token,
      pc_name: session.pcName,
      expires_at: expiresAt,
    }
  }

  wait(sessionId: string): Promise<LunaKaQrPairingResult> {
    const session = this.activeSession
    if (!session || session.id !== sessionId) {
      throw new Error('配对会话已失效')
    }
    return session.completion
  }

  async cancel(sessionId: string): Promise<void> {
    const session = this.activeSession
    if (!session || session.id !== sessionId) return
    await this.finishSession(session, new Error('配对已取消'))
  }

  private async handleRequest(
    request: http.IncomingMessage,
    response: http.ServerResponse,
  ): Promise<void> {
    const session = this.activeSession
    const pathname = new URL(request.url ?? '/', 'http://localhost').pathname
    if (request.method !== 'POST' || !session || Date.now() >= session.expiresAt) {
      this.writeJson(response, 404, { error: 'pairing-session-not-found' })
      return
    }

    const remoteAddress = this.remotePrivateAddress(request)
    if (!remoteAddress) {
      this.writeJson(response, 403, { error: 'private-network-required' })
      return
    }
    const payload = await this.readJson(request, response)
    if (!payload) return
    if (payload.session_id !== session.id || !this.tokenMatches(session, payload.token)) {
      this.writeJson(response, 403, { error: 'invalid-pairing-token' })
      return
    }

    if (pathname === '/api/v1/auth/qr/request') {
      this.handlePairingRequest(session, remoteAddress, payload, response)
      return
    }
    if (pathname === '/api/v1/auth/qr/confirm') {
      await this.handlePairingConfirmation(session, remoteAddress, payload, response)
      return
    }
    this.writeJson(response, 404, { error: 'not-found' })
  }

  private handlePairingRequest(
    session: PairingSession,
    remoteAddress: string,
    payload: Record<string, unknown>,
    response: http.ServerResponse,
  ): void {
    const deviceId = payload.device_id
    const clientName = payload.client_name
    if (
      typeof deviceId !== 'string' || !PHONE_DEVICE_ID.test(deviceId) ||
      typeof clientName !== 'string' || !clientName.trim() || clientName.trim().length > 80
    ) {
      this.writeJson(response, 400, { error: 'invalid-pairing-request' })
      return
    }
    const existing = session.offer
    if (existing && (existing.deviceId !== deviceId || existing.remoteAddress !== remoteAddress)) {
      this.writeJson(response, 409, { error: 'pairing-request-already-claimed' })
      return
    }
    const offer = existing ?? {
      deviceId,
      remoteAddress,
      authorizationKey: randomBytes(32).toString('base64url'),
      endpoint: `http://${remoteAddress}:${PHONE_SERVICE_PORT}`,
    }
    session.offer = offer
    this.writeJson(response, 200, {
      session_id: session.id,
      client_id: session.pcClientId,
      device_id: offer.deviceId,
      client_name: session.pcName,
      authorization_key: offer.authorizationKey,
    })
  }

  private async handlePairingConfirmation(
    session: PairingSession,
    remoteAddress: string,
    payload: Record<string, unknown>,
    response: http.ServerResponse,
  ): Promise<void> {
    const offer = session.offer
    if (
      !offer || offer.remoteAddress !== remoteAddress ||
      payload.device_id !== offer.deviceId || payload.client_id !== session.pcClientId
    ) {
      this.writeJson(response, 409, { error: 'pairing-confirmation-mismatch' })
      return
    }

    try {
      await session.saveCredential(offer.deviceId, offer.authorizationKey, offer.endpoint)
    } catch {
      this.writeJson(response, 500, { error: 'pairing-save-failed' })
      return
    }
    response.writeHead(204, { 'Cache-Control': 'no-store' })
    response.end(() => {
      this.finishSession(session, null, {
        deviceId: offer.deviceId,
        endpoint: offer.endpoint,
      })
    })
  }

  private async readJson(
    request: http.IncomingMessage,
    response: http.ServerResponse,
  ): Promise<Record<string, unknown> | null> {
    const contentType = request.headers['content-type']?.split(';', 1)[0]?.trim().toLowerCase()
    const contentLength = Number(request.headers['content-length'] ?? 0)
    if (contentType !== 'application/json') {
      this.writeJson(response, 415, { error: 'application-json-required' })
      return null
    }
    if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
      this.writeJson(response, 413, { error: 'request-too-large' })
      return null
    }
    const body = await new Promise<Buffer | null>((resolve, reject) => {
      const chunks: Buffer[] = []
      let length = 0
      let settled = false
      request.on('data', (chunk: Buffer | string) => {
        if (settled) return
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
        length += bytes.length
        if (length > MAX_BODY_BYTES) {
          settled = true
          this.writeJson(response, 413, { error: 'request-too-large' })
          resolve(null)
          return
        }
        chunks.push(bytes)
      })
      request.on('end', () => {
        if (settled) return
        settled = true
        resolve(Buffer.concat(chunks))
      })
      request.on('error', (error) => {
        if (settled) return
        settled = true
        reject(error)
      })
    })
    if (!body) return null
    try {
      const value: unknown = JSON.parse(body.toString('utf8'))
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('invalid-json-object')
      }
      return value as Record<string, unknown>
    } catch {
      this.writeJson(response, 400, { error: 'invalid-request' })
      return null
    }
  }

  private tokenMatches(session: PairingSession, value: unknown): boolean {
    if (typeof value !== 'string' || value.length !== session.token.length) return false
    return timingSafeEqual(Buffer.from(session.token), Buffer.from(value))
  }

  private remotePrivateAddress(request: http.IncomingMessage): string | null {
    const raw = request.socket.remoteAddress?.replace(/^::ffff:/, '')
    if (!raw || !isIPv4(raw) || !this.isPrivateIpv4(raw)) return null
    return raw
  }

  private getLanAddresses(): string[] {
    const addresses = new Set<string>()
    for (const entries of Object.values(networkInterfaces())) {
      for (const entry of entries ?? []) {
        if (entry.internal || entry.family !== 'IPv4') continue
        if (!this.isPrivateIpv4(entry.address)) continue
        addresses.add(entry.address)
      }
    }
    return [...addresses].slice(0, 8)
  }

  private isPrivateIpv4(address: string): boolean {
    if (!isIPv4(address)) return false
    const [first, second] = address.split('.').map(Number)
    return first === 10 ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168)
  }

  private writeJson(
    response: http.ServerResponse,
    statusCode: number,
    value: Record<string, unknown>,
  ): void {
    if (response.headersSent || response.writableEnded) return
    const body = JSON.stringify(value)
    response.writeHead(statusCode, {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(body),
    })
    response.end(body)
  }

  private async cancelActive(error: Error): Promise<void> {
    if (this.activeSession) await this.finishSession(this.activeSession, error)
  }

  private async finishSession(
    session: PairingSession,
    error: Error | null,
    result?: LunaKaQrPairingResult,
  ): Promise<void> {
    if (session.settled) return
    session.settled = true
    clearTimeout(session.timer)
    if (this.activeSession === session) this.activeSession = null
    await this.closeServer(session.server)
    if (error) session.reject(error)
    else if (result) session.resolve(result)
  }

  private closeServer(server: http.Server): Promise<void> {
    if (!server.listening) return Promise.resolve()
    return new Promise((resolve) => server.close(() => resolve()))
  }
}
