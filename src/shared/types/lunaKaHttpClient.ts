export type LunaKaHttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export interface LunaKaHttpRequestOptions {
  method?: LunaKaHttpMethod
  body?: unknown
}

export interface LunaKaChannelMessageEvent {
  endpoint: string
  message: unknown
}

export interface LunaKaChannelStatusEvent {
  endpoint: string
  state: 'open' | 'closed' | 'error'
  code?: number
  reason?: string
}

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

export interface LunaKaHttpClientApi {
  hasPairing(endpoint?: string): Promise<boolean>
  connect(endpoint: string): Promise<void>
  createQrPairing(): Promise<LunaKaQrPairingPayload>
  waitQrPairing(sessionId: string): Promise<LunaKaQrPairingResult>
  cancelQrPairing(sessionId: string): Promise<void>
  request<T>(endpoint: string, path: string, options?: LunaKaHttpRequestOptions): Promise<T>
  connectChannel(endpoint: string): Promise<void>
  sendChannelMessage(endpoint: string, message: unknown): Promise<void>
  disconnectChannel(endpoint: string): Promise<void>
  onChannelMessage(callback: (event: LunaKaChannelMessageEvent) => void): () => void
  onChannelStatus(callback: (event: LunaKaChannelStatusEvent) => void): () => void
}
