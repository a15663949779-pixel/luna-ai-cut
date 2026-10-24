import { ipcMain } from 'electron'

import { LunaKaQrPairingServer } from './lunaka_qr_pairing_server'

interface PairingCoordinatorOptions {
  getIdentity: () => Promise<{ clientId: string; clientName: string }>
  saveCredential: (deviceId: string, key: string, endpoint: string) => Promise<void>
}

export class LunaKaQrPairingIpc {
  private readonly server = new LunaKaQrPairingServer()

  constructor(private readonly options: PairingCoordinatorOptions) {}

  register(): void {
    ipcMain.handle('luna-ka-http-client:qr-pairing:create', async () => {
      const identity = await this.options.getIdentity()
      return this.server.create(
        identity.clientId,
        identity.clientName,
        this.options.saveCredential,
      )
    })
    ipcMain.handle('luna-ka-http-client:qr-pairing:wait', (_event, sessionId: unknown) => {
      if (typeof sessionId !== 'string') throw new Error('配对会话无效')
      return this.server.wait(sessionId)
    })
    ipcMain.handle('luna-ka-http-client:qr-pairing:cancel', (_event, sessionId: unknown) => {
      if (typeof sessionId !== 'string') return
      return this.server.cancel(sessionId)
    })
  }
}
